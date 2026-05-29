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
var balancedTierAgents = {
  haiku: [
    "gsd-codebase-mapper",
    "gsd-pattern-mapper",
    "gsd-research-synthesizer",
    "gsd-plan-checker",
    "gsd-integration-checker",
    "gsd-nyquist-auditor",
    "gsd-ui-checker",
    "gsd-ui-auditor",
    "gsd-doc-verifier"
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
    "gsd-intel-updater"
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
    "gsd-user-profiler"
  ]
};
var keyGsdAgents = [
  "gsd-codebase-mapper",
  "gsd-planner",
  "gsd-executor",
  "gsd-roadmapper",
  "gsd-phase-researcher",
  "gsd-project-researcher",
  "gsd-code-reviewer",
  "gsd-verifier",
  "gsd-plan-checker"
];
function resolveGsdConfigPath(options) {
  if (options.scope === "project") {
    return join(options.cwd, ".planning", "config.json");
  }
  return join(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}
function buildBalancedModelOverrides(tiers) {
  const overrides = {};
  for (const tier of ["haiku", "sonnet", "opus"]) {
    for (const agent of balancedTierAgents[tier]) {
      overrides[agent] = tiers[tier];
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
function formatModelChoiceLabel(model) {
  const id = formatModelId(model);
  return model.name && model.name !== model.id ? `${id} \u2014 ${model.name}` : id;
}
async function runGsdModelsCommand(args, ctx) {
  const available = await ctx.modelRegistry.getAvailable();
  if (available.length === 0) {
    ctx.ui.notify("No Pi models with valid credentials are available.", "error");
    return;
  }
  const scope = await chooseScope(args, ctx);
  if (!scope) return;
  const mode = await ctx.ui.select("GSD model configuration", [
    {
      value: "inherit",
      label: "Inherit current Pi model",
      description: `Use ${formatModelChoiceLabel(ctx.model)} for GSD subagents`
    },
    {
      value: "balanced",
      label: "Map balanced tiers",
      description: "Choose local models for haiku, sonnet, and opus tiers"
    },
    {
      value: "agents",
      label: "Per-agent overrides",
      description: "Choose local models for key GSD agents"
    }
  ]);
  if (!mode) return;
  let patch;
  if (mode === "inherit") {
    patch = { model_profile: "inherit" };
  } else if (mode === "balanced") {
    patch = {
      model_profile: "balanced",
      model_overrides: buildBalancedModelOverrides(await chooseTierModels(available, ctx))
    };
  } else {
    patch = {
      model_profile: "balanced",
      model_overrides: await chooseAgentModels(available, ctx)
    };
  }
  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const merged = mergeGsdModelConfig(readJsonObject(configPath), patch);
  writeJsonObject(configPath, merged);
  ctx.ui.notify(`GSD model config updated: ${configPath}`, "info");
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
  return {
    haiku: await chooseModel("Fast/light tier (haiku)", available, ctx),
    sonnet: await chooseModel("Standard tier (sonnet)", available, ctx),
    opus: await chooseModel("Heavy tier (opus)", available, ctx)
  };
}
async function chooseAgentModels(available, ctx) {
  const overrides = {};
  for (const agent of keyGsdAgents) {
    const selected = await chooseModel(agent, available, ctx);
    overrides[agent] = selected;
  }
  return overrides;
}
async function chooseModel(title, available, ctx) {
  const selected = await ctx.ui.select(title, available.map((model) => ({
    value: formatModelId(model),
    label: formatModelChoiceLabel(model)
  })));
  return selected ?? formatModelId(ctx.model);
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
      await runGsdModelsCommand(args, {
        cwd: ctx.cwd,
        model: modelChoice,
        modelRegistry: {
          async getAvailable() {
            const models = ctx.modelRegistry.getAvailable();
            return models.map((m) => ({ provider: String(m.provider), id: m.id, name: m.name }));
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
