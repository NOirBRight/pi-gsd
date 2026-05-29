import {
  rewriteRuntimeMessageText
} from "./chunk-YKDNLLJM.js";
import {
  resolveOfficialPackage
} from "./chunk-ZNIYZQO4.js";

// src/gsd-models.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
var agentTiers = {
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
  "gsd-intel-updater": "light"
};
var tierLabels = {
  heavy: { short: "H", desc: "planning, debugging, architecture" },
  standard: { short: "S", desc: "execution, research, writing" },
  light: { short: "L", desc: "mapping, scanning, audits" }
};
function resolveGsdConfigPath(options) {
  if (options.scope === "project") {
    return join(options.cwd, ".planning", "config.json");
  }
  return join(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}
function buildTierModelOverrides(tiers) {
  const overrides = {};
  for (const [agent, tier] of Object.entries(agentTiers)) {
    overrides[agent] = tiers[tier];
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
  if (!existsSync(filePath)) return {};
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return parsed;
}
function writeJsonObject(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function formatModelId(model) {
  return `${model.provider}/${model.id}`;
}
function readEnabledModels(homeDir) {
  const settingsPath = join(homeDir ?? homedir(), ".pi", "agent", "settings.json");
  try {
    if (!existsSync(settingsPath)) return [];
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    return Array.isArray(parsed?.enabledModels) ? parsed.enabledModels : [];
  } catch {
    return [];
  }
}
async function runGsdModelsCommand(args, ctx) {
  const available = ctx.modelRegistry.getAvailable();
  if (available.length === 0) {
    ctx.ui.notify("No Pi models with valid credentials are available.", "error");
    return;
  }
  const scope = parseScope(args);
  const currentModelId = formatModelId(ctx.model);
  const tiers = await chooseTierModels(available, ctx);
  if (!tiers) return;
  const mode = await ctx.ui.select(
    `Select GSD profile [${scope}] \u2014 current model: ${currentModelId}`,
    buildProfileOptions(tiers, ctx.model)
  );
  if (!mode) return;
  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  if (mode === "inherit") {
    const merged = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, merged);
    ctx.ui.notify(`\u2713 GSD: inherit (${currentModelId}) \u2192 ${configPath}`, "info");
  } else {
    const merged = mergeGsdModelConfig(readJsonObject(configPath), {
      model_profile: mode,
      model_overrides: buildTierModelOverrides(tiers)
    });
    writeJsonObject(configPath, merged);
    ctx.ui.notify(`\u2713 GSD: ${mode} [${tierLabels.heavy.short}=${tiers.heavy} ${tierLabels.standard.short}=${tiers.standard} ${tierLabels.light.short}=${tiers.light}] \u2192 ${configPath}`, "info");
  }
}
function buildProfileOptions(tiers, currentModel) {
  const cur = formatModelId(currentModel);
  const h = tiers.heavy;
  const s = tiers.standard;
  const l = tiers.light;
  return [
    {
      value: "inherit",
      label: "Inherit",
      description: `All agents \u2192 ${cur}`
    },
    {
      value: "quality",
      label: "Quality",
      description: `All agents \u2192 ${h}`
    },
    {
      value: "balanced",
      label: "Balanced",
      description: `${tierLabels.heavy.short}: ${h}  ${tierLabels.standard.short}: ${s}  ${tierLabels.light.short}: ${l}`
    },
    {
      value: "budget",
      label: "Budget",
      description: `${tierLabels.heavy.short}: ${s}  ${tierLabels.standard.short}: ${s}  ${tierLabels.light.short}: ${l}`
    },
    {
      value: "adaptive",
      label: "Adaptive",
      description: `${tierLabels.heavy.short}: ${h}  ${tierLabels.standard.short}: ${s}  ${tierLabels.light.short}: ${l}`
    }
  ];
}
function parseScope(args) {
  const trimmed = args?.trim().toLowerCase() ?? "";
  if (trimmed === "--user" || trimmed === "user") return "user";
  return "project";
}
async function chooseTierModels(available, ctx) {
  const heavy = await chooseModel(`Heavy tier (${tierLabels.heavy.desc})`, available, ctx);
  if (heavy === void 0) return void 0;
  const standard = await chooseModel(`Standard tier (${tierLabels.standard.desc})`, available, ctx);
  if (standard === void 0) return void 0;
  const light = await chooseModel(`Light tier (${tierLabels.light.desc})`, available, ctx);
  if (light === void 0) return void 0;
  return { heavy, standard, light };
}
async function chooseModel(title, available, ctx) {
  const providerGroups = /* @__PURE__ */ new Map();
  for (const model of available) {
    const group = providerGroups.get(model.provider);
    if (group) group.push(model);
    else providerGroups.set(model.provider, [model]);
  }
  const currentProvider = ctx.model.provider;
  const sortedProviders = [...providerGroups.keys()].sort((a, b) => {
    if (a === currentProvider) return -1;
    if (b === currentProvider) return 1;
    return a.localeCompare(b);
  });
  const providerItems = sortedProviders.map((provider) => ({
    value: provider,
    label: provider === currentProvider ? `\u25B8 ${provider}` : provider
  }));
  const selectedProvider = await ctx.ui.select(`Provider: ${title}`, providerItems);
  if (selectedProvider === void 0) return void 0;
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
    const marker = isCurrent ? "\u25B8 " : "  ";
    const suffix = model.name && model.name !== model.id ? ` \u2014 ${model.name}` : "";
    return {
      value: id,
      label: `${marker}${id}${suffix}`
    };
  });
  return ctx.ui.select(title, modelItems);
}

