import { describe, expect, it } from "vitest";
import { classifyDrift, KNOWN_DRIFT_KINDS } from "../src/state-reconciliation/catalog.js";
import { classifyArtifactName } from "../src/state-reconciliation/artifacts.js";
import { applyRepairs, ReconciliationFailedError, reconcileBeforeDispatch } from "../src/state-reconciliation/index.js";
import { readJournalState } from "../src/state-reconciliation/journal.js";
import { readRoadmapState } from "../src/state-reconciliation/roadmap.js";
import { scanPlanningArtifacts } from "../src/state-reconciliation/scan.js";
import { readStateDigest } from "../src/state-reconciliation/state.js";
import { RECONCILIATION_REASON_CODES } from "../src/state-reconciliation/types.js";
import type { ReconciledStateSnapshot, ReconciliationReasonCode, ReconciliationReport } from "../src/state-reconciliation/types.js";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("state reconciliation contracts", () => {
  it("contracts expose the minimal structured report fields", () => {
    const snapshot = {
      phasesPath: ".planning/phases",
      phases: [],
      totals: {
        plans: 0,
        summaries: 0,
        verifications: 0,
        reviews: 0,
        contexts: 0,
        noncanonical: 0,
      },
    } satisfies ReconciledStateSnapshot;

    const report = {
      ok: true,
      snapshot,
      repairs: [],
      blockers: [],
      written: [],
      evidence: [],
    } satisfies ReconciliationReport;

    expect(Object.keys(report).sort()).toEqual(["blockers", "evidence", "ok", "repairs", "snapshot", "written"]);
  });

  it("contracts accept the known drift reason codes", () => {
    const reasonCodes = [
      "sketch-flag-drift",
      "completion-timestamp-drift",
      "roadmap-divergence",
      "stale-worker",
      "unregistered-milestone",
      "summary-count-mismatch",
      "noncanonical-plan-like-file",
      "unknown-drift",
      "partial-write",
    ] satisfies ReconciliationReasonCode[];

    expect(reasonCodes).toContain("summary-count-mismatch");
    expect(reasonCodes).toContain("noncanonical-plan-like-file");
    expect(reasonCodes).toContain("unknown-drift");
    expect(reasonCodes).toContain("partial-write");
    expect(RECONCILIATION_REASON_CODES).toEqual(reasonCodes);
  });

  it("ReconciliationFailedError preserves structured handoff context", () => {
    const blocker = {
      reasonCode: "summary-count-mismatch" as const,
      message: "Phase 10 has a missing summary.",
      artifact: "summary" as const,
      evidence: [{
        reasonCode: "summary-count-mismatch" as const,
        path: ".planning/phases/10-state-reconciliation-module/10-04-PLAN.md",
        message: "Plan exists without matching summary.",
      }],
      suggestedNextAction: "manual-review" as const,
    };
    const repair = {
      reasonCode: "roadmap-divergence" as const,
      action: "update-roadmap-row",
      description: "Update ROADMAP derived metadata.",
      evidence: blocker.evidence,
    };

    const error = new ReconciliationFailedError({
      ok: false,
      snapshot: {
        phasesPath: ".planning/phases",
        phases: [],
        totals: { plans: 1, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 },
      },
      blockers: [blocker],
      repairs: [repair],
      written: [],
      evidence: blocker.evidence,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.reasonCode).toBe("summary-count-mismatch");
    expect(error.blockers).toEqual([blocker]);
    expect(error.repairPlan).toEqual([repair]);
    expect(error.evidence).toEqual(blocker.evidence);
    expect(error.suggestedNextAction).toBe("manual-review");
    expect(error.message).toContain("summary-count-mismatch");
  });

  it("ReconciliationFailedError merges report and blocker evidence for handoff", () => {
    const blockerEvidence = {
      reasonCode: "summary-count-mismatch" as const,
      path: ".planning/phases/10-state-reconciliation-module/10-04-PLAN.md",
      message: "Plan exists without matching summary.",
    };
    const reportEvidence = {
      reasonCode: "noncanonical-plan-like-file" as const,
      path: ".planning/phases/10-state-reconciliation-module/10-PLAN-CHECK.md",
      message: "Noncanonical plan-like artifact is evidence only.",
    };

    const error = new ReconciliationFailedError({
      ok: false,
      snapshot: {
        phasesPath: ".planning/phases",
        phases: [],
        totals: { plans: 1, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 1 },
      },
      blockers: [{
        reasonCode: "summary-count-mismatch",
        message: "Phase 10 has a missing summary.",
        artifact: "summary",
        evidence: [blockerEvidence],
        suggestedNextAction: "manual-review",
      }],
      repairs: [],
      written: [],
      evidence: [reportEvidence],
    });

    expect(error.evidence).toEqual([reportEvidence, blockerEvidence]);
  });

  it("suggested next action values remain category-level only", () => {
    expect(ReconciliationFailedError.suggestedNextActions).toEqual([
      "manual-review",
      "rerun-reconcile",
      "requires-recovery-classification",
    ]);
    expect(ReconciliationFailedError.suggestedNextActions).not.toContain("retry");
    expect(ReconciliationFailedError.suggestedNextActions).not.toContain("self-heal");
    expect(ReconciliationFailedError.suggestedNextActions).not.toContain("stop");
  });
});

describe("canonical artifact classification", () => {
  it("canonical artifact names classify with phase and plan metadata", () => {
    expect(classifyArtifactName("10-01-PLAN.md")).toEqual({
      canonical: true,
      filename: "10-01-PLAN.md",
      kind: "plan",
      phase: "10",
      plan: "01",
    });
    expect(classifyArtifactName("10-01-SUMMARY.md")).toEqual(expect.objectContaining({ canonical: true, kind: "summary", phase: "10", plan: "01" }));
    expect(classifyArtifactName("10-VERIFICATION.md")).toEqual(expect.objectContaining({ canonical: true, kind: "verification", phase: "10" }));
    expect(classifyArtifactName("10-REVIEW.md")).toEqual(expect.objectContaining({ canonical: true, kind: "review", phase: "10" }));
    expect(classifyArtifactName("10-CONTEXT.md")).toEqual(expect.objectContaining({ canonical: true, kind: "context", phase: "10" }));
  });

  it("noncanonical plan-like files are evidence and are not counted as plans", () => {
    const result = classifyArtifactName("09-PLAN-CHECK.md");

    expect(result).toEqual(expect.objectContaining({
      canonical: false,
      filename: "09-PLAN-CHECK.md",
      kind: "noncanonical",
      reasonCode: "noncanonical-plan-like-file",
      phase: "09",
    }));
    expect(result.kind).not.toBe("plan");
  });
});

describe("state reconciliation scanner", () => {
  it("scanner reads canonical phase artifact counts and evidence paths", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-state-scan-"));
    const phaseDir = join(root, ".planning", "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    for (const filename of ["10-01-PLAN.md", "10-01-SUMMARY.md", "10-VERIFICATION.md", "10-REVIEW.md", "10-CONTEXT.md", "10-PLAN-CHECK.md"]) {
      writeFileSync(join(phaseDir, filename), `${filename}\n`, "utf8");
    }

    const scan = scanPlanningArtifacts(root);

    expect(scan.blockers).toEqual([]);
    expect(scan.totals).toEqual({
      plans: 1,
      summaries: 1,
      verifications: 1,
      reviews: 1,
      contexts: 1,
      noncanonical: 1,
    });
    expect(scan.phases[0]).toEqual(expect.objectContaining({
      phase: "10",
      plans: [join(phaseDir, "10-01-PLAN.md")],
      summaries: [join(phaseDir, "10-01-SUMMARY.md")],
    }));
    expect(scan.evidence).toEqual([
      expect.objectContaining({
        reasonCode: "noncanonical-plan-like-file",
        path: join(phaseDir, "10-PLAN-CHECK.md"),
      }),
    ]);
  });

  it("scanner returns a typed blocker when planning artifacts are missing", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-state-missing-"));

    const scan = scanPlanningArtifacts(root);

    expect(scan.phases).toEqual([]);
    expect(scan.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "unknown-drift",
        artifact: "state",
        message: expect.stringContaining(".planning/phases"),
      }),
    ]);
  });
});

