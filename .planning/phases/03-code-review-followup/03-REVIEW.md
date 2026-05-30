---
phase: 03-code-review-followup
reviewed: 2026-05-30T09:15:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/extension.ts
  - src/doctor.ts
  - tests/extension.test.ts
  - tests/eperm-guard.test.ts
  - tests/doctor.test.ts
  - package.json
  - D:/Workstation/pi-subagents/src/shared/types.ts
  - D:/Workstation/pi-subagents/src/extension/index.ts
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 03: Code Review Report — Subagent Stability Follow-Up

**Reviewed:** 2026-05-30T09:15:00Z
**Depth:** deep (cross-file analysis with fork dependency)
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the guard/doctor/extension changes on `fix/subagent-stability-phase03-followup` plus the `pi-subagents` fork at `feat/session-scoped-temp-dirs`. Found two BLOCKER-level bugs and three FIX-WORTHY issues. The most serious problems are: (1) the `__piSubagentsTempAclBroken` flag is never cleared, producing persistent false-positive warnings across sessions, and (2) unknown error codes in `checkPiSubagentsTempAcl` leave `ok: true` despite failed `accessSync` calls. There is also a significant path-mismatch between pi-gsd's guard/doctor (user-scoped paths) and the fork's session-scoped temp directories, making the guard check stale directories that the current session doesn't use.

---

## Critical Issues

### CR-01: `__piSubagentsTempAclBroken` flag is never cleared — permanent false positives

**File:** `src/extension.ts:99,131`
**Issue:** When ACL repair fails, `guardPiSubagentsTempDirs` sets `globalThis.__piSubagentsTempAclBroken = true`. The `session_start` handler then checks this flag and emits a warning notification. However, the flag is **never cleared** — not after successful repair on a subsequent session, not at the start of `guardPiSubagentsTempDirs`, not at any other point in production code (only test `afterEach` blocks clear it).

This means that once set, the flag persists for the entire Pi process lifetime. If a user repairs their ACL corruption (e.g., by running the PowerShell commands from `doctor`), subsequent `session_start` events will still trigger the warning because the stale flag remains `true`. Pi supports multiple sessions within one process, so this produces repeated false-positive warnings.

Additionally, if pi-gsd is hot-reloaded (the pi-subagents extension already handles this with `__piSubagentRuntimeCleanup`), the flag from a previous invocation persists in `globalThis`.

**Fix:**
```typescript
// In guardPiSubagentsTempDirs, inside the try block, BEFORE the for loop:
// Reset the flag at the start of each guard invocation so a previously-set
// stale flag doesn't persist if the directories are now accessible.
delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;

for (const subdir of TEMP_DIR_SUBDIRS) {
  // ... existing repair logic
```

And optionally, add a `beforeEach` reset in `extension.test.ts` integration tests (the `ACL corruption warning on session_start` describe block currently only has `afterEach`).

### CR-02: `checkPiSubagentsTempAcl` reports `ok: true` for unknown error codes (EBUSY, EIO, etc.)