// src/extension.ts
function piGsdExtension(pi) {
  let warnedResolveFailure = false;
  pi.on("session_start", (_event, ctx) => {
    try {
      const officialPackage = resolveOfficialPackage({ startDir: ctx.cwd });
      notify(ctx, `pi-gsd: using ${officialPackage.packageName}@${officialPackage.version}`, "info");
    } catch (error) {
      if (!warnedResolveFailure) {
        warnedResolveFailure = true;
        notify(ctx, `pi-gsd: failed to resolve official package: ${errorMessage(error)}`, "warning");
      }
    }
  });
  pi.on("context", (event, ctx) => {
    try {
      const officialPackage = resolveOfficialPackage({ startDir: ctx.cwd });
      const messages = event.messages.map((message) => rewriteMessageForRuntime(message, officialPackage.packageRoot));
      return { messages };
    } catch {
      return void 0;
    }
  });
  pi.on("message_end", (event, ctx) => {
    try {
      if (!isRecord(event.message) || event.message.role !== "assistant") {
        return void 0;
      }
      const officialPackage = resolveOfficialPackage({ startDir: ctx.cwd });
      return { message: rewriteMessageForRuntime(event.message, officialPackage.packageRoot) };
    } catch {
      return void 0;
    }
  });
  pi.registerCommand("gsd-models", {
    description: "Configure GSD model routing for Pi subagents",
    handler: async (args, ctx) => {
      const model = ctx.model;
      const modelChoice = model ? { provider: String(model.provider), id: model.id, name: model.name } : { provider: "unknown", id: "unknown", name: "unknown" };
      const allModels = ctx.modelRegistry.getAvailable();
      await runGsdModelsCommand(args, {
        cwd: ctx.cwd,
        model: modelChoice,
        enabledModels: readEnabledModels(),
        modelRegistry: {
          getAvailable() {
            return allModels.map((m) => ({ provider: String(m.provider), id: m.id, name: m.name }));
          }
        },
        ui: {
          async select(_title, items) {
            const options = items.map((item) => item.label);
            const selectedLabel = await ctx.ui.select(_title, options);
            if (selectedLabel === void 0) return void 0;
            return items.find((item) => item.label === selectedLabel)?.value;
          },
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
  piGsdExtension as default,
  rewriteMessageForRuntime
};