describe("state reconciliation structured report", () => {
  it("structured report defaults to dry-run with no writes", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-state-report-"));
    const phaseDir = join(root, ".planning", "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan\n", "utf8");
    writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "summary\n", "utf8");

    const report = reconcileBeforeDispatch(root);

    expect(report.ok).toBe(true);
    expect(report.repairs).toEqual([]);
    expect(report.written).toEqual([]);
    expect(report.snapshot.totals.plans).toBe(1);
  });
});

describe("state reconciliation derived metadata readers", () => {
  it("roadmap phase rows parse plan counts, status, and timestamp", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-roadmap-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(
      join(root, ".planning", "ROADMAP.md"),
      [
        "# Roadmap",
        "",
        "Narrative says Phase 99 is Complete with 9/9 plans, but it is not in the table.",
        "",
        "## Progress",
        "",
        "| Phase | Milestone | Plans Complete | Status | Completed |",
        "|---|---|---|---|---|",
        "| 10. State Reconciliation Module | v2.0 | 1/4 | Executing | 2026-06-01 |",
        "| 11. Worktree Safety | v2.0 | 0/2 | Not started | — |",
      ].join("\n"),
      "utf8",
    );

    const roadmap = readRoadmapState(root);

    expect(roadmap.blockers).toEqual([]);
    expect(roadmap.phases).toEqual([
      expect.objectContaining({
        phase: "10",
        title: "State Reconciliation Module",
        milestone: "v2.0",
        plansComplete: 1,
        totalPlans: 4,
        status: "Executing",
        completed: "2026-06-01",
      }),
      expect.objectContaining({
        phase: "11",
        plansComplete: 0,
        totalPlans: 2,
        completed: undefined,
      }),
    ]);
    expect(roadmap.phases.map((phase) => phase.phase)).not.toContain("99");
  });

  it("state digest parses frontmatter and current-position metadata without treating prose as truth", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-state-digest-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(
      join(root, ".planning", "STATE.md"),
      [
        "---",
        "gsd_state_version: 1.0",
        "status: Executing Phase 10",
        "last_updated: \"2026-06-01T13:52:57.431Z\"",
        "progress:",
        "  total_phases: 7",
        "  completed_phases: 3",
        "  total_plans: 12",
        "  completed_plans: 8",
        "  percent: 43",
        "---",
        "",
        "# Project State",
        "",
        "## Current Position",
        "",
        "Historical note: Phase 99 is complete in old prose.",
        "",
        "Phase: 10 (State Reconciliation Module) — EXECUTING",
        "Plan: 1 of 4",
        "Progress: [#########-----------] 43% (3/7 phases completed, 8/12 completed plans)",
      ].join("\n"),
      "utf8",
    );

    const state = readStateDigest(root);

    expect(state.blockers).toEqual([]);
    expect(state.frontmatter).toEqual(expect.objectContaining({
      gsd_state_version: "1.0",
      status: "Executing Phase 10",
      last_updated: "2026-06-01T13:52:57.431Z",
    }));
    expect(state.frontmatter.progress).toEqual({
      total_phases: 7,
      completed_phases: 3,
      total_plans: 12,
      completed_plans: 8,
      percent: 43,
    });
    expect(state.currentPosition).toEqual(expect.objectContaining({
      phase: "10",
      phaseName: "State Reconciliation Module",
      phaseStatus: "EXECUTING",
      plan: 1,
      totalPlans: 4,
      percent: 43,
    }));
    expect(JSON.stringify(state.currentPosition)).not.toContain("99");
  });

  it("journal reader fails closed on corrupt orchestration-state data without overwriting content", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    const journalPath = join(root, ".planning", "orchestration-state.json");
    writeFileSync(journalPath, "{ definitely not json", "utf8");

    const journal = readJournalState(root);

    expect(journal.ok).toBe(false);
    expect(journal.journal).toBeUndefined();
    expect(journal.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "unknown-drift",
        artifact: "journal",
        message: expect.stringContaining("orchestration-state.json"),
        evidence: [expect.objectContaining({ path: journalPath })],
      }),
    ]);
    expect(readFileSync(journalPath, "utf8")).toBe("{ definitely not json");
  });
});

