import type { ResolvedSettings } from "./types.js";

/**
 * Produce a concise, redacted markdown summary of the resolved GSD settings.
 *
 * Output rules (D-09, D-11, D-12):
 * - Effective workflow toggles + model/profile routing.
 * - Source path/kind/hash/mtime and official package/version.
 * - Omit raw config JSON, every Pi model catalog, secrets, tokens, and
 *   full `model_overrides` object dumps.
 * - Concise: one line per workflow key, one section per concern.
 */
export function formatSettingsContext(resolved: ResolvedSettings, options: { packageName?: string; packageVersion?: string }): string {
  const lines: string[] = [];
  lines.push("## GSD Settings");
  if (resolved.parseError) {
    lines.push("");
    lines.push(`⚠️ parse error: ${resolved.parseError}`);
    lines.push("Settings context disabled. Run `/gsd-settings` to repair, or fix the JSON manually before GSD dispatch.");
    return lines.join("\n");
  }
  if (!resolved.source.path) {
    lines.push("");
    lines.push("No GSD settings found. Default workflow toggles apply.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push(`- source: ${resolved.source.path} (${resolved.source.kind})`);
  if (resolved.source.hash) {
    lines.push(`- hash: ${resolved.source.hash.slice(0, 16)}`);
  }
  if (typeof resolved.source.mtimeMs === "number") {
    lines.push(`- mtime: ${new Date(resolved.source.mtimeMs).toISOString()}`);
  }
  if (options.packageName && options.packageVersion) {
    lines.push(`- package: ${options.packageName}@${options.packageVersion}`);
  }

  if (resolved.model.profile) {
    lines.push("");
    lines.push(`### Model routing`);
    lines.push(`- profile: ${resolved.model.profile}`);
    if (Object.keys(resolved.model.overrides).length > 0) {
      const overrideCount = Object.keys(resolved.model.overrides).length;
      lines.push(`- overrides: ${overrideCount} agent mapping${overrideCount === 1 ? "" : "s"}`);
    } else {
      lines.push("- overrides: (none)");
    }
  } else {
    lines.push("");
    lines.push("### Model routing");
    lines.push("- profile: inherit (uses Pi session model)");
  }

  if (Object.keys(resolved.workflow).length > 0) {
    lines.push("");
    lines.push("### Workflow toggles");
    for (const key of Object.keys(resolved.workflow).sort()) {
      const value = resolved.workflow[key];
      lines.push(`- ${key}: ${formatScalar(key, value)}`);
    }
  }

  return lines.join("\n");
}

function formatScalar(key: string, value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return redactScalar(key, value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "[redacted non-scalar]";
}

function redactScalar(key: string, value: string): string {
  if (/token|secret|password|apikey|api_key|credential|command|script/i.test(key)) return "[redacted]";
  if (/token|secret|password|apikey|api_key|credential|bearer\s+[a-z0-9._-]+|sk-[a-z0-9._-]+/i.test(value)) return "[redacted]";
  return value;
}
