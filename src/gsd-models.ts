import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  Container,
  SelectList,
  type SelectItem,
  Text,
  matchesKey,
  Key,
} from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";

// ── Types ───────────────────────────────────────────────────────────

export type GsdModelScope = "project" | "global";
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

// ── Model catalog ───────────────────────────────────────────────────
// Loaded from @opengsd/get-shit-done-redux/sdk/shared/model-catalog.json

type CatalogAgent = {
  golden: string;   // quality profile tier alias
  balanced: string;  // balanced profile tier alias
  budget: string;   // budget profile tier alias
  phaseType: string;
  routingTier: string; // adaptive profile tier (heavy/standard/light)
};

type ModelCatalog = {
  profiles: string[];
  adaptiveTierMap: Record<string, string>; // heavy→opus, standard→sonnet, light→haiku
  agents: Record<string, CatalogAgent>;
};

let _catalogCache: ModelCatalog | null = null;

export function loadModelCatalog(gsdPackageRoot: string): ModelCatalog {
  if (_catalogCache) return _catalogCache;
  const candidates = [
    join(gsdPackageRoot, "get-shit-done", "bin", "shared", "model-catalog.json"),
    join(gsdPackageRoot, "sdk", "shared", "model-catalog.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      _catalogCache = JSON.parse(readFileSync(p, "utf8")) as ModelCatalog;
      return _catalogCache;
    }
  }
  throw new Error(`model-catalog.json not found. Tried: ${candidates.join(", ")}`);
}

/** Tier alias used in catalog (opus/sonnet/haiku) → our tier name (heavy/standard/light). */
const ALIAS_TO_TIER: Record<string, GsdTier> = { opus: "heavy", sonnet: "standard", haiku: "light" };
const TIER_TO_ALIAS: Record<GsdTier, string> = { heavy: "opus", standard: "sonnet", light: "haiku" };

/** For a given profile, map each tier alias (opus/sonnet/haiku) to the list of agents. */
export function getProfileTierAgents(
  catalog: ModelCatalog,
  profile: GsdProfile | "inherit",
): Map<GsdTier, string[]> {
  const result = new Map<GsdTier, string[]>();
  if (profile === "inherit") return result;

  for (const [agent, meta] of Object.entries(catalog.agents)) {
    let alias: string;
    if (profile === "adaptive") {
      alias = catalog.adaptiveTierMap[meta.routingTier];
    } else if (profile === "quality") {
      alias = meta.golden;
    } else {
      // balanced, budget — field name matches profile name
      alias = meta[profile];
    }
    const tier = ALIAS_TO_TIER[alias];
    if (!tier) continue;
    const list = result.get(tier);
    if (list) list.push(agent);
    else result.set(tier, [agent]);
  }

  return result;
}

/** Get the list of tiers that need model selection for a profile. */
export function getRequiredTiers(profile: GsdProfile | "inherit"): GsdTier[] {
  if (profile === "inherit") return [];
  if (profile === "quality") return ["heavy", "standard"];
  if (profile === "budget") return ["standard", "light"];
  return ["heavy", "standard", "light"]; // balanced, adaptive
}

// ── Tier display ────────────────────────────────────────────────────

const tierLabels: Record<GsdTier, { short: string; label: string }> = {
  heavy: { short: "H", label: "Heavy" },
  standard: { short: "S", label: "Standard" },
  light: { short: "L", label: "Light" },
};

// ── Pure helpers ─────────────────────────────────────────────────────

