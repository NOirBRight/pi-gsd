import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildUnitQueue, resolveWorkflowSettings } from "../src/orchestrator/settings.js";

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
