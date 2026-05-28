import {
  normalizeGsdSlashReferences
} from "./chunk-ZNIYZQO4.js";

// src/runtime-rewrites.ts
function rewriteOfficialClaudePaths(input, officialRoot) {
  const posixRoot = officialRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  return input.replace(/@(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `@${posixRoot}/get-shit-done/`).replace(/(^|[^@])~\/\.claude\/get-shit-done\//g, `$1${posixRoot}/get-shit-done/`);
}
function rewriteRuntimeMessageText(input, officialRoot) {
  return normalizeGsdSlashReferences(rewriteOfficialClaudePaths(input, officialRoot));
}

export {
  rewriteOfficialClaudePaths,
  rewriteRuntimeMessageText
};
