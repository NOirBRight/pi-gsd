import { describe, expect, it } from "vitest";
import { classifyDrift, KNOWN_DRIFT_KINDS } from "../src/state-reconciliation/catalog.js";
import { classifyArtifactName } from "../src/state-reconciliation/artifacts.js";
import { reconcileBeforeDispatch } from "../src/state-reconciliation/index.js";
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
});