describe("state reconciliation drift catalog", () => {
  it("summary-count blockers are emitted when canonical plans are missing summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-summary-count-"));
    const phaseDir = join(root, ".planning", "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan 1\n", "utf8");
    writeFileSync(join(phaseDir, "10-02-PLAN.md"), "plan 2\n", "utf8");
    writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "summary 1\n", "utf8");

    const scan = scanPlanningArtifacts(root);
    const drift = classifyDrift({ snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals } });

    expect(drift.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "summary-count-mismatch",
        phase: "10",
        artifact: "summary",
        message: expect.stringContaining("10-02-SUMMARY.md"),
        evidence: [expect.objectContaining({ path: join(phaseDir, "10-02-PLAN.md") })],
      }),
    ]);
    expect(drift.repairs).toEqual([]);
  });

  it("summary-count mismatch does not block the active execute unit", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-summary-count-active-execute-"));
    const phaseDir = join(root, ".planning", "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan 1\n", "utf8");

    const scan = scanPlanningArtifacts(root);
    const drift = classifyDrift({
      snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals },
      activeUnitId: "10:execute",
    });

    expect(drift.blockers).toEqual([]);
  });

  it("roadmap divergence does not block the active execute unit for incomplete phases", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-roadmap-active-execute-"));
    const planningDir = join(root, ".planning");
    const phaseDir = join(planningDir, "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan 1\n", "utf8");
    writeFileSync(join(planningDir, "ROADMAP.md"), "| 10. State Reconciliation Module | v2.0 | 0/0 | Executing | — |\n", "utf8");

    const scan = scanPlanningArtifacts(root);
    const roadmap = readRoadmapState(root);
    const drift = classifyDrift({
      snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals },
      roadmap,
      activeUnitId: "10:execute",
    });

    expect(drift.blockers).toEqual([]);
  });

  it("noncanonical plan-like files produce evidence and never count as plans", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-noncanonical-catalog-"));
    const phaseDir = join(root, ".planning", "phases", "09-auto-orchestration-native-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "09-01-PLAN.md"), "plan\n", "utf8");
    writeFileSync(join(phaseDir, "09-PLAN-CHECK.md"), "check\n", "utf8");

    const scan = scanPlanningArtifacts(root);
    const drift = classifyDrift({ snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals } });

    expect(scan.totals.plans).toBe(1);
    expect(drift.evidence).toEqual([
      expect.objectContaining({
        reasonCode: "noncanonical-plan-like-file",
        path: join(phaseDir, "09-PLAN-CHECK.md"),
      }),
    ]);
    expect(drift.blockers).toEqual([
      expect.objectContaining({ reasonCode: "summary-count-mismatch" }),
    ]);
  });

  it("KNOWN_DRIFT_KINDS includes the D-10 minimum catalog and fallback", () => {
    expect(KNOWN_DRIFT_KINDS).toEqual([
      "sketch-flag-drift",
      "completion-timestamp-drift",
      "roadmap-divergence",
      "stale-worker",
      "unregistered-milestone",
      "summary-count-mismatch",
      "noncanonical-plan-like-file",
      "unknown-drift",
    ]);
  });

  it("roadmap divergence emits repair candidates only when canonical artifacts prove the metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-roadmap-divergence-"));
    const planningDir = join(root, ".planning");
    const phaseDir = join(planningDir, "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan 1\n", "utf8");
    writeFileSync(join(phaseDir, "10-02-PLAN.md"), "plan 2\n", "utf8");
    writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "summary 1\n", "utf8");
    writeFileSync(join(phaseDir, "10-02-SUMMARY.md"), "summary 2\n", "utf8");
    writeFileSync(
      join(planningDir, "ROADMAP.md"),
      [
        "| Phase | Milestone | Plans Complete | Status | Completed |",
        "|---|---|---|---|---|",
        "| 10. State Reconciliation Module | v2.0 | 0/4 | Not started | - |",
      ].join("\n"),
      "utf8",
    );

    const scan = scanPlanningArtifacts(root);
    const roadmap = readRoadmapState(root);
    const drift = classifyDrift({ snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals }, roadmap });

    expect(drift.repairs).toEqual([
      expect.objectContaining({
        reasonCode: "roadmap-divergence",
        action: "update-roadmap-row",
        phase: "10",
        description: expect.stringContaining("2/2"),
      }),
    ]);
    expect(drift.blockers.filter((blocker) => blocker.reasonCode === "roadmap-divergence")).toEqual([]);
  });

  it("roadmap divergence blocks when canonical artifacts do not prove the metadata value", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-roadmap-divergence-block-"));
    const planningDir = join(root, ".planning");
    const phaseDir = join(planningDir, "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan 1\n", "utf8");
    writeFileSync(join(phaseDir, "10-02-PLAN.md"), "plan 2\n", "utf8");
    writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "summary 1\n", "utf8");
    writeFileSync(
      join(planningDir, "ROADMAP.md"),
      [
        "| Phase | Milestone | Plans Complete | Status | Completed |",
        "|---|---|---|---|---|",
        "| 10. State Reconciliation Module | v2.0 | 2/2 | Complete | 2026-06-01 |",
      ].join("\n"),
      "utf8",
    );

    const scan = scanPlanningArtifacts(root);
    const roadmap = readRoadmapState(root);
    const drift = classifyDrift({ snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals }, roadmap });

    expect(drift.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCode: "roadmap-divergence",
        phase: "10",
        artifact: "roadmap",
        message: expect.stringContaining("cannot be mechanically proven"),
      }),
    ]));
  });

  it("completion timestamp drift repairs only when canonical summaries prove the timestamp", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-completion-timestamp-"));
    const planningDir = join(root, ".planning");
    const phaseDir = join(planningDir, "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan\n", "utf8");
    writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "---\ncompleted: 2026-06-01\n---\nsummary\n", "utf8");
    writeFileSync(
      join(planningDir, "ROADMAP.md"),
      [
        "| Phase | Milestone | Plans Complete | Status | Completed |",
        "|---|---|---|---|---|",
        "| 10. State Reconciliation Module | v2.0 | 1/1 | Complete | - |",
      ].join("\n"),
      "utf8",
    );

    const scan = scanPlanningArtifacts(root);
    const roadmap = readRoadmapState(root);
    const drift = classifyDrift({ snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals }, roadmap });

    expect(drift.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCode: "completion-timestamp-drift",
        action: "update-roadmap-completed",
        phase: "10",
        description: expect.stringContaining("2026-06-01"),
      }),
    ]));
  });

  it("completion timestamp drift blocks when canonical summaries do not prove the timestamp", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-completion-timestamp-block-"));
    const planningDir = join(root, ".planning");
    const phaseDir = join(planningDir, "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan\n", "utf8");
    writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "summary without completed frontmatter\n", "utf8");
    writeFileSync(
      join(planningDir, "ROADMAP.md"),
      [
        "| Phase | Milestone | Plans Complete | Status | Completed |",
        "|---|---|---|---|---|",
        "| 10. State Reconciliation Module | v2.0 | 1/1 | Complete | - |",
      ].join("\n"),
      "utf8",
    );

    const scan = scanPlanningArtifacts(root);
    const roadmap = readRoadmapState(root);
    const drift = classifyDrift({ snapshot: { phasesPath: scan.phasesPath, phases: scan.phases, totals: scan.totals }, roadmap });

    expect(drift.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCode: "completion-timestamp-drift",
        phase: "10",
        artifact: "roadmap",
        message: expect.stringContaining("canonical summaries do not prove"),
      }),
    ]));
  });

  it("sketch flag drift blocks when correct sketch metadata is not mechanically provable", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sketch-flag-"));
    const sketchManifest = join(root, ".planning", "sketches", "MANIFEST.md");
    const snapshot = {
      phasesPath: join(root, ".planning", "phases"),
      phases: [],
      totals: { plans: 0, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 },
    };

    const drift = classifyDrift({
      snapshot,
      sketch: { phase: "10", expectedEnabled: true, evidencePaths: [sketchManifest] },
    });

    expect(drift.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "sketch-flag-drift",
        phase: "10",
        artifact: "roadmap",
        message: expect.stringContaining("not mechanically provable"),
        evidence: [expect.objectContaining({ path: sketchManifest })],
      }),
    ]);
  });

  it("stale worker blocks with category-level evidence and does not choose a recovery action", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-stale-worker-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(
      join(root, ".planning", "orchestration-state.json"),
      JSON.stringify({
        version: 1,
        snapshot: {
          status: "running",
          currentUnit: { id: "execute-10-02", type: "execute", phase: "10" },
          remainingUnits: [],
        },
        events: [{ type: "unit-started", ts: "2026-06-01T12:00:00Z", phase: "10", unitId: "execute-10-02" }],
      }),
      "utf8",
    );
    const journal = readJournalState(root);
    const snapshot = {
      phasesPath: join(root, ".planning", "phases"),
      phases: [],
      totals: { plans: 0, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 },
    };

    const drift = classifyDrift({ snapshot, journal });

    expect(drift.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "stale-worker",
        artifact: "journal",
        suggestedNextAction: "requires-recovery-classification",
        evidence: [expect.objectContaining({ path: join(root, ".planning", "orchestration-state.json") })],
      }),
    ]);
    expect(JSON.stringify(drift.blockers)).not.toMatch(/retry|pause|self-heal|stop/);
  });

  it("stale worker detector ignores the currently dispatching active unit", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-active-worker-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(
      join(root, ".planning", "orchestration-state.json"),
      JSON.stringify({
        version: 1,
        snapshot: {
          status: "running",
          currentUnit: { id: "09:plan", type: "plan", phase: "09" },
          remainingUnits: [],
        },
        events: [],
      }),
      "utf8",
    );
    const journal = readJournalState(root);
    const snapshot = {
      phasesPath: join(root, ".planning", "phases"),
      phases: [],
      totals: { plans: 0, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 },
    };

    const drift = classifyDrift({ snapshot, journal, activeUnitId: "09:plan" });

    expect(drift.blockers.filter((blocker) => blocker.reasonCode === "stale-worker")).toEqual([]);
  });

  it("unregistered milestone blocks rather than creating milestone prose", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-unregistered-milestone-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(
      join(root, ".planning", "ROADMAP.md"),
      [
        "| Phase | Milestone | Plans Complete | Status | Completed |",
        "|---|---|---|---|---|",
        "| 10. State Reconciliation Module | v2.0 | 0/4 | Not started | - |",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(root, ".planning", "STATE.md"),
      "---\nmilestone: v3.0\nstatus: Planning\n---\n\n## Current Position\n\nPhase: 10 (State Reconciliation Module)\n",
      "utf8",
    );
    const roadmap = readRoadmapState(root);
    const state = readStateDigest(root);
    const snapshot = {
      phasesPath: join(root, ".planning", "phases"),
      phases: [],
      totals: { plans: 0, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 },
    };

    const drift = classifyDrift({ snapshot, roadmap, state });

    expect(drift.repairs.filter((repair) => repair.reasonCode === "unregistered-milestone")).toEqual([]);
    expect(drift.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "unregistered-milestone",
        artifact: "roadmap",
        message: expect.stringContaining("v3.0"),
      }),
    ]);
  });

  it("unsupported mismatches become unknown drift blockers", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-unknown-drift-"));
    const evidencePath = join(root, ".planning", "STATE.md");
    const snapshot = {
      phasesPath: join(root, ".planning", "phases"),
      phases: [],
      totals: { plans: 0, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 },
    };

    const drift = classifyDrift({
      snapshot,
      unsupportedMismatches: [{ path: evidencePath, message: "STATE progress format is unsupported." }],
    });

    expect(drift.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "unknown-drift",
        artifact: "state",
        message: expect.stringContaining("unsupported"),
        evidence: [expect.objectContaining({ path: evidencePath })],
      }),
    ]);
  });
});

