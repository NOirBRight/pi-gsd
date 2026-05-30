var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/extension.ts
import { accessSync, constants as fsConstants, mkdirSync as mkdirSync2, rmSync } from "fs";
import { tmpdir } from "os";
import { join as join3 } from "path";

// src/official.ts
import { existsSync, readFileSync, statSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
var OFFICIAL_PACKAGE_NAME = "@opengsd/get-shit-done-redux";
var OfficialPackageError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OfficialPackageError";
  }
};
function resolveOfficialPackage(options = {}) {
  const startDir = options.startDir ?? process.cwd();
  const packageName = options.packageName ?? OFFICIAL_PACKAGE_NAME;
  if (!existsSync(startDir)) {
    throw missingOfficialPackageError(startDir, packageName);
  }
  const require2 = createRequire(import.meta.url);
  let packageJsonPath;
  try {
    packageJsonPath = require2.resolve(`${packageName}/package.json`, { paths: [startDir] });
  } catch {
    try {
      packageJsonPath = require2.resolve(`${packageName}/package.json`);
    } catch {
      throw missingOfficialPackageError(startDir, packageName);
    }
  }
  const packageRoot = dirname(packageJsonPath);
  const packageJson = readPackageJson(packageJsonPath);
  const paths = buildOfficialPaths(packageRoot);
  validateRequiredPath("commands/gsd", paths.commandsDir, "directory", packageName);
  validateRequiredPath("get-shit-done/workflows", paths.workflowsDir, "directory", packageName);
  validateRequiredPath("get-shit-done/references", paths.referencesDir, "directory", packageName);
  validateRequiredPath("get-shit-done/templates", paths.templatesDir, "directory", packageName);
  validateRequiredPath("agents", paths.agentsDir, "directory", packageName);
  validateRequiredPath("hooks", paths.hooksDir, "directory", packageName);
  validateRequiredPath("get-shit-done/bin/gsd-tools.cjs", paths.gsdTools, "file", packageName);
  return {
    packageRoot,
    packageName,
    version: packageJson.version,
    paths
  };
}
function buildOfficialPaths(packageRoot) {
  return {
    commandsDir: join(packageRoot, "commands", "gsd"),
    workflowsDir: join(packageRoot, "get-shit-done", "workflows"),
    referencesDir: join(packageRoot, "get-shit-done", "references"),
    templatesDir: join(packageRoot, "get-shit-done", "templates"),
    agentsDir: join(packageRoot, "agents"),
    hooksDir: join(packageRoot, "hooks"),
    gsdTools: join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs")
  };
}
function readPackageJson(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string") {
    throw new OfficialPackageError(`Official package package.json is missing a string version.`);
  }
  return { version: packageJson.version };
}
function validateRequiredPath(relativePath, fullPath, kind, packageName) {
  if (!existsSync(fullPath)) {
    throw missingPathError(relativePath, packageName);
  }
  const stats = statSync(fullPath);
  if (kind === "directory" && !stats.isDirectory()) {
    throw missingPathError(relativePath, packageName);
  }
  if (kind === "file" && !stats.isFile()) {
    throw missingPathError(relativePath, packageName);
  }
}
function missingOfficialPackageError(startDir, packageName) {
  return new OfficialPackageError(
    `Official GSD package not found from ${startDir}. Run: npm install ${packageName}`
  );
}
function missingPathError(relativePath, packageName) {
  return new OfficialPackageError(
    `Official GSD package is incomplete: missing ${relativePath}. Run: npm install ${packageName}`
  );
}

