import {
  rewriteRuntimeMessageText
} from "./chunk-YKDNLLJM.js";
import {
  resolveOfficialPackage
} from "./chunk-ZNIYZQO4.js";

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