describe("state reconciliation repair planning", () => {
  it("dry-run plan repairs reports repairable metadata drift without writing", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-plan-repairs-dry-run-"));
    const { roadmapPath } = writeCompletePhaseWithRoadmapDrift(root);
    const beforeRoadmap = readFileSync(roadmapPath, "utf8");

    const report = reconcileBeforeDispatch(root);

    expect(report.ok).toBe(true);
    expect(report.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCode: "roadmap-divergence",
        action: "update-roadmap-row",
        path: roadmapPath,
      }),
    ]));
    expect(report.written).toEqual([]);
    expect(readFileSync(roadmapPath, "utf8")).toBe(beforeRoadmap);
  });

  it("dry-run plan repairs omits repair records for blocking drift", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-plan-repairs-blocking-"));
    const planningDir = join(root, ".planning");
    const phaseDir = join(planningDir, "phases", "10-state-reconciliation-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan 1\n", "utf8");
    writeFileSync(join(phaseDir, "10-02-PLAN.md"), "plan 2\n", "utf8");
    writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "summary 1\n", "utf8");

    const report = reconcileBeforeDispatch(root);

    expect(report.ok).toBe(false);
    expect(report.blockers).toEqual([
      expect.objectContaining({ reasonCode: "summary-count-mismatch" }),
    ]);
    expect(report.repairs).toEqual([]);
    expect(report.written).toEqual([]);
  });
});

