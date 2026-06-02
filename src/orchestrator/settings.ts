import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveGsdConfigSource } from "../settings-bridge/source.js";
import { loadOfficialWorkflowConfig } from "./official-config.js";
import type { OrchestrationUnit, QueueBuildInput, QueueBuildResult, ResolvedWorkflowSettings, UnitType, WorkflowSettingSource } from "./types.js";

export class OrchestratorSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestratorSettingsError";
  }
}

const PI_WORKFLOW_DEFAULTS: Partial<ResolvedWorkflowSettings["workflow"]> = {
  state_reconciliation_apply: false,
  subagent_timeout: 900,
  inline_plan_threshold: 1,
};

type WorkflowKey = keyof ResolvedWorkflowSettings["workflow"];

export function resolveWorkflowSettings(options: { cwd?: string; configPath?: string; defaults?: Partial<ResolvedWorkflowSettings["workflow"]> } = {}): ResolvedWorkflowSettings {
  const officialConfig = loadOfficialWorkflowConfig({ startDir: options.cwd ?? process.cwd() });
  const workflow = {
    ...normalizeOfficialWorkflowDefaults(officialConfig.defaults.workflow),
    ...PI_WORKFLOW_DEFAULTS,
    ...options.defaults,
  } as ResolvedWorkflowSettings["workflow"];
  const sources = Object.fromEntries(Object.keys(workflow).map((key) => [key, "default"])) as Record<WorkflowKey, WorkflowSettingSource>;
  const rawWorkflow: Record<string, unknown> = { ...officialConfig.defaults.workflow };

  // Use the shared Settings Bridge source resolver (D-13) to honor
  // active-workstream precedence and produce source path/kind metadata.
  const configSource = resolveGsdConfigSource({
    cwd: options.cwd ?? process.cwd(),
    ...(options.configPath ? { configPath: options.configPath } : {}),
  });

  if (configSource.parseError) {
    throw new OrchestratorSettingsError(`Could not read orchestrator settings from ${configSource.path ?? "resolved config source"}: ${configSource.parseError}`);
  }

  if (configSource.config) {
    const configWorkflow = isRecord(configSource.config) && isRecord(configSource.config.workflow) ? configSource.config.workflow : {};
    Object.assign(rawWorkflow, configWorkflow);
    applyKnownWorkflowConfig(configWorkflow, workflow, sources);
  }

  return {
    workflow,
    rawWorkflow,
    workflowMetadata: {
      officialPackage: officialConfig.official.packageName,
      officialVersion: officialConfig.official.version,
      officialRoot: officialConfig.official.packageRoot,
      schemaKeys: officialConfig.schema.workflowKeys,
    },
    sources,
    settingsSource: {
      path: configSource.path,
      kind: configSource.kind,
      hash: configSource.hash,
      mtimeMs: configSource.mtimeMs,
    },
  };
}