// src/prompt-transform.ts
function commandFileToPiPromptName(fileName) {
  return `gsd-${fileName}`;
}
function normalizeGsdSlashReferences(input) {
  return input.replace(/(^|[\s([{'"`])\/gsd:([a-z0-9][a-z0-9-]*)/g, "$1/gsd-$2");
}
var piSubagentGuidance = `<pi_subagents_runtime_note>
Pi runtime: when this workflow calls for spawning GSD subagents, use the Pi \`subagent\` tool from \`pi-subagents\`.
Before delegation, inspect available agents with \`subagent({ action: "list" })\`.
Use exact official GSD agent names such as \`gsd-planner\`, \`gsd-executor\`, and \`gsd-code-reviewer\`.
If the \`subagent\` tool is unavailable, stop and ask the user to install or enable \`pi-subagents\`; do not simulate subagents inline.
</pi_subagents_runtime_note>

`;
function addPiSubagentGuidance(input) {
  if (input.includes("<pi_subagents_runtime_note>")) return input;
  if (!mentionsSubagentDelegation(input)) return input;
  return `${piSubagentGuidance}${input}`;
}
function mentionsSubagentDelegation(input) {
  return splitCandidateSentences(input).some((candidate) => {
    if (mentionsNegatedSubagentDelegation(candidate)) return false;
    return mentionsPositiveSubagentDelegation(candidate) || mentionsGsdSubagentPair(candidate);
  });
}
function splitCandidateSentences(input) {
  return input.match(/[^.!?\n]+[.!?]?/g) ?? [];
}
function mentionsNegatedSubagentDelegation(input) {
  return /\bwithout\b/i.test(input) || /\bno\s+subagents?\b/i.test(input) || /\bdo\s+not\s+spawn\b/i.test(input) || /\bdon't\s+spawn\b/i.test(input);
}
function mentionsPositiveSubagentDelegation(input) {
  return /\b(?:re-?spawn(?:s|ing|ed)?|spawn(?:s|ing|ed)?|delegat(?:e|es|ed|ing)|orchestrat(?:e|es|ed|ing)|dispatch(?:es|ed|ing)?)\b/i.test(input) && /\b(?:subagents?|agents?|gsd-[a-z0-9-]+|checkers?|research(?:ers?)?|writers?|planners?|executors?|auditors?|mappers?|synthesizers?|reviewers?|debuggers?)\b/i.test(input);
}
function mentionsGsdSubagentPair(input) {
  return /\bgsd-[a-z0-9-]+\b[\s\S]{0,80}\bsubagents?\b/i.test(input) || /\bsubagents?\b[\s\S]{0,80}\bgsd-[a-z0-9-]+\b/i.test(input);
}

// src/runtime-rewrites.ts
function rewriteOfficialClaudePaths(input, officialRoot) {
  const posixRoot = officialRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  return input.replace(/@(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `@${posixRoot}/get-shit-done/`).replace(/(^|[^@])~\/\.claude\/get-shit-done\//g, `$1${posixRoot}/get-shit-done/`);
}
function rewriteRuntimeMessageText(input, officialRoot) {
  return normalizeGsdSlashReferences(rewriteOfficialClaudePaths(input, officialRoot));
}

// src/gsd-models.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname as dirname2, join as join2 } from "path";
import {
  Container,
  SelectList,
  Text,
  matchesKey,
  Key
} from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
var _catalogCache = null;
function loadModelCatalog(gsdPackageRoot) {
  if (_catalogCache) return _catalogCache;
  const candidates = [
    join2(gsdPackageRoot, "get-shit-done", "bin", "shared", "model-catalog.json"),
    join2(gsdPackageRoot, "sdk", "shared", "model-catalog.json")
  ];
  for (const p of candidates) {
    if (existsSync2(p)) {
      _catalogCache = JSON.parse(readFileSync2(p, "utf8"));
      return _catalogCache;
    }
  }
  throw new Error(`model-catalog.json not found. Tried: ${candidates.join(", ")}`);
}
var ALIAS_TO_TIER = { opus: "heavy", sonnet: "standard", haiku: "light" };
function getProfileTierAgents(catalog, profile) {
  const result = /* @__PURE__ */ new Map();
  if (profile === "inherit") return result;
  for (const [agent, meta] of Object.entries(catalog.agents)) {
    let alias;
    if (profile === "adaptive") {
      alias = catalog.adaptiveTierMap[meta.routingTier];
    } else if (profile === "quality") {
      alias = meta.golden;
    } else {
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
function getRequiredTiers(profile) {
  if (profile === "inherit") return [];
  if (profile === "quality") return ["heavy", "standard"];
  if (profile === "budget") return ["standard", "light"];
  return ["heavy", "standard", "light"];
}
var tierLabels = {
  heavy: { short: "H", label: "Heavy" },
  standard: { short: "S", label: "Standard" },
  light: { short: "L", label: "Light" }
};
function resolveGsdConfigPath(options) {
  if (options.scope === "project") {
    return join2(options.cwd, ".planning", "config.json");
  }
  return join2(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}
function buildTierModelOverrides(tiers, catalog, profile) {
  const tierAgents = getProfileTierAgents(catalog, profile);
  const overrides = {};
  for (const [tier, agents] of tierAgents) {
    const modelId = tiers[tier];
    if (!modelId) continue;
    for (const agent of agents) {
      overrides[agent] = modelId;
    }
  }
  return overrides;
}
function mergeGsdModelConfig(existing, patch) {
  const next = { ...existing, model_profile: patch.model_profile };
  if (patch.model_profile === "inherit") {
    delete next.model_overrides;
    return next;
  }
  next.model_overrides = { ...patch.model_overrides ?? {} };
  return next;
}
function readJsonObject(filePath) {
  if (!existsSync2(filePath)) return {};
  let raw;
  try {
    raw = readFileSync2(filePath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return parsed;
}
function writeJsonObject(filePath, value) {
  mkdirSync(dirname2(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function formatModelId(model) {
  return `${model.provider}/${model.id}`;
}
function readEnabledModels(homeDir) {
  const settingsPath = join2(homeDir ?? homedir(), ".pi", "agent", "settings.json");
  try {
    if (!existsSync2(settingsPath)) return [];
    const parsed = JSON.parse(readFileSync2(settingsPath, "utf8"));
    return Array.isArray(parsed?.enabledModels) ? parsed.enabledModels : [];
  } catch {
    return [];
  }
}
function readCurrentGsdConfig(configPath, catalog) {
  if (!existsSync2(configPath)) return { profile: null, tierModels: null };
  const config = readJsonObject(configPath);
  const profile = typeof config.model_profile === "string" ? config.model_profile : null;
  if (profile === "inherit" || !profile) {
    return { profile: profile ?? null, tierModels: null };
  }
  const overrides = config.model_overrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return { profile, tierModels: null };
  }
  if (!isValidProfile(profile)) {
    return { profile, tierModels: null };
  }
  return { profile, tierModels: inferTierModelsFromOverrides(overrides, catalog, profile) };
}
function inferTierModelsFromOverrides(overrides, catalog, profile) {
  const tierAgents = getProfileTierAgents(catalog, profile);
  const result = {};
  for (const [tier, agents] of tierAgents) {
    if (agents.length === 0) continue;
    const first = overrides[agents[0]];
    if (!first) return null;
    for (let i = 1; i < agents.length; i++) {
      const model = overrides[agents[i]];
      if (model && model !== first) {
        break;
      }
    }
    result[tier] = first;
  }
  if (result.heavy === void 0 && result.standard === void 0 && result.light === void 0) {
    return null;
  }
  return result;
}
var VALID_PROFILES = /* @__PURE__ */ new Set(["inherit", "quality", "balanced", "budget", "adaptive"]);
function isValidProfile(profile) {
  return VALID_PROFILES.has(profile);
}
function formatAgentSummary(agents, maxNames = 3) {
  const names = agents.map((a) => a.replace(/^gsd-/, ""));
  const count = names.length;
  const shown = names.slice(0, maxNames);
  const remaining = count - shown.length;
  if (remaining > 0) {
    return `${shown.join(", ")}, ... (${count})`;
  }
  return shown.join(", ");
}
function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function buildCurrentStatus(currentConfig, catalog, scope) {
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
  if (!isValidProfile(profileRaw)) {
    return `${label}${profile} (unknown)`;
  }
  const tierAgents = getProfileTierAgents(catalog, profileRaw);
  for (const tier of ["heavy", "standard", "light"]) {
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
async function runGsdModelsCommand(args, ctx) {
  const catalog = loadModelCatalog(ctx.gsdPackageRoot);
  const allAvailable = ctx.modelRegistry.getAvailable();
  const enabledIds = new Set(ctx.enabledModels);
  const filtered = enabledIds.size > 0 ? allAvailable.filter((m) => enabledIds.has(formatModelId(m))) : allAvailable;
  if (filtered.length === 0) {
    ctx.ui.notify("No enabled models available for selection.", "error");
    return;
  }
  if (enabledIds.size === 0) {
    ctx.ui.notify("No enabledModels filter found; showing all models with configured auth", "warning");
  }
  const scope = await selectScope(ctx, args);
  if (!scope) return;
  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const currentConfig = readCurrentGsdConfig(configPath, catalog);
  const currentStatus = buildCurrentStatus(currentConfig, catalog, scope);
  const profileItems = buildProfileOptions(catalog, scope, currentConfig);
  const selectedProfile = await ctx.ui.select(
    `GSD Model Profile [${capitalize(scope)}]

${currentStatus}`,
    profileItems
  );
  const profile = selectedProfile ?? currentConfig.profile ?? "inherit";
  if (profile === "inherit") {
    const merged2 = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, merged2);
    ctx.ui.notify(`\u2713 GSD: inherit (uses Pi session model) \u2192 ${configPath}`, "info");
    return;
  }
  if (profile === "clear") {
    if (existsSync2(configPath)) {
      const { unlinkSync } = await import("fs");
      unlinkSync(configPath);
    }
    ctx.ui.notify(`\u2713 Cleared project config \u2192 using global defaults`, "info");
    return;
  }
  const requiredTiers = getRequiredTiers(profile);
  const tierAgents = getProfileTierAgents(catalog, profile);
  const currentTiers = currentConfig.tierModels;
  const tierModels = {};
  for (const tier of requiredTiers) {
    const agents = tierAgents.get(tier) ?? [];
    const currentModel = currentTiers?.[tier] ?? null;
    const selected = await chooseTierModel(
      tier,
      agents,
      filtered,
      allAvailable,
      ctx,
      currentModel
    );
    tierModels[tier] = selected ?? currentModel ?? void 0;
  }
  const finalTiers = { heavy: "", standard: "", light: "" };
  for (const tier of requiredTiers) {
    const fallback = filtered.length > 0 ? formatModelId(filtered[0]) : "";
    finalTiers[tier] = tierModels[tier] ?? currentTiers?.[tier] ?? fallback;
    if (!finalTiers[tier]) {
      ctx.ui.notify(`No model available for ${tierLabels[tier].label} tier`, "error");
      return;
    }
  }
  if (profile === "quality") {
    finalTiers.light = finalTiers.standard;
  }
  if (profile === "budget") {
    finalTiers.heavy = finalTiers.standard;
  }
  if (!finalTiers.heavy) finalTiers.heavy = finalTiers.standard;
  if (!finalTiers.standard) finalTiers.standard = finalTiers.heavy;
  if (!finalTiers.light) finalTiers.light = finalTiers.standard;
  const overrides = buildTierModelOverrides(finalTiers, catalog, profile);
  const merged = mergeGsdModelConfig(readJsonObject(configPath), {
    model_profile: profile,
    model_overrides: overrides
  });
  writeJsonObject(configPath, merged);
  const notifyLines = [`\u2713 GSD: ${profile}`];
  for (const t of ["heavy", "standard", "light"]) {
    const agents = tierAgents.get(t);
    if (agents && agents.length > 0 && finalTiers[t]) {
      notifyLines.push(`  ${tierLabels[t].label}(${agents.length}) \u2192 ${finalTiers[t]}`);
    }
  }
  notifyLines.push(`\u2192 ${configPath}`);
  ctx.ui.notify(notifyLines.join("\n"), "info");
}
async function selectScope(ctx, args) {
  const argScope = parseScope(args);
  if (argScope) return argScope;
  const selected = await ctx.ui.select(
    "GSD Model Config \u2014 Select Scope",
    [
      { value: "global", label: "Global", description: "~/.gsd/defaults.json (all projects)" },
      { value: "project", label: "Project", description: ".planning/config.json (this project)" }
    ]
  );
  return selected;
}
function parseScope(args) {
  const trimmed = args?.trim().toLowerCase() ?? "";
  if (trimmed === "--user" || trimmed === "user" || trimmed === "--global" || trimmed === "global") return "global";
  if (trimmed === "--project" || trimmed === "project") return "project";
  return null;
}
function buildProfileOptions(catalog, scope, currentConfig) {
  const options = [
    {
      value: "inherit",
      label: "Inherit",
      description: "All agents \u2192 (Pi session model)"
    }
  ];
  const profileTiers = [
    { value: "quality", label: "Quality" },
    { value: "balanced", label: "Balanced" },
    { value: "budget", label: "Budget" },
    { value: "adaptive", label: "Adaptive" }
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
  if (scope === "project") {
    options.push({
      value: "clear",
      label: "Clear (use Global)",
      description: "Delete project config, fall back to global defaults"
    });
  }
  return options;
}
async function chooseTierModel(tier, agents, scoped, all, ctx, currentModelId) {
  const agentSummary = formatAgentSummary(agents);
  const currentLabel = currentModelId ?? "(none)";
  const statusLine = `${tierLabels[tier].label.toUpperCase()} tier \u2014 agents: ${agentSummary}`;
  return await ctx.ui.custom((tui, theme, _kb, done) => {
    let mode = scoped.length > 0 ? "scoped" : "all";
    const container = new Container();
    const getItems = () => {
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
          label: isCurrent ? `${id} \u2713` : id,
          description: void 0
        };
      });
    };
    let selectTheme = {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t)
    };
    let selectList = new SelectList(getItems(), 15, selectTheme);
    const rebuild = () => {
      container.clear();
      container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold(statusLine)), 1, 0));
      container.addChild(new Text(theme.fg("dim", `Current: ${currentLabel}`), 1, 0));
      const tabHeader = mode === "scoped" ? ` ${theme.bg("selectedBg", theme.fg("userMessageText", " SCOPED "))}  ${theme.fg("muted", " ALL ")}` : ` ${theme.fg("muted", " SCOPED ")}  ${theme.bg("selectedBg", theme.fg("userMessageText", " ALL "))}`;
      container.addChild(new Text(tabHeader, 1, 1));
      container.addChild(selectList);
      container.addChild(new Text(theme.fg("dim", "\u2191\u2193 navigate \u2022 tab switch \u2022 enter select \u2022 esc keep current"), 1, 0));
      container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    };
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(currentModelId ?? void 0);
    rebuild();
    return {
      render: (w) => container.render(w),
      invalidate: () => {
        container.invalidate();
        rebuild();
      },
      handleInput: (data) => {
        if (matchesKey(data, Key.tab)) {
          mode = mode === "scoped" ? "all" : "scoped";
          selectList = new SelectList(getItems(), 15, selectTheme);
          selectList.onSelect = (item) => done(item.value);
          selectList.onCancel = () => done(currentModelId ?? void 0);
          rebuild();
          tui.requestRender();
          return;
        }
        selectList.handleInput(data);
        tui.requestRender();
      }
    };
  });
}

// src/extension.ts
var TEMP_DIR_SUBDIRS = ["async-subagent-results", "async-subagent-runs"];
function buildPiSubagentsTempRoot() {
  const username = (() => {
    for (const key of ["USERNAME", "USER", "LOGNAME"]) {
      const value = process.env[key];
      if (value) return value;
    }
    try {
      const os = __require("os");
      const info = os.userInfo();
      if (info.username) return info.username;
    } catch {
    }
    return "unknown";
  })();
  const sanitized = username.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  return join3(tmpdir(), `pi-subagents-user-${sanitized}`);
}
function guardPiSubagentsTempDirs(options) {
  delete globalThis.__piSubagentsTempAclBroken;
  try {
    const fsImpl = options?.fs ?? { accessSync, rmSync, mkdirSync: mkdirSync2 };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();
    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join3(tempRoot, subdir);
      try {
        fsImpl.accessSync(dirPath, fsConstants.R_OK | fsConstants.W_OK);
      } catch (accessError) {
        const errorCode = typeof accessError === "object" && accessError !== null && "code" in accessError ? accessError.code : "";
        if (errorCode !== "EACCES" && errorCode !== "EPERM") {
          continue;
        }
        try {
          fsImpl.rmSync(dirPath, { recursive: true, force: true });
          fsImpl.mkdirSync(dirPath, { recursive: true });
        } catch {
          globalThis.__piSubagentsTempAclBroken = true;
        }
      }
    }
  } catch {
  }
}
function piGsdExtension(pi) {
  let warnedResolveFailure = false;
  let cachedPackageRoot = null;
  function getPackageRoot(startDir) {
    if (cachedPackageRoot !== null) return cachedPackageRoot;
    try {
      const officialPackage = resolveOfficialPackage({ startDir });
      cachedPackageRoot = officialPackage.packageRoot;
      return cachedPackageRoot;
    } catch {
      return null;
    }
  }
  pi.on("session_start", (_event, ctx) => {
    guardPiSubagentsTempDirs();
    if (globalThis.__piSubagentsTempAclBroken) {
      notify(ctx, "pi-gsd: pi-subagents temp directories have ACL corruption that could not be auto-repaired. Run 'pi gsd doctor' for repair instructions.", "warning");
    }
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (pkgRoot) {
      try {
        const pkg = resolveOfficialPackage({ startDir: ctx.cwd });
        notify(ctx, `pi-gsd: using ${pkg.packageName}@${pkg.version}`, "info");
      } catch (error) {
        if (!warnedResolveFailure) {
          warnedResolveFailure = true;
          notify(ctx, `pi-gsd: failed to resolve official package: ${errorMessage(error)}`, "warning");
        }
      }
    } else if (!warnedResolveFailure) {
      warnedResolveFailure = true;
      notify(ctx, "pi-gsd: failed to resolve official package", "warning");
    }
  });
  pi.on("context", (event, ctx) => {
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (!pkgRoot) return void 0;
    const messages = event.messages.map((message) => rewriteMessageForRuntime(message, pkgRoot));
    return { messages };
  });
  pi.on("message_end", (event, ctx) => {
    if (!isRecord(event.message) || event.message.role !== "assistant") {
      return void 0;
    }
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (!pkgRoot) return void 0;
    return { message: rewriteMessageForRuntime(event.message, pkgRoot) };
  });
  pi.registerCommand("gsd-models", {
    description: "Configure GSD model routing for Pi subagents",
    handler: async (args, ctx) => {
      const model = ctx.model;
      const allModels = ctx.modelRegistry.getAvailable();
      const gsdPackageRoot = getPackageRoot(ctx.cwd) ?? "";
      await runGsdModelsCommand(args, {
        cwd: ctx.cwd,
        sessionModel: model ? `${model.provider}/${model.id}` : "unknown/unknown",
        enabledModels: readEnabledModels(),
        gsdPackageRoot,
        modelRegistry: {
          getAvailable() {
            return allModels.map((m) => ({ provider: String(m.provider), id: m.id, name: m.name }));
          }
        },
        ui: {
          select: async (_title, items) => {
            const options = items.map((item) => item.label);
            const selectedLabel = await ctx.ui.select(_title, options);
            if (selectedLabel === void 0) return void 0;
            return items.find((item) => item.label === selectedLabel)?.value;
          },
          custom: (factory, options) => ctx.ui.custom(factory, options),
          notify: (message, type) => ctx.ui.notify(message, type)
        }
      });
    }
  });
}
function rewriteMessageForRuntime(message, officialRoot) {
  if (!isRecord(message)) {
    return message;
  }
  const content = message.content;
  if (typeof content === "string") {
    return { ...message, content: rewriteRuntimeMessageText(content, officialRoot) };
  }
  if (Array.isArray(content)) {
    return {
      ...message,
      content: content.map((block) => rewriteTextBlock(block, officialRoot))
    };
  }
  return message;
}
function rewriteTextBlock(block, officialRoot) {
  if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") {
    return block;
  }
  return { ...block, text: rewriteRuntimeMessageText(block.text, officialRoot) };
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function notify(ctx, message, type) {
  try {
    ctx.ui.notify(message, type);
  } catch {
  }
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export {
  commandFileToPiPromptName,
  normalizeGsdSlashReferences,
  addPiSubagentGuidance,
  OFFICIAL_PACKAGE_NAME,
  OfficialPackageError,
  resolveOfficialPackage,
  rewriteOfficialClaudePaths,
  rewriteRuntimeMessageText,
  TEMP_DIR_SUBDIRS,
  buildPiSubagentsTempRoot,
  guardPiSubagentsTempDirs,
  piGsdExtension,
  rewriteMessageForRuntime
};