describe("state reconciliation apply repairs", () => {
  it("apply writes repairable metadata and records written paths", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-apply-repairs-"));
    const { roadmapPath } = writeCompletePhaseWithRoadmapDrift(root);

    const report = reconcileBeforeDispatch(root, { apply: true });

    expect(report.ok).toBe(true);
    expect(report.written).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCode: "roadmap-divergence",
        path: roadmapPath,
        action: "update",
      }),
      expect.objectContaining({
        reasonCode: "completion-timestamp-drift",
        path: roadmapPath,
        action: "update",
      }),
    ]));
    expect(readFileSync(roadmapPath, "utf8")).toContain("| 10. State Reconciliation Module | v2.0 | 2/2 | Complete | 2026-06-01 |");
  });

  it("apply is idempotent on second run and produces no additional writes", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-apply-idempotent-"));
    const { roadmapPath } = writeCompletePhaseWithRoadmapDrift(root);

    const first = reconcileBeforeDispatch(root, { apply: true });
    const afterFirst = readFileSync(roadmapPath, "utf8");
    const second = reconcileBeforeDispatch(root, { apply: true });

    expect(first.written.length).toBeGreaterThan(0);
    expect(second.ok).toBe(true);
    expect(second.repairs).toEqual([]);
    expect(second.written).toEqual([]);
    expect(readFileSync(roadmapPath, "utf8")).toBe(afterFirst);
  });

  it("apply refuses repair targets outside .planning", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-apply-confined-"));
    mkdirSync(join(root, ".planning"), { recursive: true });

    const result = applyRepairs(root, [{
      reasonCode: "roadmap-divergence",
      action: "update-roadmap-row",
      description: "Attempt to repair a source file.",
      path: join(root, "src", "index.ts"),
      evidence: [],
    }]);

    expect(result.ok).toBe(false);
    expect(result.written).toEqual([]);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "unknown-drift",
        message: expect.stringContaining("outside .planning"),
      }),
    ]);
  });

  it("applyRepairs writes ROADMAP STATE and journal metadata repair kinds", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-apply-metadata-kinds-"));
    const planningDir = join(root, ".planning");
    mkdirSync(planningDir, { recursive: true });
    const roadmapPath = join(planningDir, "ROADMAP.md");
    const statePath = join(planningDir, "STATE.md");
    const journalPath = join(planningDir, "orchestration-state.json");
    writeFileSync(
      roadmapPath,
      [
        "| Phase | Milestone | Plans Complete | Status | Completed |",
        "|---|---|---|---|---|",
        "| 10. State Reconciliation Module | v2.0 | 0/1 | Not started | - |",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(statePath, "---\nstatus: stale\n---\n\n## Current Position\n\nPlan: 0 of 1\n", "utf8");
    writeFileSync(journalPath, JSON.stringify({ version: 1, snapshot: { reconciliation: { status: "stale" } }, events: [] }, null, 2), "utf8");

    const result = applyRepairs(root, [
      {
        kind: "roadmap",
        reasonCode: "roadmap-divergence",
        action: "update-roadmap-row",
        description: "Update ROADMAP row.",
        path: roadmapPath,
        evidence: [{
          reasonCode: "roadmap-divergence",
          path: roadmapPath,
          message: "ROADMAP metadata drift.",
          metadata: { line: 3, canonicalSummaries: 1, canonicalPlans: 1 },
        }],
      },
      {
        kind: "state",
        reasonCode: "roadmap-divergence",
        action: "update-state-metadata",
        description: "Update STATE metadata.",
        path: statePath,
        before: "status: stale",
        after: "status: fresh",
        evidence: [],
      },
      {
        kind: "journal",
        reasonCode: "stale-worker",
        action: "update-journal-metadata",
        description: "Update journal metadata.",
        path: journalPath,
        before: '"status": "stale"',
        after: '"status": "fresh"',
        evidence: [],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.written).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "roadmap", path: roadmapPath }),
      expect.objectContaining({ kind: "state", path: statePath }),
      expect.objectContaining({ kind: "journal", path: journalPath }),
    ]));
    expect(readFileSync(roadmapPath, "utf8")).toContain("| 10. State Reconciliation Module | v2.0 | 1/1 | Complete | - |");
    expect(readFileSync(statePath, "utf8")).toContain("status: fresh");
    expect(readFileSync(journalPath, "utf8")).toContain('"status": "fresh"');
  });
});

