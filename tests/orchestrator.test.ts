import type { GateName, GateResult, OrchestrationUnit } from "../src/orchestrator/types.js";
import { runPostDispatchGate, runPreDispatchGates } from "../src/orchestrator/gates.js";
import { reconcileBeforeDispatch } from "../src/orchestrator/reconciliation.js";
import { advanceOrchestration, startOrchestration } from "../src/orchestrator/state-machine.js";
import { advance, createAutoOrchestrator, getStatus, resume, start, stop } from "../src/orchestrator/index.js";
import { createCommandDispatchRunner, createDispatchAdapter, resolveUnitDispatchTarget } from "../src/orchestrator/dispatch.js";
import { createNativeAutoHandoff, detectNativeAutoTrigger } from "../src/orchestrator/trigger.js";
import { createJournalAdapter, writeJournalSnapshot } from "../src/orchestrator/journal.js";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

function unit(type: OrchestrationUnit["type"], phase = "09"): OrchestrationUnit {
  return { id: `${phase}:${type}`, type, status: "pending", phase, label: type, required: true, source: "default" };
}

const settings = {
  workflow: {
    research: true,
    plan_check: true,
    verifier: true,
    ui_phase: true,
    ui_review: true,
    code_review: true,
    auto_advance: false,
    worktrees: true,
    node_repair: true,
    node_repair_budget: 2,
    skip_discuss: false,
    _auto_chain_active: false,
  },
};

