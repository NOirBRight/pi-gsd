---
phase: 03-subagent-stability
reviewed: 2026-05-30T02:11:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - src/doctor.ts
  - src/extension.ts
  - tests/doctor.test.ts
  - tests/eperm-guard.test.ts
  - tests/extension.test.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-30T02:11:00Z
**Depth:** deep
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed 5 files changed across the 03-01, 03-02, and 03-03 commits implementing the subagent stability guard and ACL diagnostic. The core additions are `guardPiSubagentsTempDirs` (extension.ts), `checkPiSubagentsTempAcl` (doctor.ts), and associated test coverage.

The guard and diagnostic are architecturally sound as a best-effort safety net, but there are four notable issues: the guard's repair path triggers destructively on ALL `accessSync` error types (not just ACL), the diagnostic flag is written but never consumed by any production code, the ACL checker reports `ok: true` for missing directories creating a false-negative in doctor output, and the PowerShell repair message interpolates unescaped `process.env.USERNAME` into a shell command string. Additionally, there are redundant imports and substantial test duplication.

## Warnings

### WR-01: `guardPiSubagentsTempDirs` attempts destructive repair for ALL accessSync errors, not just ACL

**File:** `src/extension.ts:77-88`
**Issue:** The guard's inner `catch` block at line 79 catches ALL errors from `accessSync` and proceeds directly to `rmSync(dirPath, { recursive: true, force: true })`. This is inconsistent with `checkPiSubagentsTempAcl` (doctor.ts), which correctly distinguishes EACCES/EPERM from other error codes like ENOENT. In practice, ENOENT → rmSync with `force:true` is a harmless no-op, and EACCES → rmSync also likely fails. However, for less common errors (e.g., transient EBUSY or race-condition failures), the guard could successfully delete a directory containing in-use subagent results. The guard should only attempt repair when the error code is EACCES or EPERM, mirroring the checker's logic.
**Fix:**
```typescript
} catch (accessError: unknown) {
  const errorCode = typeof accessError === "object" && accessError !== null && "code" in accessError
    ? (accessError as { code: string }).code
    : "";
  if (errorCode === "EACCES" || errorCode === "EPERM") {
    // Directory is inaccessible due to ACL — try to repair
    try {
      fsImpl.rmSync(dirPath, { recursive: true, force: true });
      fsImpl.mkdirSync(dirPath, { recursive: true });
    } catch {
      (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken = true;
    }
  }
  // Non-ACL errors (ENOENT, etc.) are intentionally ignored — not corruption
}
```

### WR-02: `globalThis.__piSubagentsTempAclBroken` is written but never read by any production code

**File:** `src/extension.ts:86`
**Issue:** When the guard's repair fails (ACL too corrupted for non-elevated repair), `globalThis.__piSubagentsTempAclBroken` is set to `true`. However, no production code anywhere in the codebase reads this flag. The user is never notified, no warning is displayed, and no downstream logic adapts its behavior. This means when the guard detects unrepairable ACL corruption, it silently fails — subagents will still crash when they try to access the corrupted directories, and the user gets no indication of the root cause. The diagnostic flag should be consumed: at minimum, the `session_start` handler should check the flag after `guardPiSubagentsTempDirs()` returns and issue a warning via `ctx.ui.notify()`.
**Fix:**
```typescript
// In session_start handler, after guardPiSubagentsTempDirs():
guardPiSubagentsTempDirs();
if ((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken) {
  notify(ctx, "pi-gsd: pi-subagents temp directories have ACL corruption that could not be auto-repaired. Run 'pi gsd doctor' for repair instructions.", "warning");
}
```

### WR-03: `checkPiSubagentsTempAcl` reports `ok: true` when temp directories are absent (false-negative)

**File:** `src/doctor.ts:67-69`
**Issue:** When `accessSync` throws ENOENT (directory doesn't exist), the function records a message but keeps `ok: true`. This means `runDoctor` reports overall success even when the pi-subagents temp directories don't exist at all. While the function's name scopes it to "ACL" checks (and missing dirs are not ACL corruption), the practical impact is that `runDoctor` gives a false sense of health — a user running doctor sees "pi-subagents temp ACL: ok (dir not found: ...)" but the overall result is `ok: true`, hiding the fact that subagent functionality may be broken because the directories don't exist.
**Fix:**
```typescript
if (errorCode === "EACCES" || errorCode === "EPERM") {
  ok = false;
  messages.push(`pi-subagents temp ACL: CORRUPTED — ...`);
} else if (errorCode === "ENOENT") {
  ok = false;
  messages.push(`pi-subagents temp ACL: MISSING — directory ${dirPath} does not exist. Subagents may fail until it is created.`);
} else {
  messages.push(`pi-subagents temp ACL: ok (dir not found: ${dirPath})`);
}
```

### WR-04: PowerShell repair message interpolates unescaped `process.env.USERNAME` into shell command

**File:** `src/doctor.ts:64`
**Issue:** The CORRUPTED diagnostic message builds a PowerShell command string using direct string interpolation of `process.env.USERNAME`. While Windows usernames are typically restricted, `process.env.USERNAME` is a raw environment variable that could theoretically be set to a value containing PowerShell metacharacters (e.g., via environment manipulation). The result is a malformed or potentially exploitable shell command when copy-pasted by the user. The fix is to use the already-sanitized username (from `buildPiSubagentsTempRoot` logic), or at minimum, properly escape the value for PowerShell.
**Fix:**
```typescript
// Use the sanitized username rather than raw process.env.USERNAME:
const username = process.env.USERNAME ?? "$USERNAME";
// Or, escape for PowerShell by wrapping in single quotes (PowerShell literal string):
`icacls "${dirPath}" /grant '${username}':F /t; `
```

## Info

### IN-01: Redundant `require("node:os")` fallback in `buildPiSubagentsTempRoot`

**File:** `src/extension.ts:28-32`
**Issue:** `buildPiSubagentsTempRoot` includes a `require("node:os")` fallback to call `os.userInfo()` for the username. However, the module already has `import { tmpdir } from "node:os"` at line 2, which guarantees `node:os` is loaded. The `require` fallback inside the IIFE can never fail (if the ESM import worked, `require` will also succeed), making the try/catch dead code. The `os.userInfo()` call could be replaced with a direct import.
**Fix:** Replace the `require` fallback with a top-level helper or import:
```typescript
import { tmpdir, userInfo } from "node:os";
// Then in buildPiSubagentsTempRoot:
const info = userInfo();
if (info.username) return info.username;
```

### IN-02: Substantial duplicate test coverage between `eperm-guard.test.ts` and `extension.test.ts`

**File:** `tests/eperm-guard.test.ts`, `tests/extension.test.ts`
**Issue:** Both test files contain nearly identical test suites for `guardPiSubagentsTempDirs`, `checkPiSubagentsTempAcl`, `buildPiSubagentsTempRoot`, and `TEMP_DIR_SUBDIRS`. For example, both test that `guardPiSubagentsTempDirs` "sets globalThis.__piSubagentsTempAclBroken when repair also fails" and "does not throw when ACL repair fails" with the same mock patterns. They differ slightly in test style (mock-based vs. real filesystem), but the overlap means 6+ test cases are effectively duplicated. This increases maintenance burden without increasing coverage.
**Fix:** Consolidate into a single test module — either `extension.test.ts` (which already tests the extension broadly) or keep `eperm-guard.test.ts` as the dedicated EPERM integration test file, removing the duplicated `guardPiSubagentsTempDirs` block from `extension.test.ts`.

---

_Reviewed: 2026-05-30T02:11:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_