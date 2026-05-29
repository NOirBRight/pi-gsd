import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ── Types ───────────────────────────────────────────────────────────

export type GsdModelScope = "project" | "user";
export type GsdTier = "haiku" | "sonnet" | "opus";
export type TierModelMap = Record<GsdTier, string>;
export type GsdModelConfigPatch = {
  model_profile: "inherit" | "balanced";
  model_overrides?: Record<string, string>;
};

export type ModelChoiceLike = {
  provider: string;
  id: string;
  name?: string;
};

// ── Balanced tier agents (from upstream GSD "balanced" profile) ─────

const balancedTierAgents: Record<GsdTier, string[]> = {
  haiku: [
    "gsd-codebase-mapper",
    "gsd-pattern-mapper",
    "gsd-research-synthesizer",
    "gsd-plan-checker",
    "gsd-integration-checker",
    "gsd-nyquist-auditor",
    "gsd-ui-checker",
    "gsd-ui-auditor",
    "gsd-doc-verifier",
  ],
  sonnet: [
    "gsd-planner",
    "gsd-executor",
    "gsd-phase-researcher",
    "gsd-project-researcher",
    "gsd-debugger",
    "gsd-verifier",
    "gsd-ui-researcher",
    "gsd-doc-writer",
    "gsd-code-reviewer",
    "gsd-code-fixer",
    "gsd-security-auditor",
    "gsd-intel-updater",
  ],
  opus: [
    "gsd-roadmapper",
    "gsd-ai-researcher",
    "gsd-domain-researcher",
    "gsd-eval-planner",
    "gsd-eval-auditor",
    "gsd-framework-selector",
    "gsd-assumptions-analyzer",
    "gsd-advisor-researcher",
    "gsd-debug-session-manager",
    "gsd-doc-classifier",
    "gsd-doc-synthesizer",
    "gsd-user-profiler",
  ],
};

export const keyGsdAgents = [
  "gsd-codebase-mapper",
  "gsd-planner",
  "gsd-executor",
  "gsd-roadmapper",
  "gsd-phase-researcher",
  "gsd-project-researcher",
  "gsd-code-reviewer",
  "gsd-verifier",
  "gsd-plan-checker",
] as const;

// ── Pure helpers ─────────────────────────────────────────────────────

export function resolveGsdConfigPath(options: { scope: GsdModelScope; cwd: string; homeDir?: string }): string {
  if (options.scope === "project") {
    return join(options.cwd, ".planning", "config.json");
  }
  return join(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}

export function buildBalancedModelOverrides(tiers: TierModelMap): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const tier of ["haiku", "sonnet", "opus"] as const) {
    for (const agent of balancedTierAgents[tier]) {
      overrides[agent] = tiers[tier];
    }
  }
  return overrides;
}

export function mergeGsdModelConfig(
  existing: Record<string, unknown>,
  patch: GsdModelConfigPatch,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing, model_profile: patch.model_profile };

  if (patch.model_profile === "inherit") {
    delete next.model_overrides;
    return next;
  }

  next.model_overrides = { ...(patch.model_overrides ?? {}) };
  return next;
}

export function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export function writeJsonObject(filePath: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// ── Formatting helpers ──────────────────────────────────────────────

export function formatModelId(model: ModelChoiceLike): string {
  return `${model.provider}/${model.id}`;
}

export function formatModelChoiceLabel(model: ModelChoiceLike): string {
  const id = formatModelId(model);
  return model.name && model.name !== model.id ? `${id} — ${model.name}` : id;
}

// ── Interactive command (called from extension registerCommand handler) ──

export type GsdModelsCommandContext = {
  cwd: string;
  model: ModelChoiceLike;
  modelRegistry: { getAvailable(): Promise<ModelChoiceLike[]> };
  ui: {
    select<T>(
      title: string,
      items: Array<{ value: T; label: string; description?: string }>,
    ): Promise<T | undefined>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
};

export async function runGsdModelsCommand(
  args: string | undefined,
  ctx: GsdModelsCommandContext,
): Promise<void> {
  const available = await ctx.modelRegistry.getAvailable();
  if (available.length === 0) {
    ctx.ui.notify("No Pi models with valid credentials are available.", "error");
    return;
  }

  const scope = await chooseScope(args, ctx);
  if (!scope) return;

  const mode = await ctx.ui.select<"inherit" | "balanced" | "agents">("GSD model configuration", [
    {
      value: "inherit",
      label: "Inherit current Pi model",
      description: `Use ${formatModelChoiceLabel(ctx.model)} for GSD subagents`,
    },
    {
      value: "balanced",
      label: "Map balanced tiers",
      description: "Choose local models for haiku, sonnet, and opus tiers",
    },
    {
      value: "agents",
      label: "Per-agent overrides",
      description: "Choose local models for key GSD agents",
    },
  ]);
  if (!mode) return;

  let patch: GsdModelConfigPatch;
  if (mode === "inherit") {
    patch = { model_profile: "inherit" };
  } else if (mode === "balanced") {
    patch = {
      model_profile: "balanced",
      model_overrides: buildBalancedModelOverrides(await chooseTierModels(available, ctx)),
    };
  } else {
    patch = {
      model_profile: "balanced",
      model_overrides: await chooseAgentModels(available, ctx),
    };
  }

  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const merged = mergeGsdModelConfig(readJsonObject(configPath), patch);
  writeJsonObject(configPath, merged);
  ctx.ui.notify(`GSD model config updated: ${configPath}`, "info");
}

async function chooseScope(
  args: string | undefined,
  ctx: GsdModelsCommandContext,
): Promise<GsdModelScope | undefined> {
  const trimmed = args?.trim();
  if (trimmed === "--user" || trimmed === "user") return "user";
  if (trimmed === "--project" || trimmed === "project" || trimmed === "") return "project";
  return ctx.ui.select<"project" | "user">("GSD config scope", [
    { value: "project", label: "Project", description: ".planning/config.json (recommended)" },
    { value: "user", label: "User", description: "~/.gsd/defaults.json (applies across projects)" },
  ]);
}

async function chooseTierModels(
  available: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
): Promise<TierModelMap> {
  return {
    haiku: await chooseModel("Fast/light tier (haiku)", available, ctx),
    sonnet: await chooseModel("Standard tier (sonnet)", available, ctx),
    opus: await chooseModel("Heavy tier (opus)", available, ctx),
  };
}

async function chooseAgentModels(
  available: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
): Promise<Record<string, string>> {
  const overrides: Record<string, string> = {};
  for (const agent of keyGsdAgents) {
    const selected = await chooseModel(agent, available, ctx);
    overrides[agent] = selected;
  }
  return overrides;
}

async function chooseModel(
  title: string,
  available: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
): Promise<string> {
  const selected = await ctx.ui.select<string>(title, available.map((model) => ({
    value: formatModelId(model),
    label: formatModelChoiceLabel(model),
  })));
  return selected ?? formatModelId(ctx.model);
}