describe("orchestrator state machine", () => {
  it("calls gates in exact ORCH-02 pre-dispatch order", () => {
    const calls: GateName[] = [];
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")] });

    const result = advanceOrchestration(snapshot, {
      gates: {
        reconcileBeforeDispatch: pass("reconcileBeforeDispatch", calls),
        decideDispatch: pass("decideDispatch", calls),
        validateToolContract: pass("validateToolContract", calls),
        prepareUnitRoot: pass("prepareUnitRoot", calls),
        persistRuntimeState: pass("persistRuntimeState", calls),
      },
      dispatch: () => ({ ok: true, messages: ["dispatched"] }),
      postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }),
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["reconcileBeforeDispatch", "decideDispatch", "validateToolContract", "prepareUnitRoot", "persistRuntimeState"]);
  });

  it("uses node repair budget for retryable gate failures then pauses", () => {
    let snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("execute")] });
    const gate = () => ({ ok: false, gate: "prepareUnitRoot", reason: "gate-failed", retryable: true, resumeHint: "repair root" }) satisfies GateResult;

    const first = advanceOrchestration(snapshot, { gates: { reconcileBeforeDispatch: passReconcile, prepareUnitRoot: gate } });
    expect(first.snapshot?.status).toBe("running");
    expect(first.snapshot?.attempt).toBe(1);
    snapshot = first.snapshot!;

    const second = advanceOrchestration(snapshot, { gates: { reconcileBeforeDispatch: passReconcile, prepareUnitRoot: gate } });
    expect(second.snapshot?.status).toBe("running");
    expect(second.snapshot?.attempt).toBe(2);
    snapshot = second.snapshot!;

    const third = advanceOrchestration(snapshot, { gates: { reconcileBeforeDispatch: passReconcile, prepareUnitRoot: gate } });
    expect(third.ok).toBe(false);
    expect(third.snapshot?.status).toBe("paused");
    expect(third.snapshot?.attempt).toBe(2);
    expect(third.snapshot?.lastEvent?.reason).toBe("retry-budget-exhausted");
  });

  it("revises plan when plan-check reports issues before the upstream cap", () => {
    const snapshot = startOrchestration({
      phase: "09",
      mode: "chain",
      settings,
      units: [unit("plan-check"), unit("execute")],
    });

    const result = advanceOrchestration(snapshot, {
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => ({ ok: true, messages: ["## ISSUES FOUND\n- blocker"], outcome: { marker: "issues_found" } }),
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.currentUnit).toMatchObject({
      id: "09:plan:revision-1",
      type: "plan",
      metadata: { args: "--auto --revision", revision: 1 },
    });
    expect(result.snapshot?.remainingUnits.map((candidate) => candidate.type)).toEqual(["plan-check", "execute"]);
    expect(result.snapshot?.loopState).toMatchObject({ planCheckIterations: 2 });
  });

  it("pauses plan-check revision when the upstream iteration cap is reached", () => {
    const snapshot = startOrchestration({
      phase: "09",
      mode: "chain",
      settings,
      units: [unit("plan-check"), unit("execute")],
    });

    const result = advanceOrchestration({ ...snapshot, loopState: { planCheckIterations: 3 } }, {
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => ({ ok: true, messages: ["## ISSUES FOUND\n- still blocked"], outcome: { marker: "issues_found" } }),
    });

    expect(result.ok).toBe(false);
    expect(result.snapshot?.status).toBe("paused");
    expect(result.snapshot?.currentUnit?.type).toBe("plan-check");
    expect(result.messages.join("\n")).toContain("Plan checker reached maximum iterations");
  });

  it("blocks invalid execute root with typed worktree recovery before dispatch", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-invalid-root-"));
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings, units: [unit("execute", "11")], cwd });
    let dispatchCount = 0;

    const result = advanceOrchestration(snapshot, {
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => {
        dispatchCount += 1;
        return { ok: true, messages: ["should not dispatch"] };
      },
    });

    expect(dispatchCount).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.snapshot?.status).toBe("stopped");
    expect(result.events?.find((event) => event.type === "gate_failed")).toEqual(expect.objectContaining({ exitReason: "worktree-invalid", recoveryDecision: expect.objectContaining({ class: "worktree-invalid", action: "stop" }) }));
  });

  it("workflow.worktrees=false still validates project root safety", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-disabled-worktrees-"));
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings: { ...settings, workflow: { ...settings.workflow, worktrees: false } }, units: [unit("execute", "11")], cwd });
    const result = runPreDispatchGates(snapshot, snapshot.currentUnit!, { reconcileBeforeDispatch: passReconcile });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.recoveryDecision?.class).toBe("worktree-invalid");
  });

  it("read-only units preserve gate order without isolated lease validation", () => {
    const calls: GateName[] = [];
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-readonly-gates-"));
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings, units: [unit("plan", "11")], cwd });
    const result = advanceOrchestration(snapshot, {
      gates: {
        reconcileBeforeDispatch: pass("reconcileBeforeDispatch", calls),
        decideDispatch: pass("decideDispatch", calls),
        validateToolContract: pass("validateToolContract", calls),
        persistRuntimeState: pass("persistRuntimeState", calls),
      },
      dispatch: () => ({ ok: true, messages: ["dispatched"] }),
      postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }),
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["reconcileBeforeDispatch", "decideDispatch", "validateToolContract", "persistRuntimeState"]);
    expect(result.events?.map((event) => event.type)).toContain("unit_ended");
  });

  it("pause-with-remediation recovery decisions pause and set exitReason", () => {
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings, units: [unit("execute", "11")] });
    const gate = () => ({ ok: false, gate: "prepareUnitRoot", reason: "unrepaired-state-drift", retryable: false, resumeHint: "inspect stale lease", recoveryDecision: { class: "unrepaired-state-drift", action: "pause-with-remediation", message: "stale lease", remediation: "inspect stale lease" } }) satisfies GateResult;
    const result = advanceOrchestration(snapshot, { gates: { reconcileBeforeDispatch: passReconcile, prepareUnitRoot: gate } });
    expect(result.snapshot?.status).toBe("paused");
    expect(result.snapshot?.lastEvent?.exitReason).toBe("unrepaired-state-drift");
  });

  it("native reconciliation blockers pause before dispatch", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-reconcile-blocker-"));
    const phaseDir = join(cwd, ".planning", "phases", "09-auto-orchestration-native-module");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "09-01-PLAN.md"), "plan without summary\n", "utf8");
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")], cwd });
    let dispatchCount = 0;

    const result = advanceOrchestration(snapshot, {
      dispatch: () => {
        dispatchCount += 1;
        return { ok: true, messages: ["should not dispatch"] };
      },
    });

    expect(result.ok).toBe(false);
    expect(dispatchCount).toBe(0);
    expect(result.snapshot?.status).toBe("paused");
    expect(result.snapshot?.lastEvent).toEqual(expect.objectContaining({
      type: "pause",
      reason: "unrepaired-state-drift",
      evidence: expect.arrayContaining([
        "reason:summary-count-mismatch",
        expect.stringContaining("path:"),
      ]),
    }));
  });

  it("reconcileBeforeDispatch preserves old snapshot ambiguity checks", () => {
    const running = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan"), unit("execute")] });

    expect(reconcileBeforeDispatch({ ...running, status: "paused" }, running.currentUnit!).ok).toBe(false);
    expect(reconcileBeforeDispatch({ ...running, currentUnit: unit("execute") }, running.currentUnit!).ok).toBe(false);
  });

  it("forwards real lease release events after successful source-writing dispatch", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-release-events-"));
    mkdirSync(join(cwd, ".git"), { recursive: true });
    const phaseDir = join(cwd, ".planning", "phases", "11-fixture");
    mkdirSync(phaseDir, { recursive: true });
    const summary = join(phaseDir, "11-SUMMARY.md");
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings, units: [unit("execute", "11")], cwd });

    const result = advanceOrchestration(snapshot, {
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => {
        writeFileSync(summary, "summary\n", "utf8");
        return { ok: true, messages: ["dispatched"], written: [summary] };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.events?.map((event) => event.type)).toContain("lease_acquired");
    expect(result.events?.map((event) => event.type)).toContain("lease_released");
    expect(result.events?.find((event) => event.type === "lease_released")).toEqual(expect.objectContaining({ unitId: "11:execute", phase: "11", root: cwd, action: "self-heal", recoveryClass: "repairable-state-drift" }));
  });

  it("attempts owned release cleanup when post-dispatch gates fail", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-release-cleanup-"));
    mkdirSync(join(cwd, ".git"), { recursive: true });
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings, units: [unit("execute", "11")], cwd });

    const result = advanceOrchestration(snapshot, {
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => ({ ok: true, messages: ["dispatched"], written: [] }),
      postDispatchGate: () => ({ ok: false, gate: "artifact", reason: "gate-failed", retryable: false, resumeHint: "create SUMMARY.md", evidence: ["missing SUMMARY"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.events?.map((event) => event.type)).toContain("lease_acquired");
    expect(result.events?.map((event) => event.type)).toContain("lease_released");
  });

  it("surfaces release cleanup failure instead of completing source-writing dispatch", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-release-failure-"));
    mkdirSync(join(cwd, ".git"), { recursive: true });
    mkdirSync(join(cwd, ".planning", "phases", "11-fixture"), { recursive: true });
    const summary = join(cwd, ".planning", "phases", "11-fixture", "11-SUMMARY.md");
    const leasePath = join(cwd, ".planning", "worktree-leases", "lease.json");
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings, units: [unit("execute", "11")], cwd });

    const result = advanceOrchestration(snapshot, {
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => {
        writeFileSync(summary, "summary\n", "utf8");
        writeFileSync(leasePath, JSON.stringify({ unitId: "other", phase: "11", branch: undefined, root: cwd, host: hostname(), pid: process.pid }), "utf8");
        return { ok: true, messages: ["dispatched"], written: [summary] };
      },
    });

    expect(result.ok).toBe(false);
    expect(result.snapshot?.status).toBe("stopped");
    expect(result.events?.find((event) => event.type === "gate_failed" && event.exitReason === "worktree-invalid")).toEqual(expect.objectContaining({ action: "stop" }));
    expect(existsSync(leasePath)).toBe(true);
  });

  it("uses successful ownership gate branch evidence when releasing an already-owned lease", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-release-branch-evidence-"));
    mkdirSync(join(cwd, ".git"), { recursive: true });
    const phaseDir = join(cwd, ".planning", "phases", "11-fixture");
    mkdirSync(phaseDir, { recursive: true });
    const leasePath = join(cwd, ".planning", "worktree-leases", "lease.json");
    mkdirSync(join(cwd, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(leasePath, JSON.stringify({ unitId: "11:execute", phase: "11", branch: "main", root: cwd, host: hostname(), pid: process.pid }), "utf8");
    const summary = join(phaseDir, "11-SUMMARY.md");
    const snapshot = startOrchestration({ phase: "11", mode: "chain", settings, units: [unit("execute", "11")], cwd });

    const result = advanceOrchestration(snapshot, {
      gates: {
        reconcileBeforeDispatch: passReconcile,
        prepareUnitRoot: () => ({ ok: true, gate: "prepareUnitRoot", evidence: ["worktree-safety", `root:${cwd}`, "branch:main", "worktree validation passed"] }),
      },
      dispatch: () => {
        writeFileSync(summary, "summary\n", "utf8");
        return { ok: true, messages: ["dispatched"], written: [summary] };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.events?.map((event) => event.type)).toContain("lease_released");
    expect(existsSync(leasePath)).toBe(false);
  });

  it("emits unit-start, per-gate pass, and completion lifecycle events", () => {
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")] });
    const result = advanceOrchestration(snapshot, {
      gates: {
        reconcileBeforeDispatch: pass("reconcileBeforeDispatch", []),
        decideDispatch: pass("decideDispatch", []),
        validateToolContract: pass("validateToolContract", []),
        prepareUnitRoot: pass("prepareUnitRoot", []),
        persistRuntimeState: pass("persistRuntimeState", []),
      },
      dispatch: () => ({ ok: true, messages: ["dispatched"] }),
      postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }),
    });

    expect(result.events?.map((event) => event.type)).toEqual([
      "unit_started",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "unit_ended",
      "orchestration_completed",
    ]);
  });

  it("post-dispatch artifact gate failure prevents advancing and records evidence", () => {
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("execute"), unit("verify")] });
    const result = advanceOrchestration(snapshot, {
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => ({ ok: true, messages: ["dispatched"] }),
      postDispatchGate: () => ({ ok: false, gate: "artifact", reason: "gate-failed", retryable: false, resumeHint: "create SUMMARY.md", evidence: ["missing SUMMARY"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.snapshot?.status).toBe("paused");
    expect(result.snapshot?.currentUnit?.type).toBe("execute");
    expect(result.snapshot?.remainingUnits.map((u) => u.type)).toEqual(["verify"]);
    expect(result.snapshot?.lastEvent?.evidence).toEqual(["missing SUMMARY"]);
  });

  it("successful transition completes current unit and advances to next unit", () => {
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan"), unit("execute")] });
    const result = advanceOrchestration(snapshot, { gates: { reconcileBeforeDispatch: passReconcile }, dispatch: () => ({ ok: true, messages: ["dispatched"] }), postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }) });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.currentUnit?.type).toBe("execute");
    expect(result.snapshot?.remainingUnits).toEqual([]);
    expect(result.snapshot?.lastEvent?.unitId).toBe("09:plan");
  });
});

