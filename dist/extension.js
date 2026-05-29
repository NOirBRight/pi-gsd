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
  "gsd-intel-updater": "light"
};
var profileDescriptions = {
  inherit: "Inherit \u2014 all GSD agents use your current Pi model",
  quality: "Quality \u2014 Opus/strong model for every agent",
  balanced: "Balanced \u2014 strong for planning, standard for execution, light for mapping",
  budget: "Budget \u2014 standard for execution, light for everything else",
  adaptive: "Adaptive \u2014 heavy for planning/debugging, standard for execution, light for mapping"
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
function formatModelChoiceLabel(model, scopedModelIds) {
  const id = formatModelId(model);
  const inScope = scopedModelIds?.has(id) ?? true;
  const prefix = inScope ? "" : "  ";
  const suffix = model.name && model.name !== model.id ? ` \u2014 ${model.name}` : "";
  return `${prefix}${id}${suffix}`;
}
async function runGsdModelsCommand(args, ctx) {
  const available = ctx.modelRegistry.getAvailable();
  if (available.length === 0) {
    ctx.ui.notify("No Pi models with valid credentials are available.", "error");
    return;
  }
  const currentConfigPath = resolveGsdConfigPath({ scope: "project", cwd: ctx.cwd });
  const currentConfig = readJsonObject(currentConfigPath);
  const currentProfile = typeof currentConfig.model_profile === "string" ? currentConfig.model_profile : "(not set)";
  const scope = await chooseScope(args, ctx);
  if (!scope) return;
  const mode = await ctx.ui.select(
    `GSD model routing \u2014 current: ${currentProfile}`,
    [
      {
        value: "inherit",
        label: "Inherit current model",
        description: `All GSD agents use ${formatModelChoiceLabel(ctx.model)} directly`
      },
      {
        value: "quality",
        label: "Quality",
        description: profileDescriptions.quality
      },
      {
        value: "balanced",
        label: "Balanced",
        description: profileDescriptions.balanced
      },
      {
        value: "budget",
        label: "Budget",
        description: profileDescriptions.budget
      },
      {
        value: "adaptive",
        label: "Adaptive",
        description: profileDescriptions.adaptive
      }
    ]
  );
  if (!mode) return;
  if (mode === "inherit") {
    const configPath2 = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
    const merged2 = mergeGsdModelConfig(readJsonObject(configPath2), { model_profile: "inherit" });
    writeJsonObject(configPath2, merged2);
    ctx.ui.notify(`GSD model routing set to inherit (${formatModelChoiceLabel(ctx.model)})`, "info");
    return;
  }
  const tiers = await chooseTierModels(available, ctx);
  if (!tiers) return;
  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const merged = mergeGsdModelConfig(readJsonObject(configPath), {
    model_profile: mode,
    model_overrides: buildTierModelOverrides(tiers)
  });
  writeJsonObject(configPath, merged);
  ctx.ui.notify(`GSD model routing set to ${mode}: light=${tiers.light} standard=${tiers.standard} heavy=${tiers.heavy}`, "info");
}
async function chooseScope(args, ctx) {
  const trimmed = args?.trim();
  if (trimmed === "--user" || trimmed === "user") return "user";
  if (trimmed === "--project" || trimmed === "project" || trimmed === "") return "project";
  return ctx.ui.select("GSD config scope", [
    { value: "project", label: "Project", description: ".planning/config.json (recommended)" },
    { value: "user", label: "User", description: "~/.gsd/defaults.json (applies across projects)" }
  ]);
}
async function chooseTierModels(available, ctx) {
  const heavy = await chooseModel("Heavy tier (planning, debugging)", available, ctx);
  if (heavy === void 0) return void 0;
  const standard = await chooseModel("Standard tier (execution, research)", available, ctx);
  if (standard === void 0) return void 0;
  const light = await chooseModel("Light tier (mapping, scanning, audits)", available, ctx);
  if (light === void 0) return void 0;
  return { heavy, standard, light };
}
async function chooseModel(title, available, ctx) {
  const scopedModels = available.filter((m) => ctx.scopedModelIds.has(formatModelId(m)));
  const otherModels = available.filter((m) => !ctx.scopedModelIds.has(formatModelId(m)));
  const items = [
    ...scopedModels.map((model) => ({
      value: formatModelId(model),
      label: formatModelChoiceLabel(model, ctx.scopedModelIds)
    })),
    ...otherModels.map((model) => ({
      value: formatModelId(model),
      label: formatModelChoiceLabel(model, ctx.scopedModelIds)
    }))
  ];
  return ctx.ui.select(title, items);
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
      const scopedModelIds = new Set(allModels.map((m) => `${m.provider}/${m.id}`));
      await runGsdModelsCommand(args, {
        cwd: ctx.cwd,
        model: modelChoice,
        scopedModelIds,
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