describe("state reconciliation partial-write reporting", () => {
  it("partial-write returns ok false and preserves already-written paths", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-partial-write-"));
    const { roadmapPath } = writeCompletePhaseWithRoadmapDrift(root);
    const originalRoadmap = readFileSync(roadmapPath, "utf8");
    const memory = new Map<string, string>([[roadmapPath, originalRoadmap]]);
    let writeCount = 0;

    const report = reconcileBeforeDispatch(root, {
      apply: true,
      fileSystem: {
        exists: (path) => memory.has(path),
        readFile: (path) => {
          const content = memory.get(path);
          if (content === undefined) throw new Error(`missing ${path}`);
          return content;
        },
        writeFile: (path, content) => {
          if (writeCount++ === 1) throw new Error("simulated write failure");
          memory.set(path, content);
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.blockers).toEqual([
      expect.objectContaining({
        reasonCode: "partial-write",
        message: expect.stringContaining("simulated write failure"),
      }),
    ]);
    expect(report.written).toEqual([
      expect.objectContaining({
        path: roadmapPath,
        action: "update",
      }),
    ]);
    expect(readFileSync(roadmapPath, "utf8")).toBe(originalRoadmap);
  });
});

function writeCompletePhaseWithRoadmapDrift(root: string): { roadmapPath: string } {
  const planningDir = join(root, ".planning");
  const phaseDir = join(planningDir, "phases", "10-state-reconciliation-module");
  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(join(phaseDir, "10-01-PLAN.md"), "plan 1\n", "utf8");
  writeFileSync(join(phaseDir, "10-02-PLAN.md"), "plan 2\n", "utf8");
  writeFileSync(join(phaseDir, "10-01-SUMMARY.md"), "---\ncompleted: 2026-06-01\n---\nsummary 1\n", "utf8");
  writeFileSync(join(phaseDir, "10-02-SUMMARY.md"), "---\ncompleted: 2026-06-01\n---\nsummary 2\n", "utf8");
  const roadmapPath = join(planningDir, "ROADMAP.md");
  writeFileSync(
    roadmapPath,
    [
      "| Phase | Milestone | Plans Complete | Status | Completed |",
      "|---|---|---|---|---|",
      "| 10. State Reconciliation Module | v2.0 | 0/4 | Not started | - |",
    ].join("\n"),
    "utf8",
  );
  return { roadmapPath };
}
