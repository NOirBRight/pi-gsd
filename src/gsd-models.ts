import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ── Types ───────────────────────────────────────────────────────────

export type GsdModelScope = "project" | "user";
export type GsdTier = "light" | "standard" | "heavy";
export type GsdProfile = "quality" | "balanced" | "budget" | "adaptive";
export type TierModelMap = Record<GsdTier, string>;
export type GsdModelConfigPatch = {
  model_profile: GsdProfile | "inherit";
  model_overrides?: Record<string, string>;
};

export type ModelChoiceLike = {
  provider: string;
  id: string;
  name?: string;
};

// ── Tier definitions ─────────────────────────────────────────────────

const agentTiers: Record<string, GsdTier> = {
  "gsd-planner": "heavy",
  "gsd-roadmapper": "heavy",
  "gsd-debugger": "heavy",
  "gsd-assumptions-analyzer": "heavy",
  "gsd-debug-session-manager": "heavy",
  "gsd-eval-planner": "heavy",
  "gsd-framework-selector": "heavy",
  "gsd-security-auditor": "heavy",
  "gsd-user-profiler": "heavy",
  "gsd-executor": "standard",
  "gsd-phase-researcher": "standard",
  "gsd-project-researcher": "standard",
  "gsd-verifier": "standard",
  "gsd-ui-researcher": "standard",
  "gsd-doc-writer": "standard",
  "gsd-code-reviewer": "standard",
  "gsd-code-fixer": "standard",
  "gsd-domain-researcher": "standard",
  "gsd-eval-auditor": "standard",
  "gsd-doc-synthesizer": "standard",
  "gsd-ai-researcher": "standard",
  "gsd-advisor-researcher": "standard",
  "gsd-codebase-mapper": "light",
  "gsd-pattern-mapper": "light",
  "gsd-research-synthesizer": "light",
  "gsd-plan-checker": "light",
  "gsd-integration-checker": "light",
  "gsd-nyquist-auditor": "light",
  "gsd-ui-checker": "light",
  "gsd-ui-auditor": "light",
  "gsd-doc-verifier": "light",
  "gsd-doc-classifier": "light",
  "gsd-intel-updater": "light",
};

const tierLabels: Record<GsdTier, { short: string; desc: string }> = {
  heavy: { short: "H", desc: "planning, debugging, architecture" },
  standard: { short: "S", desc: "execution, research, writing" },
  light: { short: "L", desc: "mapping, scanning, audits" },
};

// ── Pure helpers ─────────────────────────────────────────────────────

export function resolveGsdConfigPath(options: { scope: GsdModelScope; cwd: string; homeDir?: string }): string {
  if (options.scope === "project") {
    return join(options.cwd, ".planning", "config.json");
  }
  return join(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}

export function buildTierModelOverrides(tiers: TierModelMap): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const [agent, tier] of Object.entries(agentTiers)) {
    overrides[agent] = tiers[tier];
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

export function formatModelId(model: ModelChoiceLike): string {
  return `${model.provider}/${model.id}`;
}

export function readEnabledModels(homeDir?: string): string[] {
  const settingsPath = join(homeDir ?? homedir(), ".pi", "agent", "settings.json");
  try {
    if (!existsSync(settingsPath)) return [];
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    return Array.isArray(parsed?.enabledModels) ? parsed.enabledModels : [];
  } catch {
    return [];
  }
}

// ── Interactive command ──────────────────────────────────────────────

export type GsdModelsCommandContext = {
  cwd: string;
  model: ModelChoiceLike;
  enabledModels: string[];
  modelRegistry: { getAvailable(): ModelChoiceLike[] };
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
  const available = ctx.modelRegistry.getAvailable();
  if (available.length === 0) {
    ctx.ui.notify("No Pi models with valid credentials are available.", "error");
    return;
  }

  const scope = parseScope(args);
  const currentModelId = formatModelId(ctx.model);

  // Step 1: Pick tier models
  const tiers = await chooseTierModels(available, ctx);
  if (!tiers) return;

  // Step 2: Pick profile — show concrete assignments
  const mode = await ctx.ui.select<GsdProfile | "inherit">(
    `Select GSD profile [${scope}] — current model: ${currentModelId}`,
    buildProfileOptions(tiers, ctx.model),
  );
  if (!mode) return;

  // Step 3: Write config
  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  if (mode === "inherit") {
    const merged = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, merged);
    ctx.ui.notify(`✓ GSD: inherit (${currentModelId}) → ${configPath}`, "info");
  } else {
    const merged = mergeGsdModelConfig(readJsonObject(configPath), {
      model_profile: mode,
      model_overrides: buildTierModelOverrides(tiers),
    });
    writeJsonObject(configPath, merged);
    ctx.ui.notify(`✓ GSD: ${mode} [${tierLabels.heavy.short}=${tiers.heavy} ${tierLabels.standard.short}=${tiers.standard} ${tierLabels.light.short}=${tiers.light}] → ${configPath}`, "info");
  }
}