export function buildUnitQueue(input: QueueBuildInput): QueueBuildResult {
  const settings = input.settings ?? resolveWorkflowSettings({ cwd: input.cwd, configPath: input.configPath });
  const phase = input.phase;

  if (input.phaseSignals?.isUiPhase && !settings.workflow.ui_phase) {
    const resumeHint = "Phase signals require UI planning but workflow.ui_phase is disabled. Ask the user whether to enable workflow.ui_phase or continue without the UI Unit.";
    return { decision: "pause_for_user", settings, resumeHint, units: [unit(phase, "pause-for-user", settings, { resumeHint, source: "phase-signal" })] };
  }

  const units: OrchestrationUnit[] = [];
  if (!settings.workflow.skip_discuss) units.push(unit(phase, "discuss", settings, withArgs(input, "discuss")));
  if (settings.workflow.research) units.push(unit(phase, "research", settings));
  if (input.phaseSignals?.isUiPhase && settings.workflow.ui_phase) units.push(unit(phase, "settings-gate", settings, { label: "UI phase settings gate", source: "phase-signal", metadata: { setting: "workflow.ui_phase" } }));
  if (input.phaseSignals?.isUiPhase && settings.workflow.ui_safety_gate) units.push(unit(phase, "ui-safety-gate", settings, { label: "UI Safety Gate", source: "phase-signal", metadata: { setting: "workflow.ui_safety_gate" } }));
  if (input.phaseSignals?.isAiPhase && settings.workflow.ai_integration_phase) units.push(unit(phase, "ai-integration", settings, { label: "AI Integration", source: "phase-signal", metadata: { setting: "workflow.ai_integration_phase" } }));
  units.push(unit(phase, "plan", settings, withArgs(input, "plan")));
  if (settings.workflow.plan_check) units.push(unit(phase, "plan-check", settings));
  units.push(unit(phase, "execute", settings, withArgs(input, "execute")));
  if (settings.workflow.code_review) units.push(unit(phase, "code-review", settings));
  if (input.phaseSignals?.requiresSecurityReview && settings.workflow.security_enforcement) units.push(unit(phase, "security-review", settings, { source: "phase-signal", metadata: { setting: "workflow.security_enforcement" } }));
  if (settings.workflow.verifier) units.push(unit(phase, "verify", settings));
  if (input.phaseSignals?.requiresNyquistValidation && settings.workflow.nyquist_validation) units.push(unit(phase, "nyquist-validation", settings, { source: "phase-signal", metadata: { setting: "workflow.nyquist_validation" } }));
  if (input.phaseSignals?.requiresUiReview && settings.workflow.ui_review) units.push(unit(phase, "ui-review", settings));
  units.push(unit(phase, "closeout", settings));

  if (input.startAt) {
    const startIndex = units.findIndex((candidate) => candidate.type === input.startAt);
    if (startIndex === -1) {
      const resumeHint = `Cannot start at ${input.startAt}; the Unit is disabled by workflow settings. Enable it or run without native auto handoff.`;
      return { decision: "pause_for_user", settings, resumeHint, units: [unit(phase, "pause-for-user", settings, { resumeHint, source: "phase-signal" })] };
    }
    return { decision: "dispatch", settings, units: units.slice(startIndex) };
  }

  return { decision: "dispatch", settings, units };
}

function unit(phase: string, type: UnitType, settings: ResolvedWorkflowSettings, overrides: Partial<OrchestrationUnit> = {}): OrchestrationUnit {
  return {
    id: `${phase}:${type}`,
    type,
    status: "pending",
    phase,
    label: labelForType(type),
    required: isRequired(type),
    source: settings.sources?.[settingForType(type) ?? "_auto_chain_active"] ?? "default",
    ...overrides,
  };
}

function withArgs(input: QueueBuildInput, type: UnitType, overrides: Partial<OrchestrationUnit> = {}): Partial<OrchestrationUnit> {
  const args = argsForUnit(input, type);
  if (!args) return overrides;
  return { ...overrides, metadata: { ...overrides.metadata, args } };
}

function argsForUnit(input: QueueBuildInput, type: UnitType): string | undefined {
  if (type === "discuss") return input.mode === "auto" ? "--auto" : "--chain";
  if (type === "plan") return "--auto";
  if (type === "execute") return "--auto --no-transition";
  return undefined;
}

