import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildUnitQueue, inferPhaseSignals, resolveWorkflowSettings } from "../src/orchestrator/settings.js";

function writeConfig(workflow: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "pi-gsd-orch-settings-"));
  writeFileSync(join(root, "config.json"), JSON.stringify({ workflow }), "utf8");
  return root;
}

describe("orchestrator settings", () => {
  it("builds workflow-step units for default chain mode", () => {
    const result = buildUnitQueue({ mode: "chain", phase: "09" });

    expect(result.decision).toBe("dispatch");
    expect(result.units.map((unit) => unit.type)).toEqual([
      "discuss",
      "research",
      "plan",
      "plan-check",
      "execute",
      "code-review",
      "verify",
      "closeout",
    ]);
    expect(result.units.every((unit) => unit.id.startsWith("09:"))).toBe(true);
  });

  it("starts queue at requested command unit", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      startAt: "verify",
      settings: resolveWorkflowSettings({ defaults: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: true } }),
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["verify", "closeout"]);
  });

  it("pauses instead of falling back to full queue when requested start unit is disabled", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      startAt: "verify",
      settings: resolveWorkflowSettings({ defaults: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: false } }),
    });

    expect(result.decision).toBe("pause_for_user");
    expect(result.units.map((unit) => unit.type)).toEqual(["pause-for-user"]);
    expect(result.resumeHint).toContain("Cannot start at verify");
  });

  it("normalizes workflow defaults and config overrides", () => {
    const cwd = writeConfig({
      research: false,
      plan_check: true,
      verifier: false,
      ui_phase: true,
      ui_review: false,
      code_review: true,
      auto_advance: true,
      use_worktrees: false,
      node_repair: false,
      node_repair_budget: 4,
      _auto_chain_active: true,
    });

    const settings = resolveWorkflowSettings({ cwd });

    expect(settings.workflow).toMatchObject({
      research: false,
      plan_check: true,
      verifier: false,
      ui_phase: true,
      ui_review: false,
      code_review: true,
      auto_advance: true,
      worktrees: false,
      node_repair: false,
      node_repair_budget: 4,
      _auto_chain_active: true,
    });
  });

  it("normalizes extended workflow keys and aliases", () => {
    const cwd = writeConfig({
      plan_checker: false,
      security_enforcement: false,
      nyquist_validation: false,
      ai_integration_phase: false,
      ui_safety_gate: false,
      auto_prune_state: false,
      research_before_questions: false,
      subagent_timeout: 120,
      inline_plan_threshold: 3,
    });

    const settings = resolveWorkflowSettings({ cwd });

    expect(settings.workflow).toMatchObject({
      plan_check: false,
      security_enforcement: false,
      nyquist_validation: false,
      ai_integration_phase: false,
      ui_safety_gate: false,
      auto_prune_state: false,
      research_before_questions: false,
      subagent_timeout: 120,
      inline_plan_threshold: 3,
    });
  });

  it("includes phase-signal units for AI, security, nyquist, and UI safety settings", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      settings: resolveWorkflowSettings({ defaults: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: false } }),
      phaseSignals: { isUiPhase: true, isAiPhase: true, requiresSecurityReview: true, requiresNyquistValidation: true },
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["settings-gate", "ui-safety-gate", "ai-integration", "plan", "execute", "security-review", "nyquist-validation", "closeout"]);
  });

  it("includes enabled optional units and omits disabled optional units", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      settings: {
        workflow: {
          research: false,
          plan_check: true,
          verifier: false,
          ui_phase: true,
          ui_review: false,
          code_review: false,
          auto_advance: false,
          worktrees: true,
          node_repair: true,
          node_repair_budget: 2,
          skip_discuss: true,
          _auto_chain_active: false,
        },
      },
      phaseSignals: { isUiPhase: true },
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["settings-gate", "plan", "plan-check", "execute", "closeout"]);
  });

  it("infers phase signals only from explicit markers in active plan files", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-phase-signals-"));
    const phaseDir = join(root, ".planning", "phases", "09-fixture");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "09-REVIEW.md"), "security validation ui model eval threat", "utf8");
    expect(inferPhaseSignals({ cwd: root, phase: "09" })).toEqual({
      isUiPhase: false,
      requiresUiReview: false,
      requiresSecurityReview: false,
      requiresNyquistValidation: false,
      isAiPhase: false,
    });

    writeFileSync(join(phaseDir, "09-01-PLAN.md"), "phase-signals: ui, ai-integration, security-review, nyquist-validation, ui-review", "utf8");
    expect(inferPhaseSignals({ cwd: root, phase: "09" })).toEqual({
      isUiPhase: true,
      requiresUiReview: true,
      requiresSecurityReview: true,
      requiresNyquistValidation: true,
      isAiPhase: true,
    });
  });

  it("pauses for user when a required phase signal conflicts with disabled settings", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      settings: {
        workflow: {
          research: true,
          plan_check: true,
          verifier: true,
          ui_phase: false,
          ui_review: true,
          code_review: true,
          auto_advance: false,
          worktrees: true,
          node_repair: true,
          node_repair_budget: 2,
          skip_discuss: false,
          _auto_chain_active: false,
        },
      },
      phaseSignals: { isUiPhase: true },
    });

    expect(result.decision).toBe("pause_for_user");
    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({ type: "pause-for-user", status: "pending" });
    expect(result.resumeHint).toEqual(expect.stringContaining("workflow.ui_phase"));
  });
});
