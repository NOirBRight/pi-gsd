import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveOfficialPackage } from "./official.js";
import { rewriteRuntimeMessageText } from "./runtime-rewrites.js";

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
      const messages = event.messages.map((message) => rewriteUserMessage(message, officialPackage.packageRoot));

      return { messages };
    } catch {
      return undefined;
    }
  });
}

function rewriteUserMessage<T>(message: T, officialRoot: string): T {
  if (!isRecord(message) || message.role !== "user") {
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