**File:** `src/doctor.ts:74`
**Issue:** In the `else` branch of the error-code dispatch, when `accessSync` throws an error with a code other than `EACCES`, `EPERM`, or `ENOENT`, a message is pushed (`"check error (${errorCode}): ${dirPath}"`), but `ok` is **not set to `false``. This means `checkPiSubagentsTempAcl` returns `{ ok: true, messages: ["check error (EBUSY): /tmp/..."] }` — claiming success despite being unable to verify directory access.

Real error codes that could hit this branch include `EBUSY` (locked by another process on Windows), `EIO` (I/O error), `ENOTDIR` (parent is not a directory), `ELOOP` (symlink loop), `EROFS` (read-only filesystem). Any of these means the directory is inaccessible, which should be reported as `ok: false`.

**Fix:** Set `ok = false` in the `else` branch:
```typescript
} else {
  ok = false;
  messages.push(`pi-subagents temp ACL: check error (${errorCode}): ${dirPath}`);
}
```

---

## Warnings

### WR-01: Guard and doctor check stale user-scoped paths after fork moves pi-subagents to session-scoped paths

**File:** `src/extension.ts:38` (`buildPiSubagentsTempRoot`), `src/doctor.ts:48` (uses `buildPiSubagentsTempRoot`)
**Issue:** `buildPiSubagentsTempRoot()` always returns the user-scoped path (e.g., `<tmp>/pi-subagents-user-noirb`). After the fork's `updateDirsForSession(sessionId)` runs in pi-subagents' `session_start` handler, pi-subagents uses session-scoped paths (e.g., `<tmp>/pi-subagents-user-noirb-abc12345`).

The guard and doctor are now checking directories that the current session **does not use**. The guard's ACL repair and the `__piSubagentsTempAclBroken` flag apply to stale user-scoped dirs. While repairing user-scoped dirs is still useful for the next session's `ensureAccessibleDir` load-time check, the warning "pi-subagents temp directories have ACL corruption that could not be auto-repaired" is misleading — the current session's directories (session-scoped, fresh) are likely fine.

This is a design gap introduced by the fork dependency. The guard should ideally check the current session's actual directories, but pi-gsd has no way to know the session-scoped path.

**Fix (recommended):** Import `DIRS` and/or `updateDirsForSession` from pi-subagents, or have pi-gsd's guard accept a `dirs` option that pi-subagents can populate during `session_start`. Short-term: update the warning message to clarify it refers to "shared temp directories" not "current session directories."

### WR-02: Path computation diverges between pi-gsd and pi-subagents fork on Linux/macOS

**File:** `src/extension.ts:26-37` (`buildPiSubagentsTempRoot`)
**Issue:** `buildPiSubagentsTempRoot()` computes the scope as `user-{sanitized}`, always using a username-based path. The fork's `resolveTempScopeId()` has a different precedence chain: it first checks `process.getuid()` (available on Linux/macOS), falling back to username env vars, then `os.userInfo()`, then home-directory-based scoping, then `"shared"`.

On Linux/macOS where `process.getuid` exists, pi-subagents uses `uid-{uid}` while pi-gsd uses `user-{sanitized}`. The resulting temp root paths diverge entirely (e.g., `/tmp/pi-subagents-uid-1000` vs `/tmp/pi-subagents-user-myname`). The guard and doctor would check a non-existent directory path, making them ineffective on those platforms.

This is a pre-existing issue (not introduced by this PR), but the fork's `resolveTempScopeId` signature has changed (added `homedir` fallback, `getuid` priority), widening the divergence.

**Fix:** Import `resolveTempScopeId` (or `sanitizeTempScopeSegment` + the scope logic) from pi-subagents instead of duplicating it, or mirror the full priority chain including `getuid` and homedir fallbacks.

### WR-03: Guard skips ENOENT — missing directories are no longer auto-created

**File:** `src/extension.ts:86-90`
**Issue:** The old guard treated any `accessSync` error as actionable, including `ENOENT`, and would auto-create missing directories via `rmSync({ force: true })` + `mkdirSync({ recursive: true })`. The new guard intentionally skips `ENOENT` (only repairs on `EACCES`/`EPERM`). The comment says "Non-ACL errors (ENOENT, EBUSY, etc.) are not corruption — skip repair."

This is a deliberate behavioral change — pi-subagents' `ensureAccessibleDir` creates directories at load time, so the guard doesn't need to. However, if pi-subagents is not installed or hasn't loaded yet, the guard will leave missing directories uncreated. The guard previously served as a safety net that created directories regardless of whether pi-subagents was loaded.

**Fix (optional):** Consider creating missing directories (ENOENT case) with `mkdirSync({ recursive: true })` separately from the ACL repair path, since `mkdirSync` is safe for missing dirs and doesn't require `rmSync` first. This restores the safety-net behavior without conflating ACL repair with directory creation.

---

## Info

### IN-01: Doctor ENOENT change from `ok: true` to `ok: false` — semantic improvement with fresh-install UX cost

**File:** `src/doctor.ts:71-72`
**Issue:** Previously, `accessSync` throwing `ENOENT` resulted in `"ok (dir not found)"` with `ok: true`. Now it produces `"MISSING"` with `ok: false`. This is semantically more correct (a missing directory is a problem), but on a fresh installation (before pi-subagents has ever run), `doctor` will report failure for directories that would be auto-created on the next pi-subagents load.

The message "Subagents may fail until it is created" is accurate, but could be improved to note that the directories will be auto-created on the next session start.

**Fix (optional):** Change the ENOENT message to: `"pi-subagents temp ACL: MISSING — directory ${dirPath} does not exist. It will be created automatically on the next session start, or run 'pi gsd doctor' for manual repair."`

### IN-02: Test coverage gap — no test for guard skipping non-ACL, non-ENOENT errors (e.g., EBUSY)

**File:** `tests/eperm-guard.test.ts`
**Issue:** The new test for "does not attempt rmSync for non-ACL errors like ENOENT" only verifies ENOENT is skipped. There's no test that EBUSY, EISDIR, or other non-ACL errors are also skipped by the guard. Similarly, there's no test in `doctor.test.ts` for the `else` branch of `checkPiSubagentsTempAcl` (unknown error codes producing `ok: true` — the bug described in CR-02).

**Fix:** Add a test case in `eperm-guard.test.ts` for EBUSY (or another non-ACL, non-ENOENT error) to verify the guard skips it without setting the flag. Add a test in `doctor.test.ts` for unknown error codes to verify they produce `ok: false` once CR-02 is fixed.

---

_Reviewed: 2026-05-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_