describe("artifact gates", () => {
  function artifactFixture(phase = "09") {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-artifact-outcome-"));
    const phaseDir = join(cwd, ".planning", "phases", `${phase}-fixture`);
    mkdirSync(phaseDir, { recursive: true });
    return { cwd, phaseDir };
  }

  function snapshotForArtifactGate(cwd: string, type: OrchestrationUnit["type"], phase = "09") {
    return startOrchestration({ phase, mode: "chain", settings: { ...settings, workflow: { ...settings.workflow, worktrees: false } }, units: [unit(type, phase)], cwd });
  }

  it("blocks verify outcomes that are not passed", () => {
    const { cwd, phaseDir } = artifactFixture();
    const verificationPath = join(phaseDir, "09-VERIFICATION.md");
    const snapshot = snapshotForArtifactGate(cwd, "verify");

    writeFileSync(verificationPath, "---\nstatus: gaps_found\n---\n\n# Verification\n", "utf8");
    const gaps = runPostDispatchGate(snapshot, unit("verify"), { cwd, written: [verificationPath] });
    expect(gaps.ok).toBe(false);
    expect(!gaps.ok && gaps.resumeHint).toContain("/gsd-plan-phase 09 --gaps");

    writeFileSync(verificationPath, "---\nstatus: human_needed\n---\n\n# Verification\n", "utf8");
    const human = runPostDispatchGate(snapshot, unit("verify"), { cwd, written: [verificationPath] });
    expect(human.ok).toBe(false);
    expect(!human.ok && human.resumeHint).toContain("human verification");

    writeFileSync(verificationPath, "---\nstatus: passed\n---\n\n# Verification\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("verify"), { cwd, written: [verificationPath] }).ok).toBe(true);
  });

  it("requires a recognized verification completion outcome", () => {
    const { cwd, phaseDir } = artifactFixture();
    const verificationPath = join(phaseDir, "09-VERIFICATION.md");
    const snapshot = snapshotForArtifactGate(cwd, "verify");

    writeFileSync(verificationPath, "# Verification\n", "utf8");
    const missing = runPostDispatchGate(snapshot, unit("verify"), { cwd, written: [verificationPath] });
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.resumeHint).toContain("recognized completion outcome");

    const structuredPass = runPostDispatchGate(snapshot, unit("verify"), { cwd, written: [verificationPath], outcome: { status: "passed" } });
    expect(structuredPass.ok).toBe(true);

    const structuredGap = runPostDispatchGate(snapshot, unit("verify"), { cwd, written: [verificationPath], outcome: { status: "gaps_found" } });
    expect(structuredGap.ok).toBe(false);
    expect(!structuredGap.ok && structuredGap.resumeHint).toContain("--gaps-only");
  });

  it("requires passed verification before closeout can complete", () => {
    const { cwd, phaseDir } = artifactFixture();
    const roadmapPath = join(cwd, ".planning", "ROADMAP.md");
    const statePath = join(cwd, ".planning", "STATE.md");
    const verificationPath = join(phaseDir, "09-VERIFICATION.md");
    const snapshot = snapshotForArtifactGate(cwd, "closeout");

    writeFileSync(roadmapPath, "| 9. Auto Orchestration Module | v2.0 | 1/1 | Complete | 2026-06-01 |\n", "utf8");
    writeFileSync(statePath, "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
    writeFileSync(verificationPath, "---\nstatus: gaps_found\n---\n\n# Verification\n", "utf8");

    const blocked = runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [roadmapPath, statePath] });
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.resumeHint).toContain("status: passed");

    writeFileSync(verificationPath, "---\nstatus: passed\n---\n\n# Verification\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [roadmapPath, statePath] }).ok).toBe(true);
  });

  it("enforces semantic outcome policies for hard-gated units", () => {
    const { cwd, phaseDir } = artifactFixture();

    const planCheck = snapshotForArtifactGate(cwd, "plan-check");
    expect(runPostDispatchGate(planCheck, unit("plan-check"), { cwd, messages: ["## ISSUES FOUND\n- blocker"] }).ok).toBe(false);
    expect(runPostDispatchGate(planCheck, unit("plan-check"), { cwd, messages: ["## VERIFICATION PASSED"] }).ok).toBe(true);

    const reviewPath = join(phaseDir, "09-REVIEW.md");
    const codeReview = snapshotForArtifactGate(cwd, "code-review");
    writeFileSync(reviewPath, "---\nstatus: issues_found\n---\n\n# Review\n", "utf8");
    const codeReviewWithIssues = runPostDispatchGate(codeReview, unit("code-review"), { cwd, written: [reviewPath] });
    expect(codeReviewWithIssues.ok).toBe(true);
    expect(codeReviewWithIssues.ok && codeReviewWithIssues.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("status:issues_found"),
    ]));
    writeFileSync(reviewPath, "---\nstatus: clean\n---\n\n# Review\n", "utf8");
    expect(runPostDispatchGate(codeReview, unit("code-review"), { cwd, written: [reviewPath] }).ok).toBe(true);

    const securityPath = join(phaseDir, "09-SECURITY.md");
    const security = snapshotForArtifactGate(cwd, "security-review");
    writeFileSync(securityPath, "---\nthreats_open: 1\n---\n\n# Security\n", "utf8");
    expect(runPostDispatchGate(security, unit("security-review"), { cwd, written: [securityPath] }).ok).toBe(false);
    writeFileSync(securityPath, "---\nthreats_open: 0\n---\n\n# Security\n", "utf8");
    expect(runPostDispatchGate(security, unit("security-review"), { cwd, written: [securityPath] }).ok).toBe(true);

    const uiSpecPath = join(phaseDir, "09-UI-SPEC.md");
    const uiSafety = snapshotForArtifactGate(cwd, "ui-safety-gate");
    writeFileSync(uiSpecPath, "---\nstatus: draft\n---\n\n# UI Spec\n", "utf8");
    expect(runPostDispatchGate(uiSafety, unit("ui-safety-gate"), { cwd, written: [uiSpecPath] }).ok).toBe(false);
    writeFileSync(uiSpecPath, "---\nstatus: approved\n---\n\n# UI Spec\n", "utf8");
    expect(runPostDispatchGate(uiSafety, unit("ui-safety-gate"), { cwd, written: [uiSpecPath] }).ok).toBe(true);

    const validationPath = join(phaseDir, "09-VALIDATION.md");
    const nyquist = snapshotForArtifactGate(cwd, "nyquist-validation");
    writeFileSync(validationPath, "---\nnyquist_compliant: false\n---\n\n# Validation\n", "utf8");
    expect(runPostDispatchGate(nyquist, unit("nyquist-validation"), { cwd, written: [validationPath], messages: ["## ESCALATE"] }).ok).toBe(false);
    writeFileSync(validationPath, "---\nnyquist_compliant: true\n---\n\n# Validation\n", "utf8");
    expect(runPostDispatchGate(nyquist, unit("nyquist-validation"), { cwd, written: [validationPath] }).ok).toBe(true);
  });

  it("fails closed when hard-gated units produce no current artifact or outcome", () => {
    const { cwd } = artifactFixture();
    const gatedTypes: OrchestrationUnit["type"][] = [
      "discuss",
      "research",
      "code-review",
      "settings-gate",
      "ui-safety-gate",
      "security-review",
      "nyquist-validation",
      "ai-integration",
      "ui-review",
    ];

    for (const type of gatedTypes) {
      const result = runPostDispatchGate(snapshotForArtifactGate(cwd, type), unit(type), { cwd, written: [] });
      expect(result.ok, `${type} should fail closed without current evidence`).toBe(false);
    }
  });

  it("requires exact completed roadmap and state closeout evidence", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-closeout-gate-"));
    const phaseDir = join(cwd, ".planning", "phases", "09-fixture");
    mkdirSync(phaseDir, { recursive: true });
    const roadmapPath = join(cwd, ".planning", "ROADMAP.md");
    const statePath = join(cwd, ".planning", "STATE.md");
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("closeout")], cwd });

    writeFileSync(roadmapPath, "| 9. Auto Orchestration Module | v2.0 | 3/3 | Not complete | — |\n", "utf8");
    writeFileSync(statePath, "## Current Position\n\nPhase: 9 — Auto Orchestration Module (not completed)\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [roadmapPath, statePath] }).ok).toBe(false);

    writeFileSync(roadmapPath, "| 9. Auto Orchestration Module | v2.0 | 3/3 | Complete | 2026-06-01 |\n", "utf8");
    writeFileSync(statePath, "## Current Position\n\nPhase: 10 — State Reconciliation (planning)\n\n## Accumulated Context\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [roadmapPath, statePath] }).ok).toBe(false);

    writeFileSync(join(phaseDir, "09-VERIFICATION.md"), "---\nstatus: passed\n---\n\n# Verification\n", "utf8");
    writeFileSync(statePath, "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [".planning/ROADMAP.md", ".planning/STATE.md"] }).ok).toBe(true);
  });

  it("rejects stale artifacts when dispatch reports no current written paths", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-stale-artifact-"));
    mkdirSync(join(cwd, ".planning", "phases", "09-fixture"), { recursive: true });
    writeFileSync(join(cwd, ".planning", "phases", "09-fixture", "09-SUMMARY.md"), "stale\n", "utf8");
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("execute")], cwd });

    const result = runPostDispatchGate(snapshot, unit("execute"), { cwd });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("artifact-gate-failed");
    expect(!result.ok && result.exitReason).toBe("artifact-gate-failed");
    expect(!result.ok && result.recoveryDecision).toEqual(expect.objectContaining({ class: "artifact-gate-failed", action: "pause-with-remediation" }));
    expect(result.evidence).toEqual(["missing:09-*-SUMMARY.md"]);
  });
});

