import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOfficialWorkflowConfig } from "../src/orchestrator/official-config.js";
import { buildUnitQueue, inferPhaseSignals, resolveWorkflowSettings } from "../src/orchestrator/settings.js";

function writeConfig(workflow: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "pi-gsd-orch-settings-"));
  writeFileSync(join(root, "config.json"), JSON.stringify({ workflow }), "utf8");
  return root;
}

describe("orchestrator settings", () => {
  describe("official workflow config manifests", () => {
    it("loads workflow defaults and schema keys from official manifests", () => {
      const config = loadOfficialWorkflowConfig({ startDir: process.cwd() });

      expect(config.defaults.workflow.plan_check).toBe(true);
      expect(config.defaults.workflow.code_review).toBe(true);
      expect(config.defaults.workflow.code_review_depth).toBe("standard");
      expect(config.schema.workflowKeys).toEqual(expect.arrayContaining([
        "workflow.plan_check",
        "workflow.code_review",
        "workflow.code_review_depth",
        "workflow.code_review_command",
        "workflow.plan_review_convergence",
        "workflow.post_planning_gaps",
      ]));
    });

    it("fails clearly when the official manifest files are missing", () => {
      const root = mkdtempSync(join(tmpdir(), "pi-gsd-missing-manifest-"));
      mkdirSync(join(root, "node_modules", "@opengsd", "gsd-core"), { recursive: true });

      expect(() => loadOfficialWorkflowConfig({ officialRoot: join(root, "node_modules", "@opengsd", "gsd-core") }))
        .toThrow(/config-defaults\.manifest\.json|config-schema\.manifest\.json/);
    });
  });

  it("builds workflow-step units for default chain mode", () => {
    const result = buildUnitQueue({ mode: "chain", phase: "09" });

    expect(result.decision).toBe("dispatch");
    expect(result.units.map((unit) => unit.type)).toEqual(["discuss", "plan", "execute"]);
    expect(result.units.every((unit) => unit.id.startsWith("09:"))).toBe(true);
  });

  it("does not enqueue code-review-fix before code-review reports issues", () => {
    const result = buildUnitQueue({ mode: "chain", phase: "09" });

    expect(result.units.map((unit) => unit.type)).toEqual(["discuss", "plan", "execute"]);
  });

  it("attaches upstream args for chain mode", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      settings: resolveWorkflowSettings({
        defaults: { skip_discuss: false, research: false, plan_check: false, code_review: false, verifier: true },
      }),
    });

    expect(result.units.find((unit) => unit.type === "discuss")?.metadata).toMatchObject({ args: "--chain" });
    expect(result.units.find((unit) => unit.type === "plan")?.metadata).toMatchObject({ args: "--auto" });
    expect(result.units.find((unit) => unit.type === "execute")?.metadata).toMatchObject({ args: "--auto --no-transition" });
  });

  it("attaches upstream args for auto mode", () => {
    const result = buildUnitQueue({
      mode: "auto",
      phase: "09",
      settings: resolveWorkflowSettings({
        defaults: { skip_discuss: false, research: false, plan_check: false, code_review: false, verifier: true },
      }),
    });

    expect(result.units.find((unit) => unit.type === "discuss")?.metadata).toMatchObject({ args: "--auto" });
    expect(result.units.find((unit) => unit.type === "plan")?.metadata).toMatchObject({ args: "--auto" });
    expect(result.units.find((unit) => unit.type === "execute")?.metadata).toMatchObject({ args: "--auto --no-transition" });
  });

  it("appends preserved native command args only to the invoked chain unit", () => {
    const result = buildUnitQueue({
      mode: "auto",
      phase: "09",
      startAt: "plan",
      extraArgs: "--gaps --text",
      settings: resolveWorkflowSettings({
        defaults: { skip_discuss: false, research: false, plan_check: false, code_review: false, verifier: true },
      }),
    });

    expect(result.units.find((unit) => unit.type === "plan")?.metadata).toMatchObject({ args: "--auto --gaps --text" });
    expect(result.units.find((unit) => unit.type === "execute")?.metadata).toMatchObject({ args: "--auto --no-transition" });
  });

  it("appends preserved native command args to execute flags", () => {
    const result = buildUnitQueue({
      mode: "auto",
      phase: "09",
      startAt: "execute",
      extraArgs: "--wave 2 --interactive",
      settings: resolveWorkflowSettings({
        defaults: { skip_discuss: false, research: false, plan_check: false, code_review: false, verifier: true },
      }),
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["execute"]);
    expect(result.units[0].metadata).toMatchObject({ args: "--auto --no-transition --wave 2 --interactive" });
  });

  it("passes preserved native command args to standalone workflow units", () => {
    const result = buildUnitQueue({ mode: "auto", phase: "09", startAt: "verify", extraArgs: "--ws feature-x" });

    expect(result.units.map((unit) => unit.type)).toEqual(["verify"]);
    expect(result.units[0].metadata).toMatchObject({ args: "--ws feature-x" });
  });

  it("does not continue native chain after explicit assumptions-only discuss mode", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      startAt: "discuss",
      extraArgs: "--assumptions",
      settings: resolveWorkflowSettings({
        defaults: { skip_discuss: false, research: false, plan_check: false, code_review: false, verifier: true },
      }),
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["discuss"]);
    expect(result.units[0].metadata).toMatchObject({ args: "--chain --assumptions" });
  });

  it("does not continue native chain after plan research-only mode", () => {
    const result = buildUnitQueue({
      mode: "auto",
      phase: "09",
      startAt: "plan",
      extraArgs: "--research-phase 2 --view",
      settings: resolveWorkflowSettings({
        defaults: { skip_discuss: false, research: false, plan_check: false, code_review: false, verifier: true },
      }),
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["plan"]);
    expect(result.units[0].metadata).toMatchObject({ args: "--auto --research-phase 2 --view" });
  });

  it("starts queue at requested command unit", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      startAt: "verify",
      settings: resolveWorkflowSettings({ defaults: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: true } }),
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["verify"]);
  });

  it("allows explicit startAt verify as standalone UAT workflow", () => {
    const result = buildUnitQueue({ mode: "chain", phase: "09", startAt: "verify" });

    expect(result.units.map((unit) => unit.type)).toEqual(["verify"]);
  });

  it("allows explicit startAt closeout as standalone ship workflow", () => {
    const result = buildUnitQueue({ mode: "chain", phase: "09", startAt: "closeout" });

    expect(result.units.map((unit) => unit.type)).toEqual(["closeout"]);
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

  it("reads explicit configPath files even when named settings.json", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-explicit-settings-"));
    const settingsPath = join(root, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ workflow: { verifier: false, code_review: false } }), "utf8");

    const settings = resolveWorkflowSettings({ cwd: root, configPath: settingsPath });

    expect(settings.workflow.verifier).toBe(false);
    expect(settings.workflow.code_review).toBe(false);
    expect(settings.sources).toMatchObject({ verifier: "config", code_review: "config" });
  });

  it("prefers .planning/config.json over root config.json when configPath is omitted", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-config-precedence-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, "config.json"), JSON.stringify({ workflow: { verifier: false } }), "utf8");
    writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: true, code_review: false } }), "utf8");

    const settings = resolveWorkflowSettings({ cwd: root });

    expect(settings.workflow.verifier).toBe(true);
    expect(settings.workflow.code_review).toBe(false);
  });

  it("falls back to root config.json when .planning/config.json is absent", () => {
    const cwd = writeConfig({ verifier: false, plan_check: false });

    const settings = resolveWorkflowSettings({ cwd });

    expect(settings.workflow.verifier).toBe(false);
    expect(settings.workflow.plan_check).toBe(false);
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

  it("resolves official workflow keys used by native orchestration", () => {
    const settings = resolveWorkflowSettings({ cwd: process.cwd() });

    expect(settings.workflow).toMatchObject({
      plan_check: true,
      code_review: true,
      code_review_depth: "standard",
      node_repair_budget: 2,
    });
    expect(settings.workflowMetadata?.officialVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("preserves official workflow keys not used directly by native Unit building", () => {
    const root = writeConfig({
      code_review_depth: "deep",
      code_review_command: "custom review command",
      plan_review_convergence: true,
      post_planning_gaps: false,
    });

    const settings = resolveWorkflowSettings({ cwd: root });

    expect(settings.workflow.code_review_depth).toBe("deep");
    expect(settings.workflow.code_review_command).toBe("custom review command");
    expect(settings.workflow.plan_review_convergence).toBe(true);
    expect(settings.workflow.post_planning_gaps).toBe(false);
    expect(settings.rawWorkflow).toMatchObject({
      code_review_depth: "deep",
      code_review_command: "custom review command",
    });
  });

  it("includes phase-signal units for AI, security, nyquist, and UI safety settings", () => {
    const result = buildUnitQueue({
      mode: "chain",
      phase: "09",
      settings: resolveWorkflowSettings({ defaults: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: false } }),
      phaseSignals: { isUiPhase: true, isAiPhase: true, requiresSecurityReview: true, requiresNyquistValidation: true },
    });

    expect(result.units.map((unit) => unit.type)).toEqual(["settings-gate", "ui-safety-gate", "ai-integration", "plan", "execute", "security-review", "nyquist-validation"]);
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

    expect(result.units.map((unit) => unit.type)).toEqual(["settings-gate", "plan", "execute"]);
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

  it("resolves active-workstream config when .planning/active-workstream points to a slug", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-active-workstream-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, ".planning", "active-workstream"), "feature-x", "utf8");
    mkdirSync(join(root, ".planning", "workstreams", "feature-x"), { recursive: true });
    writeFileSync(join(root, ".planning", "workstreams", "feature-x", "config.json"), JSON.stringify({ workflow: { verifier: false, code_review: false } }), "utf8");
    writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: true, code_review: true } }), "utf8");
    writeFileSync(join(root, "config.json"), JSON.stringify({ workflow: { verifier: true } }), "utf8");

    const settings = resolveWorkflowSettings({ cwd: root });

    expect(settings.workflow.verifier).toBe(false);
    expect(settings.workflow.code_review).toBe(false);
    expect(settings.settingsSource).toMatchObject({ kind: "active-workstream" });
    expect(settings.settingsSource?.path?.replace(/\\/g, "/")).toContain(".planning/workstreams/feature-x/config.json");
  });

  it("falls back to .planning/config.json when active-workstream slug has no config", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-active-workstream-missing-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, ".planning", "active-workstream"), "missing-slug", "utf8");
    writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: true } }), "utf8");

    const settings = resolveWorkflowSettings({ cwd: root });

    expect(settings.workflow.verifier).toBe(true);
    expect(settings.settingsSource).toMatchObject({ kind: "planning-config" });
  });

  it("includes source path/kind/hash/mtime in settingsSource", () => {
    const cwd = writeConfig({ verifier: false });
    const settings = resolveWorkflowSettings({ cwd });
    expect(settings.settingsSource?.kind).toBe("root-config");
    expect(settings.settingsSource?.path?.replace(/\\/g, "/")).toMatch(/config\.json$/);
    expect(settings.settingsSource?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof settings.settingsSource?.mtimeMs).toBe("number");
  });

  it("throws instead of silently falling back to defaults when selected config is malformed", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-malformed-config-"));
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, ".planning", "config.json"), "{not valid json", "utf8");

    expect(() => resolveWorkflowSettings({ cwd: root })).toThrow(/Could not read orchestrator settings/);
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
