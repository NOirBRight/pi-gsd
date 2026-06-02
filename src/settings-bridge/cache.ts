import { createHash } from "node:crypto";
import { resolveGsdConfigSource, type ResolveGsdConfigSourceOptions } from "./source.js";
import { formatSettingsContext } from "./format.js";
import type { GsdConfigSource, ResolvedSettings, SettingsBridge, SettingsBridgeNotification, SettingsBridgeOptions } from "./types.js";

/**
 * Settings Bridge cache.
 *
 * Holds the last-observed `GsdConfigSource` and the derived `ResolvedSettings`.
 * Refreshes lazily when the file mtime or hash changes — no long-lived
 * watchers (D-14). Notifies the Pi extension at most once per newly
 * observed settings hash (D-15). When parsing fails, returns a structured
 * parseError so GSD callers can block (D-16).
 */
export class SettingsBridgeCache implements SettingsBridge {
  private resolved: ResolvedSettings | undefined;
  private lastNotifiedHash: string | undefined;
  private readonly notifications: SettingsBridgeNotification[] = [];
  private readonly resolveOptions: ResolveGsdConfigSourceOptions;

  constructor(private readonly options: SettingsBridgeOptions) {
    this.resolveOptions = {
      cwd: options.cwd,
      ...(options.configPath ? { configPath: options.configPath } : {}),
      projectRoot: options.cwd,
    };
  }

  refresh(): ResolvedSettings {
    const source = resolveGsdConfigSource(this.resolveOptions);
    const next = toResolvedSettings(source);
    const previous = this.resolved;

    // Detect newly observed hash (D-15) — notify at most once per new hash.
    if (source.hash && source.hash !== this.lastNotifiedHash) {
      const previousHash = previous?.source.hash;
      const isNewHash = previousHash !== source.hash;
      if (isNewHash) {
        if (next.parseError) {
          this.notifications.push({
            kind: "warning",
            message: `pi-gsd: settings parse failed for ${source.path ?? "default"}. ${next.parseError}. Run \`/gsd-settings\` to repair, or fix the JSON manually.`,
            observedHash: source.hash,
          });
        } else if (previous) {
          this.notifications.push({
            kind: "info",
            message: `pi-gsd: settings updated (${describeChange(previous.source, source)}). hash=${source.hash.slice(0, 12)}`,
            observedHash: source.hash,
          });
        }
        this.lastNotifiedHash = source.hash;
      }
    }

    this.resolved = next;
    return next;
  }

  current(): ResolvedSettings {
    if (!this.resolved) return this.refresh();
    return this.resolved;
  }

  isParseError(): boolean {
    return Boolean(this.resolved?.parseError);
  }

  /**
   * Refresh and throw if parsing failed. Used by the native auto orchestrator
   * to block dispatch when settings are unparseable (D-16).
   */
  ensureGsdSettingsReady(): ResolvedSettings {
    const resolved = this.refresh();
    if (resolved.parseError) {
      const error = new Error(`GSD settings parse failed: ${resolved.parseError}`);
      (error as Error & { code?: string }).code = "GSD_SETTINGS_PARSE_ERROR";
      throw error;
    }
    return resolved;
  }

  formatContext(): string {
    // D-14: GSD context injection must lazily refresh before formatting, so
    // changed settings and newly introduced parse errors are observed.
    const resolved = this.refresh();
    return formatSettingsContext(resolved, {
      packageName: this.options.officialPackageName,
      packageVersion: this.options.officialPackageVersion,
    });
  }

  popNotifications(): SettingsBridgeNotification[] {
    const drained = [...this.notifications];
    this.notifications.length = 0;
    return drained;
  }

  dispose(): void {
    this.resolved = undefined;
    this.lastNotifiedHash = undefined;
    this.notifications.length = 0;
  }
}

function toResolvedSettings(source: GsdConfigSource): ResolvedSettings {
  if (!source.path) {
    return {
      source,
      parseError: undefined,
      workflow: {},
      model: { profile: null, overrides: {} },
    };
  }

  if (!source.config) {
    return {
      source,
      parseError: source.parseError ? `Could not parse JSON at ${source.path}: ${source.parseError}` : `Could not parse JSON at ${source.path}`,
      workflow: {},
      model: { profile: null, overrides: {} },
    };
  }

  const workflow = isRecord(source.config.workflow) ? filterSafeWorkflowSettings(source.config.workflow) : {};
  const overrides = isRecord(source.config.model_overrides) ? filterStringRecord(source.config.model_overrides) : {};
  return {
    source,
    parseError: undefined,
    workflow,
    model: {
      profile: typeof source.config.model_profile === "string" ? source.config.model_profile : null,
      overrides,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SAFE_WORKFLOW_KEYS = new Set([
  "_auto_chain_active",
  "ai_integration_phase",
  "auto_advance",
  "auto_prune_state",
  "code_review",
  "code_review_depth",
  "code_review_command",
  "discuss_mode",
  "inline_plan_threshold",
  "max_discuss_passes",
  "node_repair",
  "node_repair_budget",
  "nyquist_validation",
  "pattern_mapper",
  "plan_bounce",
  "plan_bounce_passes",
  "plan_check",
  "plan_checker",
  "plan_review_convergence",
  "post_planning_gaps",
  "research",
  "research_before_questions",
  "security_asvs_level",
  "security_block_on",
  "security_enforcement",
  "skip_discuss",
  "subagent_timeout",
  "tdd_mode",
  "text_mode",
  "ui_phase",
  "ui_review",
  "ui_safety_gate",
  "use_worktrees",
  "verifier",
  "worktrees",
]);

function filterSafeWorkflowSettings(source: Record<string, unknown>): Record<string, boolean | number | string | null> {
  const filtered: Record<string, boolean | number | string | null> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!SAFE_WORKFLOW_KEYS.has(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
      filtered[key] = value;
    }
  }
  return filtered;
}

function filterStringRecord(source: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function describeChange(previous: GsdConfigSource, next: GsdConfigSource): string {
  if (previous.path !== next.path) {
    return `source=${next.kind}`;
  }
  const changedKeys: string[] = [];
  const previousConfig = previous.config ?? {};
  const nextConfig = next.config ?? {};
  const previousWorkflow = isRecord(previousConfig.workflow) ? previousConfig.workflow : {};
  const nextWorkflow = isRecord(nextConfig.workflow) ? nextConfig.workflow : {};
  for (const key of new Set([...Object.keys(previousWorkflow), ...Object.keys(nextWorkflow)])) {
    if (JSON.stringify(previousWorkflow[key]) !== JSON.stringify(nextWorkflow[key])) {
      changedKeys.push(`workflow.${key}`);
    }
  }
  if (previousConfig.model_profile !== nextConfig.model_profile) {
    changedKeys.push("model_profile");
  }
  return changedKeys.length > 0 ? changedKeys.join(",") : "settings changed";
}

export function hashString(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