describe("Unit dispatch target", () => {
  it("maps every dispatchable unit target to generated prompts and agents", () => {
    const types: OrchestrationUnit["type"][] = ["discuss", "research", "plan", "plan-check", "execute", "code-review", "settings-gate", "ui-safety-gate", "security-review", "nyquist-validation", "ai-integration", "ui-review", "verify", "closeout"];

    for (const type of types) {
      const target = resolveUnitDispatchTarget(unit(type));
      expect(existsSync(join(process.cwd(), target.prompt)), `${type} prompt ${target.prompt}`).toBe(true);
      if (target.agent) expect(existsSync(join(process.cwd(), "generated", "agents", `${target.agent}.md`)), `${type} agent ${target.agent}`).toBe(true);
    }
  });

  it("validates dispatch resources from resourceRoot while using project cwd for execution", () => {
    const projectCwd = mkdtempSync(join(tmpdir(), "pi-gsd-project-no-generated-"));
    const resourceRoot = mkdtempSync(join(tmpdir(), "pi-gsd-resource-root-"));
    mkdirSync(join(resourceRoot, "generated", "prompts"), { recursive: true });
    mkdirSync(join(resourceRoot, "generated", "agents"), { recursive: true });
    writeFileSync(join(resourceRoot, "generated", "prompts", "gsd-plan-phase.md"), "prompt body", "utf8");
    writeFileSync(join(resourceRoot, "generated", "agents", "gsd-planner.md"), "agent body", "utf8");
    const adapter = createDispatchAdapter({ cwd: projectCwd, resourceRoot, runner: () => ({ ok: true, messages: ["ran"] }) });

    const result = adapter(unit("plan"), startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")], cwd: projectCwd }));

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectCwd, "generated"))).toBe(false);
  });

  it("dispatch adapter sends typed Unit payloads with scoped GSD_AUDIT and no raw prompt text", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-dispatch-"));
    mkdirSync(join(cwd, "generated", "prompts"), { recursive: true });
    mkdirSync(join(cwd, "generated", "agents"), { recursive: true });
    for (const prompt of ["gsd-plan-phase.md", "gsd-execute-phase.md", "gsd-verify-work.md", "gsd-ship.md"]) writeFileSync(join(cwd, "generated", "prompts", prompt), "prompt body", "utf8");
    for (const agent of ["gsd-planner.md", "gsd-executor.md", "gsd-verifier.md"]) writeFileSync(join(cwd, "generated", "agents", agent), "agent body", "utf8");
    const calls: unknown[] = [];
    const adapter = createDispatchAdapter({ cwd, runner: (request) => { calls.push(request); return { ok: true, messages: ["ran"] }; } });

    const result = adapter(unit("plan"), startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")] }));

    expect(result.ok).toBe(true);
    expect(calls).toEqual([expect.objectContaining({ unit: expect.objectContaining({ type: "plan" }), env: expect.objectContaining({ GSD_AUDIT: "1" }) })]);
    expect(JSON.stringify(calls)).not.toContain("prompt body");
    expect(JSON.stringify(calls)).not.toContain("GSD_AUDIT_ARGS");
  });

  it("command dispatch runner parses structured outcome contracts", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-command-outcome-"));
    const scriptPath = join(cwd, "dispatch.cjs");
    writeFileSync(scriptPath, "process.stdout.write(JSON.stringify({ written: ['09-VERIFICATION.md', 7], status: 'gaps_found', data: { attempts: 2, human: true, nested: { ignored: true } } }));\n", "utf8");
    const runner = createCommandDispatchRunner({ cwd, command: `node "${scriptPath}"` });
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("verify")], cwd });

    const result = runner({ unit: unit("verify"), snapshot, target: { prompt: "generated/prompts/gsd-verify-work.md" }, env: {} });

    expect(result.ok).toBe(true);
    expect(result.written).toEqual(["09-VERIFICATION.md"]);
    expect(result.outcome).toEqual({ status: "gaps_found", data: { attempts: 2, human: true } });
  });

  it("passes Unit args to dispatch command payload and environment", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-command-args-"));
    const scriptPath = join(cwd, "dispatch.cjs");
    writeFileSync(scriptPath, `
const request = JSON.parse(process.env.PI_GSD_DISPATCH_REQUEST);
process.stdout.write(JSON.stringify({
  status: "ok",
  data: {
    args: process.env.PI_GSD_DISPATCH_ARGS ?? "",
    payloadArgs: request.args ?? "",
  },
}));
`, "utf8");
    const planUnit = { ...unit("plan"), metadata: { args: "--auto" } };
    const runner = createCommandDispatchRunner({ cwd, command: `"${process.execPath}" "${scriptPath}"` });
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [planUnit], cwd });

    const result = runner({ unit: planUnit, snapshot, target: { prompt: "generated/prompts/gsd-plan-phase.md" }, env: {} });

    expect(result.ok).toBe(true);
    expect(result.outcome).toEqual({ status: "ok", data: { args: "--auto", payloadArgs: "--auto" } });
  });
});

