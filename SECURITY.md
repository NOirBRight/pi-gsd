# Security Audit: fix/subagent-stability-phase03-followup

**Date:** 2026-05-30
**Branch:** fix/subagent-stability-phase03-followup
**Auditor:** gsd-security-auditor
**ASVS Level:** 1

## Findings

### 1. Supply Chain Risk — Branch Reference in package.json

**Severity: FIX-WORTHY**

`package.json` resolves `pi-subagents` via `github:NOirBRight/pi-subagents#feat/session-scoped-temp-dirs` — a **branch name**, not a commit hash.

- **Force-push risk:** The branch owner can force-push to `feat/session-scoped-temp-dirs`, changing the code that `npm install` resolves on a fresh checkout. The lockfile pins to commit `ec7bfe8ac129f658008d508925e81baf3c32c41c`, which protects existing `node_modules`, but `npm ci` on a CI runner that regenerates the lockfile (or a fresh `npm install` after a lockfile drift) would resolve to whatever HEAD the branch points to at that moment.
- **Deletion risk:** If the branch is deleted, `npm install` fails entirely for anyone without a cached tarball.
- **Mitigation in place (partial):** `package-lock.json` pins the resolved commit. As long as the lockfile is committed and `npm ci` is used, the exact commit is installed. However, the `package.json` declaration remains a branch ref, which is a weaker pin than a commit SHA.

**Recommendation:** Change to a commit-hash reference:
```
"pi-subagents": "github:NOirBRight/pi-subagents#ec7bfe8ac129f658008d508925e81baf3c32c41c"
```
This eliminates force-push and deletion risks. The `overrides` field should mirror this.

### 2. Shell Injection — PowerShell Username Escaping

**Severity: OPTIONAL (adequate for current use)**

`doctor.ts` constructs a PowerShell repair command using single-quote escaping for the username:

```typescript
const psEscapedUsername = `'${rawUsername.replace(/'/g, "''")}'`;
```

**Analysis:**

- In PowerShell, single-quoted strings are **literal strings** — `$`, backtick, `()`, and other special characters are NOT interpreted. The only escape is `''` for an embedded single quote. This escaping is correct.
- Windows usernames cannot contain `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, or control characters (including newlines and null bytes). This severely limits attack surface.
- The command is **displayed as a suggestion** in a doctor report — it is NOT programmatically executed. A human would need to copy-paste it. Even if escaping were imperfect, the user would see the malformed command before executing.
- The username originates from `process.env.USERNAME`, which an attacker could manipulate if they control the environment (e.g., in a CI/CD context). However, environment control implies full process control, making injection via username a redundant attack vector.

**Verdict:** The escaping is correct for its purpose. Single-quote doubling is the standard PowerShell escaping technique. No action required, though a defense-in-depth sanitization (stripping non-printable characters) could be added if this command were ever auto-executed.

### 3. globalThis Pollution — `__piSubagentsTempAclBroken`

**Severity: OPTIONAL**

A boolean diagnostic flag `__piSubagentsTempAclBroken` is set on `globalThis` when ACL repair fails.

**Analysis:**

- **Read by malicious extension:** Any Pi extension sharing the same `globalThis` can read this flag. The flag reveals only that the user's temp directories have ACL corruption (boolean: true/false). This is negligible information disclosure — not PII, not exploitable.
- **Manipulation by malicious extension:** A malicious extension could set this flag to `true` (causing spurious warnings) or `false` (suppressing legitimate warnings). However, both impacts are low-severity: a false warning is an annoyance, a suppressed warning merely hides a message that the user can still discover via `pi gsd doctor`.
- **Collision risk:** The `__piSubagentsTempAclBroken` name includes a namespace prefix (`__piSubagents`). Collision with another extension is unlikely but not impossible. The risk is two extensions accidentally sharing the same flag name, causing cross-talk.
- **The threat model (T-03-05) already accepted this risk** with the rationale: "Flag contains no PII; value is boolean; other extensions already share the globalThis namespace."