export function resolveGsdConfigPath(options: { scope: GsdModelScope; cwd: string; homeDir?: string }): string {
  if (options.scope === "project") {
    return join(options.cwd, ".planning", "config.json");
  }
  return join(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}

export function buildTierModelOverrides(tiers: TierModelMap, catalog: ModelCatalog, profile: GsdProfile): Record<string, string> {
  const tierAgents = getProfileTierAgents(catalog, profile);
  const overrides: Record<string, string> = {};
  for (const [tier, agents] of tierAgents) {
    const modelId = tiers[tier];
    if (!modelId) continue;
    for (const agent of agents) {
      overrides[agent] = modelId;
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

/** Read the current GSD config and decode the profile + per-tier model assignments. */
export function readCurrentGsdConfig(configPath: string, catalog: ModelCatalog): {
  profile: string | null;
  tierModels: TierModelMap | null;
} {
  if (!existsSync(configPath)) return { profile: null, tierModels: null };
  const config = readJsonObject(configPath);
  const profile = typeof config.model_profile === "string" ? config.model_profile : null;
  if (profile === "inherit" || !profile) {
    return { profile: profile ?? null, tierModels: null };
  }
  const overrides = config.model_overrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return { profile, tierModels: null };
  }
  return { profile, tierModels: inferTierModelsFromOverrides(overrides as Record<string, string>, catalog, profile as GsdProfile) };
}

/** Reverse-map model_overrides back into per-tier model assignments using catalog data. */
export function inferTierModelsFromOverrides(
  overrides: Record<string, string>,
  catalog: ModelCatalog,
  profile: GsdProfile,
): TierModelMap | null {
  const tierAgents = getProfileTierAgents(catalog, profile);
  const result: Partial<TierModelMap> = {};
  for (const [tier, agents] of tierAgents) {
    if (agents.length === 0) continue;
    const sample = overrides[agents[0]];
    if (!sample) return null;
    result[tier] = sample;
  }
  if (result.heavy === undefined && result.standard === undefined && result.light === undefined) {
    return null;
  }
  return result as TierModelMap;
}

// ── Status display ───────────────────────────────────────────────────

/** Format agent names, strip "gsd-" prefix, show top N + count. */
function formatAgentSummary(agents: string[], maxNames = 3): string {
  const names = agents.map((a) => a.replace(/^gsd-/, ""));
  const count = names.length;
  const shown = names.slice(0, maxNames);
  const remaining = count - shown.length;
  if (remaining > 0) {
    return `${shown.join(", ")}, ... (${count})`;
  }
  return shown.join(", ");
}

/** Capitalize first letter of a string. */
function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function buildCurrentStatus(
  currentConfig: { profile: string | null; tierModels: TierModelMap | null },
  catalog: ModelCatalog,
  scope: GsdModelScope,
): string {
  const profileRaw = currentConfig.profile ?? "inherit";
  const profile = capitalize(profileRaw);
  const COL_WIDTH = 11;
  const label = "STATUS:".padEnd(COL_WIDTH);

  if (scope === "project" && profileRaw === "inherit") {
    return `${label}(using Global config)`;
  }
  if (profileRaw === "inherit") {
    return `${label}Inherit (Pi session model)`;
  }

  const lines = [`${label}${profile}`];
  const tierAgents = getProfileTierAgents(catalog, profileRaw as GsdProfile);

  for (const tier of ["heavy", "standard", "light"] as GsdTier[]) {
    const agents = tierAgents.get(tier);
    const model = currentConfig.tierModels?.[tier];
    if (!agents || !model) continue;

    const tierLabel = (tierLabels[tier].label.toUpperCase() + ":").padEnd(COL_WIDTH);
    lines.push(`${tierLabel}${model}`);
    
    const summary = formatAgentSummary(agents, 2);
    lines.push(" ".repeat(COL_WIDTH) + "agents: " + summary);
  }

  return lines.join("\n");
}

// ── Interactive command ──────────────────────────────────────────────

export type GsdModelsCommandContext = {
  cwd: string;
  sessionModel: string;
  enabledModels: string[];
  gsdPackageRoot: string;
  modelRegistry: { getAvailable(): ModelChoiceLike[] };
  ui: {
    select<T>(
      title: string,
      items: Array<{ value: T; label: string; description?: string }>,
    ): Promise<T | undefined>;
    custom<T>(
      factory: (
        tui: any,
        theme: any,
        kb: any,
        done: (value: T) => void,
      ) => any,
      options?: { overlay?: boolean },
    ): Promise<T>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
};

export async function runGsdModelsCommand(
  args: string | undefined,
  ctx: GsdModelsCommandContext,
): Promise<void> {
  // 0. Load catalog
  const catalog = loadModelCatalog(ctx.gsdPackageRoot);

  // 1. Gather & filter models
  const allAvailable = ctx.modelRegistry.getAvailable();
  const enabledIds = new Set(ctx.enabledModels);
  const filtered = enabledIds.size > 0
    ? allAvailable.filter((m) => enabledIds.has(formatModelId(m)))
    : allAvailable;
  if (filtered.length === 0) {
    ctx.ui.notify("No enabled models available for selection.", "error");
    return;
  }
  if (enabledIds.size === 0) {
    ctx.ui.notify("No enabledModels filter found; showing all models with configured auth", "warning");
  }

  // 2. Select scope
  const scope = await selectScope(ctx, args);
  if (!scope) return;

  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const currentConfig = readCurrentGsdConfig(configPath, catalog);

  // 3. Select profile
  const currentStatus = buildCurrentStatus(currentConfig, catalog, scope);
  const profileItems = buildProfileOptions(catalog, scope, currentConfig);
  const selectedProfile = await ctx.ui.select<GsdProfile | "inherit" | "clear">(
    `GSD Model Profile [${capitalize(scope)}]\n\n${currentStatus}`,
    profileItems,
  );
  // ESC = keep current profile, end
  const profile = selectedProfile ?? (currentConfig.profile as GsdProfile | "inherit") ?? "inherit";

  // 4. Handle inherit and clear
  if (profile === "inherit") {
    const merged = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, merged);
    ctx.ui.notify(`✓ GSD: inherit (uses Pi session model) → ${configPath}`, "info");
    return;
  }
  if (profile === "clear") {
    // Delete project config to fall back to global
    if (existsSync(configPath)) {
      const fs = await import("node:fs");
      fs.unlinkSync(configPath);
    }
    ctx.ui.notify(`✓ Cleared project config → using global defaults`, "info");
    return;
  }

  // 5. Pick models for required tiers
  const requiredTiers = getRequiredTiers(profile);
  const tierAgents = getProfileTierAgents(catalog, profile);
  const currentTiers = currentConfig.tierModels;

  const tierModels: Partial<TierModelMap> = {};
  for (const tier of requiredTiers) {
    const agents = tierAgents.get(tier) ?? [];
    const currentModel = currentTiers?.[tier] ?? null;
    const selected = await chooseTierModel(
      tier, agents, filtered, allAvailable, ctx, currentModel,
    );
    tierModels[tier] = selected ?? currentModel ?? undefined;
  }

  // 6. Build final tiers with fallbacks
  const finalTiers: TierModelMap = { heavy: "", standard: "", light: "" };
  for (const tier of requiredTiers) {
    finalTiers[tier] = tierModels[tier] ?? currentTiers?.[tier] ?? formatModelId(filtered[0]);
  }
  // For profiles that don't use a tier, assign the closest available
  if (profile === "quality") {
    // No haiku tier — light inherits standard
    finalTiers.light = finalTiers.standard;
  }
  if (profile === "budget") {
    // No opus tier — heavy inherits standard
    finalTiers.heavy = finalTiers.standard;
  }
  if (!finalTiers.heavy) finalTiers.heavy = finalTiers.standard;
  if (!finalTiers.standard) finalTiers.standard = finalTiers.heavy;
  if (!finalTiers.light) finalTiers.light = finalTiers.standard;

  // 7. Write config
  const overrides = buildTierModelOverrides(finalTiers, catalog, profile);
  const merged = mergeGsdModelConfig(readJsonObject(configPath), {
    model_profile: profile,
    model_overrides: overrides,
  });
  writeJsonObject(configPath, merged);

  // Notify with full agent→model mapping
  const notifyLines = [`✓ GSD: ${profile}`];
  for (const t of ["heavy", "standard", "light"] as GsdTier[]) {
    const agents = tierAgents.get(t);
    if (agents && agents.length > 0 && finalTiers[t]) {
      notifyLines.push(`  ${tierLabels[t].label}(${agents.length}) → ${finalTiers[t]}`);
    }
  }
  notifyLines.push(`→ ${configPath}`);
  ctx.ui.notify(notifyLines.join("\n"), "info");
}

// ── Scope selection ──────────────────────────────────────────────────

async function selectScope(
  ctx: GsdModelsCommandContext,
  args: string | undefined,
): Promise<GsdModelScope | undefined> {
  const argScope = parseScope(args);
  if (argScope) return argScope;

  const selected = await ctx.ui.select<GsdModelScope>(
    "GSD Model Config — Select Scope",
    [
      { value: "global", label: "Global", description: "~/.gsd/defaults.json (all projects)" },
      { value: "project", label: "Project", description: ".planning/config.json (this project)" },
    ],
  );
  return selected; // undefined = ESC → terminate
}

function parseScope(args: string | undefined): GsdModelScope | null {
  const trimmed = args?.trim().toLowerCase() ?? "";
  if (trimmed === "--user" || trimmed === "user" || trimmed === "--global" || trimmed === "global") return "global";
  if (trimmed === "--project" || trimmed === "project") return "project";
  return null;
}

// ── Profile options ──────────────────────────────────────────────────

function buildProfileOptions(
  catalog: ModelCatalog,
  scope: GsdModelScope,
  currentConfig: { profile: string | null; tierModels: TierModelMap | null },
): Array<{ value: GsdProfile | "inherit" | "clear"; label: string; description: string }> {
  const options: Array<{ value: GsdProfile | "inherit" | "clear"; label: string; description: string }> = [
    {
      value: "inherit" as const,
      label: "Inherit",
      description: "All agents → (Pi session model)",
    },
  ];

  // Build profile options with concrete agent assignments in description
  const profileTiers: Array<{ value: GsdProfile; label: string }> = [
    { value: "quality", label: "Quality" },
    { value: "balanced", label: "Balanced" },
    { value: "budget", label: "Budget" },
    { value: "adaptive", label: "Adaptive" },
  ];

  for (const { value, label } of profileTiers) {
    const tiers = getRequiredTiers(value);
    const tierAgents = getProfileTierAgents(catalog, value);
    const desc = tiers.map((t) => {
      const agents = tierAgents.get(t);
      const count = agents ? agents.length : 0;
      return `${tierLabels[t].label}: ${count} agents`;
    }).join(" | ");
    options.push({ value, label, description: desc });
  }

  // Add Clear option for project scope only
  if (scope === "project") {
    options.push({
      value: "clear" as const,
      label: "Clear (use Global)",
      description: "Delete project config, fall back to global defaults",
    });
  }

  return options;
}

// ── Tier model picking ───────────────────────────────────────────────

async function chooseTierModel(
  tier: GsdTier,
  agents: string[],
  scoped: ModelChoiceLike[],
  all: ModelChoiceLike[],
  ctx: GsdModelsCommandContext,
  currentModelId: string | null,
): Promise<string | undefined> {
  const agentSummary = formatAgentSummary(agents);
  const currentLabel = currentModelId ?? "(none)";
  const statusLine = `${tierLabels[tier].label.toUpperCase()} tier — agents: ${agentSummary}`;

  // Pre-filter scoped models by enabledModels if not already done
  const scopedIds = new Set(scoped.map(m => formatModelId(m)));

  return await ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
    let mode: "scoped" | "all" = scoped.length > 0 ? "scoped" : "all";
    const container = new Container();

    const getItems = (): SelectItem[] => {
      const list = mode === "scoped" ? scoped : all;
      const sorted = [...list].sort((a, b) => {
        const aId = formatModelId(a);
        const bId = formatModelId(b);
        return aId.localeCompare(bId);
      });
      return sorted.map((m) => {
        const id = formatModelId(m);
        const isCurrent = id === currentModelId;
        return {
          value: id,
          label: isCurrent ? `${id} ✓` : id,
          description: undefined,
        };
      });
    };

    let selectTheme: any = {
      selectedPrefix: (t: string) => theme.fg("accent", t),
      selectedText: (t: string) => theme.fg("accent", t),
      description: (t: string) => theme.fg("muted", t),
      scrollInfo: (t: string) => theme.fg("dim", t),
      noMatch: (t: string) => theme.fg("warning", t),
    };

    let selectList = new SelectList(getItems(), 15, selectTheme);

    const rebuild = () => {
      container.clear();
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold(statusLine)), 1, 0));
      container.addChild(new Text(theme.fg("dim", `Current: ${currentLabel}`), 1, 0));

      const tabHeader = mode === "scoped"
        ? ` ${theme.bg("selectedBg", theme.fg("userMessageText", " SCOPED "))}  ${theme.fg("muted", " ALL ")}`
        : ` ${theme.fg("muted", " SCOPED ")}  ${theme.bg("selectedBg", theme.fg("userMessageText", " ALL "))}`;

      container.addChild(new Text(tabHeader, 1, 1));
      container.addChild(selectList);
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • tab switch • enter select • esc keep current"), 1, 0));
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    };

    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(currentModelId ?? undefined);

    rebuild();

    return {
      render: (w: number) => container.render(w),
      invalidate: () => {
        container.invalidate();
        rebuild();
      },
      handleInput: (data: string) => {
        if (matchesKey(data, Key.tab)) {
          mode = mode === "scoped" ? "all" : "scoped";
          selectList = new SelectList(getItems(), 15, selectTheme);
          selectList.onSelect = (item) => done(item.value);
          selectList.onCancel = () => done(currentModelId ?? undefined);
          rebuild();
          tui.requestRender();
          return;
        }
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

// ── Backward-compatible alias ─────────────────────────────────────────

export const buildBalancedModelOverrides = (tiers: { haiku: string; sonnet: string; opus: string }): Record<string, string> => {
  // Legacy alias — not profile-aware, for backward compat only
  const overrides: Record<string, string> = {};
  // This is a rough approximation; prefer buildTierModelOverrides with catalog
  return overrides;
};