describe("native auto trigger", () => {
  it("detects supported slash-command text and starts native orchestration", () => {
    expect(detectNativeAutoTrigger("/gsd-discuss-phase 09 --chain")).toEqual(expect.objectContaining({ command: "gsd-discuss-phase", phase: "09", mode: "chain" }));
    expect(detectNativeAutoTrigger("/gsd-plan-phase 09 --chain")).toEqual(expect.objectContaining({ command: "gsd-plan-phase", phase: "09", mode: "chain" }));
    expect(detectNativeAutoTrigger("/gsd-execute-phase 09 --auto")).toEqual(expect.objectContaining({ command: "gsd-execute-phase", phase: "09", mode: "auto" }));
  });

  it("rejects invalid native handoff phase ids", () => {
    const handoff = createNativeAutoHandoff({ cwd: "/project", createOrchestrator: () => { throw new Error("should not create orchestrator"); } });

    const result = handoff("/gsd-plan-phase ../../x --chain");

    expect(result?.ok).toBe(false);
    expect(result?.messages.join("\n")).toContain("Invalid phase");
  });

  it("creates native handoff without relying on checklist prompt compliance", () => {
    const starts: unknown[] = [];
    const handoff = createNativeAutoHandoff({ cwd: "/project", createOrchestrator: () => ({ start: (ctx) => { starts.push(ctx); return { ok: true, messages: ["started"] }; }, advance: () => ({ ok: true, messages: [] }), resume: () => ({ ok: true, messages: [] }), stop: () => ({ ok: true, messages: [] }), getStatus: () => ({ status: "completed", remainingUnits: [], attempt: 0 }) }) });

    const result = handoff("/gsd-plan-phase 09 --chain");

    expect(result?.ok).toBe(true);
    expect(starts).toEqual([expect.objectContaining({ phase: "09", mode: "chain", cwd: "/project", startAt: "plan" })]);
  });

  it("uses the invoked native command as the first orchestration unit", () => {
    const starts: unknown[] = [];
    const handoff = createNativeAutoHandoff({ cwd: "/project", createOrchestrator: () => ({ start: (ctx) => { starts.push(ctx); return { ok: true, messages: ["started"] }; }, advance: () => ({ ok: true, messages: [] }), resume: () => ({ ok: true, messages: [] }), stop: () => ({ ok: true, messages: [] }), getStatus: () => ({ status: "completed", remainingUnits: [], attempt: 0 }) }) });

    expect(handoff("/gsd-discuss-phase 09 --chain")?.ok).toBe(true);
    expect(handoff("/gsd-execute-phase 09 --auto")?.ok).toBe(true);
    expect(handoff("/gsd-verify-work 09 --auto")?.ok).toBe(true);
    expect(handoff("/gsd-ship 09 --auto")?.ok).toBe(true);

    expect(starts).toEqual([
      expect.objectContaining({ startAt: "discuss" }),
      expect.objectContaining({ startAt: "execute" }),
      expect.objectContaining({ startAt: "verify" }),
      expect.objectContaining({ startAt: "closeout" }),
    ]);
  });
});

