import { OFFICIAL_PACKAGE_NAME } from "./official.js";
import { splitCodeFences } from "./prompt-transform.js";

/**
 * The directory name inside the official package that contains GSD data files.
 * This is `get-shit-done` — the same name used in `~/.claude/get-shit-done/` paths
 * and `node_modules/@opengsd/gsd-core/get-shit-done/` paths.
 */
const GSD_DATA_DIR = "get-shit-done";

/**
 * Rewrite workflow/references/templates path references to point to generated/ copies.
 *
 * Upstream GSD command and workflow files reference sibling files using three path formats:
 *
 * Format 1: `~/.claude/` paths (Claude convention — most common)
 *   `~/.claude/get-shit-done/workflows/discuss-phase.md`
 *   → `generated/workflows/workflows/discuss-phase.md`
 *
 * Format 2: `$HOME/.claude/` paths (alternative Claude convention)
 *   `$HOME/.claude/get-shit-done/workflows/discuss-phase.md`
 *   → `generated/workflows/workflows/discuss-phase.md`
 *
 * Format 3: Absolute `node_modules/` paths (resolved during install)
 *   `D:/project/node_modules/@opengsd/gsd-core/get-shit-done/workflows/discuss-phase.md`
 *   → `generated/workflows/workflows/discuss-phase.md`
 *
 * Code-fence safe: does not transform paths inside ``` code blocks.
 */
export function rewriteWorkflowPaths(input: string, packageName: string = OFFICIAL_PACKAGE_NAME): string {
  const escapedFull = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Common suffix patterns
  // IN-01: Only .md file references are rewritten because upstream GSD
  // exclusively uses .md paths in <required_reading> and <execution_context> blocks.
  // Descriptive references to .cjs/.js files (e.g. "bin/lib/surface.cjs") are
  // prose content, not path references, and should not be rewritten.
  const subdirs = "(?:workflows|references|templates)";
  const fileExt = "\\.md";

  // Pattern 1: ~/.claude/<gsdDataDir>/<subdirs>/...
  // e.g. `~/.claude/get-shit-done/workflows/discuss-phase.md`
  const tildePattern = new RegExp(
    `~/.claude/${GSD_DATA_DIR}/(${subdirs}/[^\\s'"${"`"}\\)]+${fileExt})`,
    "g",
  );

  // Pattern 2: $HOME/.claude/<gsdDataDir>/<subdirs>/...
  // e.g. `$HOME/.claude/get-shit-done/workflows/discuss-phase.md`
  const homePattern = new RegExp(
    `\\$HOME/.claude/${GSD_DATA_DIR}/(${subdirs}/[^\\s'"${"`"}\\)]+${fileExt})`,
    "g",
  );

  // Pattern 3: Absolute node_modules/<fullName>/<gsdDataDir>/<subdirs>/...
  // e.g. `D:/project/node_modules/@opengsd/gsd-core/get-shit-done/workflows/discuss-phase.md`
  const nodeModulesPattern = new RegExp(
    `(?:[A-Za-z]:[/\\\\]|/)[^\\s'"${"`"}]*?node_modules/${escapedFull}/${GSD_DATA_DIR}/(${subdirs}/[^\\s'"${"`"}\\)]+${fileExt})`,
    "g",
  );

  // Split into code fences and non-code segments — only transform non-code
  const segments = splitCodeFences(input);
  let changed = false;

  const result = segments.map(({ segment, isCode }) => {
    if (isCode) return segment;
    let transformed = segment
      .replace(tildePattern, (_match: string, relativePath: string) => {
        return `generated/workflows/${relativePath}`;
      })
      .replace(homePattern, (_match: string, relativePath: string) => {
        return `generated/workflows/${relativePath}`;
      })
      .replace(nodeModulesPattern, (_match: string, relativePath: string) => {
        return `generated/workflows/${relativePath}`;
      });
    if (transformed !== segment) changed = true;
    return transformed;
  }).join("");

  return changed ? result : input;
}