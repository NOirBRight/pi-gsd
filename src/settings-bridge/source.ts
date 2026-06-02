import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import type { GsdConfigSource, GsdConfigSourceKind, GsdSettingsJson } from "./types.js";

export type ResolveGsdConfigSourceOptions = {
  cwd: string;
  /** Optional explicit config path (overrides active-workstream and standard precedence). */
  configPath?: string;
  /** Override the project root used to resolve relative paths. */
  projectRoot?: string;
};

/**
 * Resolve the effective GSD settings source using upstream `gsd:settings`
 * precedence (D-13):
 *
 *   1. Explicit `configPath` argument (when provided).
 *   2. `.planning/active-workstream` slug → `.planning/workstreams/<slug>/config.json`.
 *   3. `.planning/config.json` in the project root.
 *   4. Root `config.json` (legacy fallback).
 *   5. Default (no source).
 *
 * Each resolved source is hashed (SHA-256) and mtime-stamped so the Bridge
 * can refresh lazily without re-parsing on every context hook.
 */
export function resolveGsdConfigSource(options: ResolveGsdConfigSourceOptions): GsdConfigSource {
  const projectRoot = resolve(options.projectRoot ?? options.cwd);

  // 1. Explicit configPath
  if (options.configPath) {
    const absolutePath = isAbsolute(options.configPath) ? options.configPath : resolve(projectRoot, options.configPath);
    return readSource(absolutePath, "explicit");
  }

  // 2. Active workstream
  const activeWorkstreamPath = join(projectRoot, ".planning", "active-workstream");
  if (existsSync(activeWorkstreamPath)) {
    try {
      const slug = readFileSync(activeWorkstreamPath, "utf8").trim();
      if (isSafeWorkstreamSlug(slug)) {
        const workstreamConfigPath = join(projectRoot, ".planning", "workstreams", slug, "config.json");
        if (existsSync(workstreamConfigPath)) {
          return readSource(workstreamConfigPath, "active-workstream");
        }
      }
    } catch {
      // Fall through to standard precedence
    }
  }

  // 3. .planning/config.json
  const planningConfigPath = join(projectRoot, ".planning", "config.json");
  if (existsSync(planningConfigPath)) {
    return readSource(planningConfigPath, "planning-config");
  }

  // 4. Root config.json (legacy)
  const rootConfigPath = join(projectRoot, "config.json");
  if (existsSync(rootConfigPath)) {
    return readSource(rootConfigPath, "root-config");
  }

  // 5. Default
  return {
    path: undefined,
    kind: "default",
    hash: undefined,
    mtimeMs: undefined,
    config: undefined,
  };
}

function isSafeWorkstreamSlug(slug: string): boolean {
  return /^(?=.*[A-Za-z0-9])[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) && slug !== "." && slug !== "..";
}

function readSource(path: string, kind: Exclude<GsdConfigSourceKind, "default" | "missing">): GsdConfigSource {
  try {
    const content = readFileSync(path, "utf8");
    const stat = statSync(path);
    const hash = createHash("sha256").update(content, "utf8").digest("hex");
    let parsed: GsdSettingsJson;
    try {
      parsed = JSON.parse(content) as GsdSettingsJson;
    } catch (error) {
      // Malformed JSON — return source metadata and structured parse error.
      return {
        path,
        kind,
        hash,
        mtimeMs: stat.mtimeMs,
        config: undefined,
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      path,
      kind,
      hash,
      mtimeMs: stat.mtimeMs,
      config: parsed,
    };
  } catch (error) {
    return {
      path,
      kind,
      hash: undefined,
      mtimeMs: undefined,
      config: undefined,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Returns the path that `gsd:settings` would write to for this project root
 * given the active-workstream resolution. Used by `gsd-models` and other
 * tools that need to mirror the source precedence.
 */
export function inferGsdConfigWritePath(options: { cwd: string; configPath?: string; projectRoot?: string }): string {
  const source = resolveGsdConfigSource(options);
  if (source.path) return source.path;
  const projectRoot = resolve(options.projectRoot ?? options.cwd);
  return join(projectRoot, ".planning", "config.json");
}

export { existsSync };
