import { normalizeGsdSlashReferences } from "./prompt-transform.js";

export function rewriteOfficialClaudePaths(input: string, officialRoot: string): string {
  const posixRoot = officialRoot.replaceAll("\\", "/").replace(/\/+$/, "");

  return input
    .replace(/@(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `@${posixRoot}/get-shit-done/`)
    .replace(/(^|[^@])~\/\.claude\/get-shit-done\//g, `$1${posixRoot}/get-shit-done/`);
}

export function rewriteRuntimeMessageText(input: string, officialRoot: string): string {
  return normalizeGsdSlashReferences(rewriteOfficialClaudePaths(input, officialRoot));
}
