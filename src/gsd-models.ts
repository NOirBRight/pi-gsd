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

// ── Upstream agent tier assignments (from GSD model-catalog) ────────

const agentTiers: Record<string, GsdTier> = {
  // heavy (deep reasoning — planning, debugging, architecture)
  "gsd-planner": "heavy",
  "gsd-roadmapper": "heavy",
  "gsd-debugger": "heavy",
  "gsd-assumptions-analyzer": "heavy",
  "gsd-debug-session-manager": "heavy",
  "gsd-eval-planner": "heavy",
  "gsd-framework-selector": "heavy",
  "gsd-security-auditor": "heavy",
  "gsd-user-profiler": "heavy",
  // standard (workhorse — execution, research, writing)
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
  // light (high-volume, structured output — mappers, scanners, audits)
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

const tierDescriptions: Record<GsdTier, string> = {
  light: "mapping, scanning, audits (e.g. gsd-codebase-mapper)",
  standard: "execution, research, writing (e.g. gsd-executor)",
  heavy: "planning, debugging, architecture (e.g. gsd-planner)",
};

const profileDescriptions: Record<GsdProfile | "inherit", string> = {
  inherit: `All GSD agents use your current model`,
  quality: "Heavy model for every agent (maximum quality)",
  balanced: "Heavy for planning, standard for execution, light for mapping",
  budget: "Standard for execution, light for everything else",
  adaptive: "Heavy for planning/debugging, standard for execution, light for mapping",
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

// ── Formatting helpers ──────────────────────────────────────────────

export function formatModelId(model: ModelChoiceLike): string {
  return `${model.provider}/${model.id}`;
}

export function formatModelChoiceLabel(model: ModelChoiceLike, scopedModelIds?: Set<string>): string {
  const id = formatModelId(model);
  const inScope = scopedModelIds?.has(id) ?? true;
  const marker = inScope ? "● " : "○ ";
  const suffix = model.name && model.name !== model.id ? ` — ${model.name}` : "";
  return `${marker}${id}${suffix}`;
}

// ── Interactive command ──────────────────────────────────────────────

export type GsdModelsCommandContext = {
  cwd: string;
  model: ModelChoiceLike;
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
  const currentConfigPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const currentConfig = readJsonObject(currentConfigPath);
  const currentProfile = typeof currentConfig.model_profile === "string" ? currentConfig.model_profile : "(not set)";

  const mode = await ctx.ui.select<GsdProfile | "inherit">(
    `GSD model routing [${scope}] — current: ${currentProfile}`,
    (["inherit", "quality", "balanced", "budget", "adaptive"] as const).map((p) => ({
      value: p,
      label: p === "inherit" ? "Inherit" : p.charAt(0).toUpperCase() + p.slice(1),
      description: profileDescriptions[p],
    })),
  );
  if (!mode) return;

  if (mode === "inherit") {
    const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
    const merged = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, merged);
    ctx.ui.notify(`✓ GSD set to inherit (${formatModelId(ctx.model)}) → ${configPath}`, "info");
    return;
  }

  // For non-inherit profiles, user picks a Pi model for each tier
  const tiers = await chooseTierModels(available, ctx);
  if (!tiers) return;

  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const merged = mergeGsdModelConfig(readJsonObject(configPath), {
    model_profile: mode,
    model_overrides: buildTierModelOverrides(tiers),
  });
  writeJsonObject(configPath, merged);
  ctx.ui.notify(`✓ GSD set to ${mode} [L=${tiers.light} S=${tiers.standard} H=${tiers.heavy}] → ${configPath}`, "info");
}

function parseScope(args: string | undefined): GsdModelScope {
  const trimmed = args?.trim().toLowerCase() ?? "";
  if (trimmed === "--user" || trimmed === "user") return "user";
  return "project";
}

async function chooseTierModels(
  available: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
): Promise<TierModelMap | undefined> {
  const heavy = await chooseModel(`Heavy tier (${tierDescriptions.heavy})`, available, ctx);
  if (heavy === undefined) return undefined;
  const standard = await chooseModel(`Standard tier (${tierDescriptions.standard})`, available, ctx);
  if (standard === undefined) return undefined;
  const light = await chooseModel(`Light tier (${tierDescriptions.light})`, available, ctx);
  if (light === undefined) return undefined;
  return { heavy, standard, light };
}

async function chooseModel(
  title: string,
  available: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
): Promise<string | undefined> {
  const currentId = formatModelId(ctx.model);
  const items = available.map((model) => {
    const id = formatModelId(model);
    const isCurrent = id === currentId;
    const marker = isCurrent ? "▸ " : "  ";
    const suffix = model.name && model.name !== model.id ? ` — ${model.name}` : "";
    return {
      value: id,
      label: `${marker}${id}${suffix}`,
    };
  });

  return ctx.ui.select<string>(title, items);
}

// ── Backward-compatible alias for tests ──────────────────────────────

export const buildBalancedModelOverrides = (tiers: { haiku: string; sonnet: string; opus: string }): Record<string, string> => {
  return buildTierModelOverrides({
    light: tiers.haiku,
    standard: tiers.sonnet,
    heavy: tiers.opus,
  });
};