function buildProfileOptions(
  tiers: TierModelMap,
  currentModel: ModelChoiceLike,
): Array<{ value: GsdProfile | "inherit"; label: string; description: string }> {
  const cur = formatModelId(currentModel);
  const h = tiers.heavy;
  const s = tiers.standard;
  const l = tiers.light;
  return [
    {
      value: "inherit" as const,
      label: "Inherit",
      description: `All agents → ${cur}`,
    },
    {
      value: "quality" as const,
      label: "Quality",
      description: `All agents → ${h}`,
    },
    {
      value: "balanced" as const,
      label: "Balanced",
      description: `${tierLabels.heavy.short}: ${h}  ${tierLabels.standard.short}: ${s}  ${tierLabels.light.short}: ${l}`,
    },
    {
      value: "budget" as const,
      label: "Budget",
      description: `${tierLabels.heavy.short}: ${s}  ${tierLabels.standard.short}: ${s}  ${tierLabels.light.short}: ${l}`,
    },
    {
      value: "adaptive" as const,
      label: "Adaptive",
      description: `${tierLabels.heavy.short}: ${h}  ${tierLabels.standard.short}: ${s}  ${tierLabels.light.short}: ${l}`,
    },
  ];
}

// ── Scope & tier picking ─────────────────────────────────────────────

function parseScope(args: string | undefined): GsdModelScope {
  const trimmed = args?.trim().toLowerCase() ?? "";
  if (trimmed === "--user" || trimmed === "user") return "user";
  return "project";
}

async function chooseTierModels(
  available: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
): Promise<TierModelMap | undefined> {
  const heavy = await chooseModel(`Heavy tier (${tierLabels.heavy.desc})`, available, ctx);
  if (heavy === undefined) return undefined;
  const standard = await chooseModel(`Standard tier (${tierLabels.standard.desc})`, available, ctx);
  if (standard === undefined) return undefined;
  const light = await chooseModel(`Light tier (${tierLabels.light.desc})`, available, ctx);
  if (light === undefined) return undefined;
  return { heavy, standard, light };
}

async function chooseModel(
  title: string,
  available: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
): Promise<string | undefined> {
  // Group by provider
  const providerGroups = new Map<string, ModelChoiceLike[]>();
  for (const model of available) {
    const group = providerGroups.get(model.provider);
    if (group) group.push(model);
    else providerGroups.set(model.provider, [model]);
  }

  // Step 1: select provider (alphabetical, current provider first)
  const currentProvider = ctx.model.provider;
  const sortedProviders = [...providerGroups.keys()].sort((a, b) => {
    if (a === currentProvider) return -1;
    if (b === currentProvider) return 1;
    return a.localeCompare(b);
  });

  const providerItems = sortedProviders.map((provider) => ({
    value: provider,
    label: provider === currentProvider ? `▸ ${provider}` : provider,
  }));

  const selectedProvider = await ctx.ui.select<string>(`Provider: ${title}`, providerItems);
  if (selectedProvider === undefined) return undefined;

  // Step 2: select model within provider (current model first, then alphabetical)
  const models = providerGroups.get(selectedProvider) ?? [];
  const currentId = formatModelId(ctx.model);

  const sortedModels = [...models].sort((a, b) => {
    const aId = formatModelId(a);
    const bId = formatModelId(b);
    if (aId === currentId) return -1;
    if (bId === currentId) return 1;
    return aId.localeCompare(bId);
  });

  const modelItems = sortedModels.map((model) => {
    const id = formatModelId(model);
    const isCurrent = id === currentId;
    const marker = isCurrent ? "▸ " : "  ";
    const suffix = model.name && model.name !== model.id ? ` — ${model.name}` : "";
    return {
      value: id,
      label: `${marker}${id}${suffix}`,
    };
  });

  return ctx.ui.select<string>(title, modelItems);
}

// ── Backward-compatible alias ─────────────────────────────────────────

export const buildBalancedModelOverrides = (tiers: { haiku: string; sonnet: string; opus: string }): Record<string, string> => {
  return buildTierModelOverrides({ light: tiers.haiku, standard: tiers.sonnet, heavy: tiers.opus });
};