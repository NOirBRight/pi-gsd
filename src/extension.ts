import { accessSync, constants as fsConstants, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveOfficialPackage } from "./official.js";
import { rewriteRuntimeMessageText } from "./runtime-rewrites.js";
import { readEnabledModels, runGsdModelsCommand } from "./gsd-models.js";

/**
 * Subdirectories under the pi-subagents temp root that may suffer ACL corruption.
 * Must mirror pi-subagents' async-subagent-results and async-subagent-runs.
 */
export const TEMP_DIR_SUBDIRS = ["async-subagent-results", "async-subagent-runs"] as const;

/**
 * Builds the pi-subagents temp root path mirroring resolveTempScopeId logic.
 * Uses the same username sanitization regex as pi-subagents:
 * trim, replace non-alphanum/dot/dash/underscore with dash, strip leading/trailing dashes.
 * Falls back to "unknown" if sanitization produces an empty string.
 */
export function buildPiSubagentsTempRoot(): string {
  const username = (() => {
    for (const key of ["USERNAME", "USER", "LOGNAME"] as const) {
      const value = process.env[key];
      if (value) return value;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const os = require("node:os");
      const info = os.userInfo();
      if (info.username) return info.username;
    } catch {
      // Fall through
    }
    return "unknown";
  })();
  const sanitized = username.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  return join(tmpdir(), `pi-subagents-user-${sanitized}`);
}

export type GuardFs = {
  accessSync: typeof accessSync;
  rmSync: typeof rmSync;
  mkdirSync: typeof mkdirSync;
};

export type GuardOptions = {
  /** Override the temp root path (defaults to buildPiSubagentsTempRoot()) */
  tempRoot?: string;
  /** Override filesystem operations (for testing ACL failure scenarios) */
  fs?: GuardFs;
};

/**
 * Best-effort guard that pre-cleans pi-subagents temp directories.
 * Checks accessibility of each temp subdir; if ACL-corrupted (EACCES/EPERM),
 * attempts rmSync + mkdirSync to repair. If repair also fails (ACL too severe
 * for non-elevated repair), sets a globalThis diagnostic flag.
 *
 * TIMING: This guard runs in the session_start handler, which fires AFTER
 * extensions are loaded. Pi's discoverAndLoadExtensions loads extensions in
 * filesystem-scanning order, not in a user-specified priority. This means
 * pi-subagents' own ensureAccessibleDir() has already run by the time this
 * guard executes.
 *
 * This is mitigated: pi-subagents (fork version) now catches EPERM/EACCES
 * in ensureAccessibleDir and falls back to pid-scoped paths. Our guard
 * serves as a cleanup step — repairing corrupted dirs for the current
 * session's file-watching, and preventing the corruption from blocking
 * the next session.
 *
 * Wraps all operations in try/catch so it never throws — a best-effort
 * guard that must not crash Pi.
 */
export function guardPiSubagentsTempDirs(options?: GuardOptions): void {
  try {
    const fsImpl: GuardFs = options?.fs ?? { accessSync, rmSync, mkdirSync };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();

    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join(tempRoot, subdir);
      try {
        fsImpl.accessSync(dirPath, fsConstants.R_OK | fsConstants.W_OK);
      } catch (accessError: unknown) {
        const errorCode = typeof accessError === "object" && accessError !== null && "code" in accessError
          ? (accessError as { code: string }).code
          : "";
        // Only repair for ACL corruption (EACCES/EPERM).
        // Non-ACL errors (ENOENT, EBUSY, etc.) are not corruption — skip repair.
        if (errorCode !== "EACCES" && errorCode !== "EPERM") {
          continue;
        }
        // Directory has ACL corruption — try to repair
        try {
          fsImpl.rmSync(dirPath, { recursive: true, force: true });
          fsImpl.mkdirSync(dirPath, { recursive: true });
        } catch {
          // ACL too corrupted for non-elevated repair — set diagnostic flag
          (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken = true;
        }
      }
    }
  } catch {
    // Top-level catch: guard must never throw. Best-effort, never crashes Pi.
  }
}

export default function piGsdExtension(pi: ExtensionAPI): void {
  let warnedResolveFailure = false;
  // Cache the package root after first successful resolution to avoid repeated fs lookups
  let cachedPackageRoot: string | null = null;

  function getPackageRoot(startDir: string): string | null {
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
    // Best-effort guard: pre-clean pi-subagents temp dirs before subagent operations.
    // This runs AFTER extension load, so it's a late-stage safety net — see comment
    // on guardPiSubagentsTempDirs for limitations.
    guardPiSubagentsTempDirs();

    // If ACL repair failed, warn the user so they can take action
    if ((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken) {
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
    if (!pkgRoot) return undefined;
    const messages = event.messages.map((message) => rewriteMessageForRuntime(message, pkgRoot));
    return { messages };
  });

  pi.on("message_end", (event, ctx) => {
    if (!isRecord(event.message) || event.message.role !== "assistant") {
      return undefined;
    }
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (!pkgRoot) return undefined;
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