describe("orchestrator facade", () => {
  it("starts and returns status fields", () => {
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("plan"), unit("execute")] }),
    });

    const result = orchestrator.start({ phase: "09", mode: "chain" });

    expect(result.ok).toBe(true);
    expect(result.status).toEqual(expect.objectContaining({
      currentUnit: expect.objectContaining({ type: "plan" }),
      remainingUnits: [expect.objectContaining({ type: "execute" })],
      attempt: 0,
      lastEvent: expect.any(Object),
      resumeHint: undefined,
    }));
  });

  it("module facade methods exist and delegate without printing", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(start({ phase: "09", mode: "chain" }).ok).toBe(true);
    expect(typeof advance().ok).toBe("boolean");
    expect(resume().ok).toBe(true);
    expect(stop("done").ok).toBe(true);
    expect(getStatus()).toEqual(expect.objectContaining({ remainingUnits: expect.any(Array) }));
    expect(log).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();

    log.mockRestore();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("injects workflow-step Unit metadata into dispatch without raw prompt text", () => {
    const received: OrchestrationUnit[] = [];
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("plan"), unit("execute")] }),
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: (dispatchUnit) => {
        received.push(dispatchUnit);
        return { ok: true, messages: ["ok"] };
      },
    });

    orchestrator.start({ phase: "09", mode: "chain" });
    const before = orchestrator.getStatus().remainingUnits.length;
    const result = orchestrator.advance();

    expect(typeof result.ok).toBe("boolean");
    expect(orchestrator.getStatus().remainingUnits.length).toBeLessThanOrEqual(before);
    expect(received).toEqual([expect.objectContaining({ type: "plan", id: "09:plan" })]);
    expect(JSON.stringify(received)).not.toContain("prompt");
    expect(JSON.stringify(received)).not.toContain("tool-turn");
  });

  it("journals start lifecycle events and exposes D-18 status", () => {
    const events: string[] = [];
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("plan"), unit("execute")] }),
      journal: { append: (event, snapshot) => { events.push(event.type); return { ok: true, messages: ["journaled"], snapshot }; } },
    });

    const result = orchestrator.start({ phase: "09", mode: "chain" });

    expect(result.ok).toBe(true);
    expect(events).toEqual(["orchestration_started", "settings_resolved"]);
    expect(orchestrator.getStatus()).toEqual(expect.objectContaining({
      currentUnit: expect.objectContaining({ type: "plan" }),
      remainingUnits: [expect.objectContaining({ type: "execute" })],
      attempt: 0,
      lastEvent: expect.objectContaining({ type: "settings_resolved" }),
      resumeHint: undefined,
    }));
  });

  it("journals release I/O failure recovery instead of crashing", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-release-journal-"));
    mkdirSync(join(cwd, ".git"), { recursive: true });
    const phaseDir = join(cwd, ".planning", "phases", "11-fixture");
    mkdirSync(phaseDir, { recursive: true });
    const summary = join(phaseDir, "11-SUMMARY.md");
    const events: string[] = [];
    const gateFailed: unknown[] = [];
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("execute", "11")] }),
      journal: { append: (event, snapshot) => { events.push(event.type); if (event.type === "gate_failed") gateFailed.push(event); return { ok: true, messages: ["journaled"], snapshot }; } },
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: () => {
        writeFileSync(summary, "summary\n", "utf8");
        return { ok: true, messages: ["dispatched"], written: [summary] };
      },
      worktreeSafetyDeps: { unlinkSync: () => { throw new Error("lease locked"); } },
    });

    orchestrator.start({ phase: "11", mode: "chain", cwd });
    const result = orchestrator.advance();

    expect(result.ok).toBe(false);
    expect(orchestrator.getStatus().status).toBe("stopped");
    expect(events).toEqual(expect.arrayContaining(["lease_acquired", "gate_failed", "stop"]));
    expect(gateFailed[0]).toEqual(expect.objectContaining({ exitReason: "worktree-invalid", recoveryDecision: expect.objectContaining({ reasonCode: "lease-release-failed", message: expect.stringContaining("lease locked") }) }));
  });

  it("journals gate failure and pause with resume hint", () => {
    const events: string[] = [];
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("execute")] }),
      journal: { append: (event, snapshot) => { events.push(event.type); return { ok: true, messages: ["journaled"], snapshot }; } },
      gates: {
        reconcileBeforeDispatch: passReconcile,
        prepareUnitRoot: () => ({ ok: false, gate: "prepareUnitRoot", reason: "gate-failed", retryable: false, resumeHint: "repair root" }),
      },
    });

    orchestrator.start({ phase: "09", mode: "chain" });
    const result = orchestrator.advance();

    expect(result.ok).toBe(false);
    expect(events).toEqual(expect.arrayContaining(["gate_failed", "pause"]));
    expect(orchestrator.getStatus().status).toBe("paused");
    expect(orchestrator.getStatus().resumeHint).toBe("repair root");
  });

  it("resumes from the latest unfinished journal snapshot", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-resume-"));
    const unfinished = { ...unit("verify"), id: "09:verify" };
    const resumeSettings = { ...settings, workflow: { ...settings.workflow, verifier: false } };
    const persisted = startOrchestration({ phase: "09", mode: "chain", settings: resumeSettings, units: [unfinished, unit("closeout")] });
    writeJournalSnapshot({ cwd, snapshot: { ...persisted, status: "paused", currentUnit: unfinished, resumeHint: "resume verify" } });
    const dispatched: OrchestrationUnit[] = [];

    const orchestrator = createAutoOrchestrator({
      journal: createJournalAdapter({ cwd }),
      gates: { reconcileBeforeDispatch: passReconcile },
      dispatch: (dispatchUnit) => {
        dispatched.push(dispatchUnit);
        return { ok: true, messages: ["dispatched"] };
      },
    });

    const resumeResult = orchestrator.resume();
    const advanceResult = orchestrator.advance();

    expect(resumeResult.ok).toBe(true);
    expect(advanceResult.ok).toBe(true);
    expect(dispatched).toEqual([expect.objectContaining({ id: "09:verify" })]);
  });
});

function pass(gate: GateName, calls: GateName[]) {
  return () => {
    calls.push(gate);
    return { ok: true, gate, evidence: [gate] } satisfies GateResult;
  };
}

function passReconcile() {
  return { ok: true, gate: "reconcileBeforeDispatch", evidence: ["test-reconciliation-pass"] } satisfies GateResult;
}
