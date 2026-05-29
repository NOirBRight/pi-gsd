import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveOfficialPackage } from "./official.js";
import { rewriteRuntimeMessageText } from "./runtime-rewrites.js";
import { readEnabledModels, runGsdModelsCommand } from "./gsd-models.js";

export default function piGsdExtension(pi: ExtensionAPI): void {
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
      return undefined;
    }
  });

  pi.on("message_end", (event, ctx) => {
    try {
      if (!isRecord(event.message) || event.message.role !== "assistant") {
        return undefined;
      }
      const officialPackage = resolveOfficialPackage({ startDir: ctx.cwd });
      return { message: rewriteMessageForRuntime(event.message, officialPackage.packageRoot) };
    } catch {
      return undefined;
    }
  });

  pi.registerCommand("gsd-models", {
    description: "Configure GSD model routing for Pi subagents",
    handler: async (args, ctx) => {
      const model = ctx.model;
      const allModels = ctx.modelRegistry.getAvailable();

      let gsdPackageRoot: string;
      try {
        const officialPackage = resolveOfficialPackage({ startDir: ctx.cwd });
        gsdPackageRoot = officialPackage.packageRoot;
      } catch {
        gsdPackageRoot = "";
      }

      await runGsdModelsCommand(args, {
        cwd: ctx.cwd,
        sessionModel: model ? `${model.provider}/${model.id}` : "unknown/unknown",
        enabledModels: readEnabledModels(),
        gsdPackageRoot,
        modelRegistry: {
          getAvailable() {
            return allModels.map((m) => ({ provider: String(m.provider), id: m.id, name: m.name }));
          },
        },
        ui: {
          select: async <T>(_title: string, items: Array<{ value: T; label: string; description?: string }>): Promise<T | undefined> => {
            const options = items.map((item) => item.label);
            const selectedLabel = await ctx.ui.select(_title, options);
            if (selectedLabel === undefined) return undefined;
            return items.find((item) => item.label === selectedLabel)?.value as T | undefined;
          },
          custom: (factory, options) => ctx.ui.custom(factory, options),
          notify: (message: string, type?: "info" | "warning" | "error") => ctx.ui.notify(message, type),
        },
      });
    },
  });
}

export function rewriteMessageForRuntime<T>(message: T, officialRoot: string): T {
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
      content: content.map((block) => rewriteTextBlock(block, officialRoot)),
    };
  }

  return message;
}

function rewriteTextBlock<T>(block: T, officialRoot: string): T {
  if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") {
    return block;
  }

  return { ...block, text: rewriteRuntimeMessageText(block.text, officialRoot) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function notify(
  ctx: { ui: { notify(message: string, type?: "info" | "warning" | "error"): void } },
  message: string,
  type: "info" | "warning" | "error",
): void {
  try {
    ctx.ui.notify(message, type);
  } catch {
    // Notifications are best-effort and must not affect Pi runtime flow.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}