function labelForType(type: UnitType) {
  return type.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function isRequired(type: UnitType) {
  return type === "plan" || type === "execute" || type === "closeout";
}

function settingForType(type: UnitType): WorkflowKey | undefined {
  if (type === "research") return "research";
  if (type === "plan-check") return "plan_check";
  if (type === "verify") return "verifier";
  if (type === "ui-review") return "ui_review";
  if (type === "ui-safety-gate") return "ui_safety_gate";
  if (type === "security-review") return "security_enforcement";
  if (type === "nyquist-validation") return "nyquist_validation";
  if (type === "ai-integration") return "ai_integration_phase";
  if (type === "code-review") return "code_review";
  if (type === "discuss") return "skip_discuss";
  if (type === "settings-gate") return "ui_phase";
  return undefined;
}

export function inferPhaseSignals(options: { cwd?: string; phase: string }): NonNullable<QueueBuildInput["phaseSignals"]> {
  const cwd = options.cwd ?? process.cwd();
  const phaseRoot = join(cwd, ".planning", "phases");
  const phaseText = readPhaseSignalText(phaseRoot, options.phase).toLowerCase();
  return {
    isUiPhase: /(?:requires|phase[_ -]signals?):[^\n]*(?:ui|frontend)|(?:^|\n)phase-kind:\s*(?:ui|frontend)/.test(phaseText),
    requiresUiReview: /(?:requires|phase[_ -]signals?):[^\n]*(?:ui-review|visual-audit)/.test(phaseText),
    requiresSecurityReview: /(?:requires|phase[_ -]signals?):[^\n]*(?:security-review|security-enforcement)/.test(phaseText),
    requiresNyquistValidation: /(?:requires|phase[_ -]signals?):[^\n]*(?:nyquist-validation|coverage-gap-validation)/.test(phaseText),
    isAiPhase: /(?:requires|phase[_ -]signals?):[^\n]*(?:ai-integration|llm|eval)|(?:^|\n)phase-kind:\s*(?:ai|llm)/.test(phaseText),
  };
}

function readPhaseSignalText(phaseRoot: string, phase: string): string {
  try {
    const direct = readdirSync(phaseRoot, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`));
    if (!direct) return "";
    return readdirSync(join(phaseRoot, direct.name))
      .filter((name) => /(^|-)PLAN\.md$/i.test(name) || /^phase-signals\.(md|json|ya?ml)$/i.test(name))
      .map((name) => {
        try { return readFileSync(join(phaseRoot, direct.name, name), "utf8"); } catch { return ""; }
      })
      .filter((text) => /(?:requires|phase[_ -]signals?|phase-kind):/i.test(text))
      .join("\n");
  } catch {
    return "";
  }
}

function readConfig(configPath: string) {
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  } catch (error) {
    throw new OrchestratorSettingsError(`Could not read orchestrator settings from ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeOfficialWorkflowDefaults(source: Record<string, unknown>): ResolvedWorkflowSettings["workflow"] {
  return {
    _auto_chain_active: booleanValue(source._auto_chain_active, false),
    auto_advance: booleanValue(source.auto_advance, false),
    research: booleanValue(source.research, true),
    plan_check: booleanValue(source.plan_check, true),
    verifier: booleanValue(source.verifier, true),
    ui_phase: booleanValue(source.ui_phase, true),
    ui_review: booleanValue(source.ui_review, true),
    code_review: booleanValue(source.code_review, true),
    code_review_depth: stringValue(source.code_review_depth, "standard"),
    code_review_command: nullableStringValue(source.code_review_command),
    plan_review_convergence: booleanValue(source.plan_review_convergence, false),
    max_discuss_passes: positiveIntegerValue(source.max_discuss_passes, 3),
    plan_bounce: booleanValue(source.plan_bounce, false),
    plan_bounce_passes: positiveIntegerValue(source.plan_bounce_passes, 2),
    post_planning_gaps: booleanValue(source.post_planning_gaps, true),
    security_enforcement: booleanValue(source.security_enforcement, true),
    nyquist_validation: booleanValue(source.nyquist_validation, true),
    ai_integration_phase: booleanValue(source.ai_integration_phase, true),
    ui_safety_gate: booleanValue(source.ui_safety_gate, true),
    auto_prune_state: booleanValue(source.auto_prune_state, false),
    research_before_questions: booleanValue(source.research_before_questions, false),
    skip_discuss: booleanValue(source.skip_discuss, false),
    worktrees: booleanValue(source.use_worktrees ?? source.worktrees, true),
    node_repair: booleanValue(source.node_repair, true),
    node_repair_budget: positiveIntegerValue(source.node_repair_budget, 2),
    state_reconciliation_apply: false,
    subagent_timeout: positiveIntegerValue(source.subagent_timeout, 300000),
    inline_plan_threshold: 1,
  };
}

function applyKnownWorkflowConfig(source: Record<string, unknown>, workflow: ResolvedWorkflowSettings["workflow"], sources: Record<WorkflowKey, WorkflowSettingSource>) {
  applyBoolean(source, "_auto_chain_active", workflow, sources);
  applyBoolean(source, "auto_advance", workflow, sources);
  applyBoolean(source, "research", workflow, sources);
  applyBoolean(source, "plan_check", workflow, sources);
  applyBoolean(source, "verifier", workflow, sources);
  applyBoolean(source, "ui_phase", workflow, sources);
  applyBoolean(source, "ui_review", workflow, sources);
  applyBoolean(source, "code_review", workflow, sources);
  applyString(source, "code_review_depth", workflow, sources);
  applyNullableString(source, "code_review_command", workflow, sources);
  applyBoolean(source, "plan_review_convergence", workflow, sources);
  applyPositiveInteger(source, "max_discuss_passes", workflow, sources);
  applyBoolean(source, "plan_bounce", workflow, sources);
  applyPositiveInteger(source, "plan_bounce_passes", workflow, sources);
  applyBoolean(source, "post_planning_gaps", workflow, sources);
  applyBoolean(source, "security_enforcement", workflow, sources);
  applyBoolean(source, "nyquist_validation", workflow, sources);
  applyBoolean(source, "ai_integration_phase", workflow, sources);
  applyBoolean(source, "ui_safety_gate", workflow, sources);
  applyBoolean(source, "auto_prune_state", workflow, sources);
  applyBoolean(source, "research_before_questions", workflow, sources);
  applyBoolean(source, "skip_discuss", workflow, sources);
  applyBooleanAlias(source, "worktrees", "use_worktrees", workflow, sources);
  applyBooleanAlias(source, "plan_check", "plan_checker", workflow, sources);
  applyBoolean(source, "node_repair", workflow, sources);
  applyBoolean(source, "state_reconciliation_apply", workflow, sources);
  applyPositiveInteger(source, "node_repair_budget", workflow, sources);
  applyPositiveInteger(source, "subagent_timeout", workflow, sources);
  applyPositiveInteger(source, "inline_plan_threshold", workflow, sources);
}

function applyBoolean(source: Record<string, unknown>, key: WorkflowKey, workflow: ResolvedWorkflowSettings["workflow"], sources: Record<WorkflowKey, WorkflowSettingSource>) {
  if (typeof source[key] === "boolean") {
    workflow[key] = source[key] as never;
    sources[key] = "config";
  }
}

function applyBooleanAlias(source: Record<string, unknown>, key: WorkflowKey, alias: string, workflow: ResolvedWorkflowSettings["workflow"], sources: Record<WorkflowKey, WorkflowSettingSource>) {
  if (typeof source[alias] === "boolean") {
    workflow[key] = source[alias] as never;
    sources[key] = "config";
    return;
  }
  applyBoolean(source, key, workflow, sources);
}

function applyString(source: Record<string, unknown>, key: WorkflowKey, workflow: ResolvedWorkflowSettings["workflow"], sources: Record<WorkflowKey, WorkflowSettingSource>) {
  if (typeof source[key] === "string") {
    workflow[key] = source[key] as never;
    sources[key] = "config";
  }
}

function applyNullableString(source: Record<string, unknown>, key: WorkflowKey, workflow: ResolvedWorkflowSettings["workflow"], sources: Record<WorkflowKey, WorkflowSettingSource>) {
  if (typeof source[key] === "string" || source[key] === null) {
    workflow[key] = source[key] as never;
    sources[key] = "config";
  }
}

function applyPositiveInteger(source: Record<string, unknown>, key: WorkflowKey, workflow: ResolvedWorkflowSettings["workflow"], sources: Record<WorkflowKey, WorkflowSettingSource>) {
  if (typeof source[key] === "number" && Number.isInteger(source[key]) && source[key] > 0) {
    workflow[key] = source[key] as never;
    sources[key] = "config";
  }
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown) {
  return typeof value === "string" || value === null ? value : null;
}

function positiveIntegerValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
