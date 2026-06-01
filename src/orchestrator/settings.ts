import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OrchestrationUnit, QueueBuildInput, QueueBuildResult, ResolvedWorkflowSettings, UnitType, WorkflowSettingSource } from "./types.js";

export class OrchestratorSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestratorSettingsError";
  }
}

const DEFAULT_WORKFLOW_SETTINGS: ResolvedWorkflowSettings["workflow"] = {
  _auto_chain_active: false,
  auto_advance: false,
  research: true,
  plan_check: true,
  verifier: true,
  ui_phase: true,
  ui_review: true,
  code_review: true,
  skip_discuss: false,
  worktrees: true,
  node_repair: true,
  node_repair_budget: 2,
};

type WorkflowKey = keyof ResolvedWorkflowSettings["workflow"];

export function resolveWorkflowSettings(options: { cwd?: string; configPath?: string; defaults?: Partial<ResolvedWorkflowSettings["workflow"]> } = {}): ResolvedWorkflowSettings {
  const workflow = { ...DEFAULT_WORKFLOW_SETTINGS, ...options.defaults };
  const sources = Object.fromEntries(Object.keys(workflow).map((key) => [key, "default"])) as Record<WorkflowKey, WorkflowSettingSource>;
  const configPath = options.configPath ?? join(options.cwd ?? process.cwd(), ".planning", "config.json");
  const fallbackConfigPath = options.configPath ? undefined : join(options.cwd ?? process.cwd(), "config.json");
  const actualConfigPath = existsSync(configPath) ? configPath : fallbackConfigPath && existsSync(fallbackConfigPath) ? fallbackConfigPath : undefined;

  if (actualConfigPath) {
    const config = readConfig(actualConfigPath);
    const configWorkflow = isRecord(config) && isRecord(config.workflow) ? config.workflow : {};
    applyBoolean(configWorkflow, "_auto_chain_active", workflow, sources);
    applyBoolean(configWorkflow, "auto_advance", workflow, sources);
    applyBoolean(configWorkflow, "research", workflow, sources);
    applyBoolean(configWorkflow, "plan_check", workflow, sources);
    applyBoolean(configWorkflow, "verifier", workflow, sources);
    applyBoolean(configWorkflow, "ui_phase", workflow, sources);
    applyBoolean(configWorkflow, "ui_review", workflow, sources);
    applyBoolean(configWorkflow, "code_review", workflow, sources);
    applyBoolean(configWorkflow, "skip_discuss", workflow, sources);
    applyBooleanAlias(configWorkflow, "worktrees", "use_worktrees", workflow, sources);
    applyBoolean(configWorkflow, "node_repair", workflow, sources);
    applyPositiveInteger(configWorkflow, "node_repair_budget", workflow, sources);
  }

  return { workflow, sources };
}

export function buildUnitQueue(input: QueueBuildInput): QueueBuildResult {
  const settings = input.settings ?? resolveWorkflowSettings({ cwd: input.cwd, configPath: input.configPath });
  const phase = input.phase;

  if (input.phaseSignals?.isUiPhase && !settings.workflow.ui_phase) {
    const resumeHint = "Phase signals require UI planning but workflow.ui_phase is disabled. Ask the user whether to enable workflow.ui_phase or continue without the UI Unit.";
    return { decision: "pause_for_user", settings, resumeHint, units: [unit(phase, "pause-for-user", settings, { resumeHint, source: "phase-signal" })] };
  }

  const units: OrchestrationUnit[] = [];
  if (!settings.workflow.skip_discuss) units.push(unit(phase, "discuss", settings));
  if (settings.workflow.research) units.push(unit(phase, "research", settings));
  if (input.phaseSignals?.isUiPhase && settings.workflow.ui_phase) units.push(unit(phase, "settings-gate", settings, { label: "UI phase settings gate", source: "phase-signal", metadata: { setting: "workflow.ui_phase" } }));
  units.push(unit(phase, "plan", settings));
  if (settings.workflow.plan_check) units.push(unit(phase, "plan-check", settings));
  units.push(unit(phase, "execute", settings));
  if (settings.workflow.code_review) units.push(unit(phase, "code-review", settings));
  if (settings.workflow.verifier) units.push(unit(phase, "verify", settings));
  if (input.phaseSignals?.requiresUiReview && settings.workflow.ui_review) units.push(unit(phase, "ui-review", settings));
  units.push(unit(phase, "closeout", settings));

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
  if (type === "code-review") return "code_review";
  if (type === "discuss") return "skip_discuss";
  if (type === "settings-gate") return "ui_phase";
  return undefined;
}

function readConfig(configPath: string) {
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  } catch (error) {
    throw new OrchestratorSettingsError(`Could not read orchestrator settings from ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
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

function applyPositiveInteger(source: Record<string, unknown>, key: "node_repair_budget", workflow: ResolvedWorkflowSettings["workflow"], sources: Record<WorkflowKey, WorkflowSettingSource>) {
  if (typeof source[key] === "number" && Number.isInteger(source[key]) && source[key] > 0) {
    workflow[key] = source[key];
    sources[key] = "config";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