**Recommendation:** Consider using a `Map` or `WeakMap` stored in a module-scoped closure instead of `globalThis` to eliminate collision and tampering surface. However, given the accepted risk and low impact, this is **OPTIONAL**.

### 4. Temp Directory Traversal — `sanitizeTempScopeSegment`

**Severity: OPTIONAL (defense-in-depth gap)**

The `sanitizeTempScopeSegment` function in pi-subagents `types.ts`:

```typescript
export function sanitizeTempScopeSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}
```

**Analysis:**

- `.` (dot) is in the allowed character set, allowing `..` to survive sanitization. For example, `sanitizeTempScopeSegment("..")` returns `".."`.
- However, the sanitized value is always **embedded in a prefix** before being used as a path component:
  - `resolveTempScopeId` produces `user-{sanitized}` or `uid-{uid}` or `home-{sanitized}`
  - `updateDirsForSession` produces `{baseScopeId}-{sessionSuffix}`
  - The final path segment is `pi-subagents-{scopeId}`, making the full component something like `pi-subagents-user-..`
- `path.join(os.tmpdir(), "pi-subagents-user-..")` produces a path with a literal `..` as part of the directory name — it does NOT resolve `..` to the parent directory because it's part of a larger segment, not a standalone `..` segment.
- `sessionId` comes from `sessionManager.getSessionFile()` or `.getSessionId()`, which is Pi-internal and not user-controllable.
- `username` comes from environment variables or `os.userInfo()`, which in the pi-gsd process context is not attacker-controllable (an attacker controlling `process.env.USERNAME` already controls the process).

**Verdict:** Path traversal via `..` in sessionId or username is **not exploitable in practice** because:
1. The input sources are not attacker-controllable.
2. Even if `..` passed through, it's embedded in a larger path segment and is not interpreted as a directory traversal.

**Defense-in-depth recommendation:** Remove `.` from the allowed character set in `sanitizeTempScopeSegment` (change to `/[^A-Za-z0-9_-]+/g`) or add an explicit `/\.\./g` strip. This eliminates `..` entirely. However, given the current non-exploitable context, this is **OPTIONAL**.

### 5. Dependency Pinning — npm Override Effectiveness

**Severity: DEFERRED**

The `overrides` field in `package.json`:

```json
"overrides": {
  "pi-subagents": "github:NOirBRight/pi-subagents#feat/session-scoped-temp-dirs"
}
```

**Analysis:**

- `overrides` in npm forces all transitive resolutions of `pi-subagents` to use the specified version. This prevents dependency confusion attacks where a different (potentially malicious) version of `pi-subagents` could be hoisted from a deep dependency.
- However, `overrides` only affects the `pi-subagents` package name. A dependency confusion attack via a similarly-named scoped package (e.g., `@scope/pi-subagents`) or a different registry would bypass this override.
- The direct dependency also uses the same GitHub reference, which is consistent.
- As noted in Finding #1, both the direct dependency and the override use a **branch name** rather than a commit hash. The lockfile pins to a specific commit, so `npm ci` is safe, but the `package.json` declaration could drift.

**Verdict:** The override is effective for its stated purpose (ensuring transitive dependencies use the same version). Combined with Finding #1, the main risk is the branch reference rather than the override mechanism itself. **DEFERRED** — consider adding a `.npmrc` with `resolution-mode=highest` or switching to a commit hash for full supply chain hardening.

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Branch ref in package.json (force-push/deletion risk) | **FIX-WORTHY** | Open — change to commit hash |
| 2 | PowerShell username escaping | **OPTIONAL** | Adequate — no action needed |
| 3 | globalThis flag pollution | **OPTIONAL** | Accepted risk (T-03-05) — no action needed |
| 4 | sanitizeTempScopeSegment allows `..` | **OPTIONAL** | Not exploitable — defense-in-depth suggested |
| 5 | npm overrides effectiveness | **DEFERRED** | Adequate — hardened by commit-hash pin (after #1) |

**Threats Open:** 1 (branch reference supply chain risk)
**Threats Closed:** 4