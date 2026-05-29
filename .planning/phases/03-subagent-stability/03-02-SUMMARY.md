---
phase: 03-subagent-stability
plan: 02
subsystem: extension, doctor
tags: [acl, eperm, guard, doctor, tdd]
dependency_graph:
  requires: []
  provides: [guardPiSubagentsTempDirs, checkPiSubagentsTempAcl, buildPiSubagentsTempRoot, TEMP_DIR_SUBDIRS]
  affects: [src/extension.ts, src/doctor.ts]
tech_stack:
  added: [node:fs, node:os, node:path]
  patterns: [best-effort-guard, acl-diagnostic, injectable-fs-for-testing]
key_files:
  created: []
  modified:
    - src/extension.ts
    - src/doctor.ts
    - tests/extension.test.ts
    - tests/doctor.test.ts
decisions:
  - guardPiSubagentsTempDirs runs in session_start (late-stage safety net, not pre-load guarantee)
  - Guard injects fs via options for testability of ACL failure scenarios
  - Doctor imports buildPiSubagentsTempRoot and TEMP_DIR_SUBDIRS from extension.ts to avoid path drift
  - ACL check distinguishes EACCES/EPERM (corruption) from ENOENT (dir not yet created, not corruption)
metrics:
  duration: 164s
  completed: "2026-05-30"
  tasks: 2
  files: 4
---

# Phase 03 Plan 02: Interim Guard & ACL Diagnostic Summary

Best-effort guard pre-cleans pi-subagents temp directories on session_start; doctor detects ACL corruption with actionable repair instructions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add guardPiSubagentsTempDirs to extension.ts session_start | 5028923 | src/extension.ts, tests/extension.test.ts |
| 2 | Add ACL corruption diagnostic to doctor command | 4d76cb4 | src/doctor.ts, tests/doctor.test.ts |

## Key Changes

### Task 1: guardPiSubagentsTempDirs

- `guardPiSubagentsTempDirs()` exported from `src/extension.ts` — checks accessibility of pi-subagents temp subdirectories on `session_start`
- `buildPiSubagentsTempRoot()` — mirrors pi-subagents' `resolveTempScopeId` path construction (env USERNAME/USER/LOGNAME → os.userInfo → "unknown" fallback, same sanitization regex)
- `TEMP_DIR_SUBDIRS` — `["async-subagent-results", "async-subagent-runs"]` as const
- `GuardOptions` type with injectable `tempRoot` and `fs` for testability
- On access failure: attempts `rmSync` + `mkdirSync` repair; sets `globalThis.__piSubagentsTempAclBroken = true` if repair also fails
- Top-level try/catch ensures guard never throws
- Explicit comment documenting limitation: guard runs in `session_start` (AFTER extension load), not a pre-load guarantee

### Task 2: checkPiSubagentsTempAcl

- `checkPiSubagentsTempAcl()` exported from `src/doctor.ts` — checks ACL integrity of pi-subagents temp dirs
- Uses `buildPiSubagentsTempRoot` and `TEMP_DIR_SUBDIRS` imported from `./extension.js` to avoid path drift
- Distinguishes EACCES/EPERM (CORRUPTED with repair instructions) from ENOENT (dir not found, ok)
- CORRUPTED message includes exact PowerShell repair commands (takeown + icacls + Remove-Item)
- `runDoctor()` calls `checkPiSubagentsTempAcl` after pi-subagents package resolution check
- ACL corruption sets `ok: false` in doctor result
- `aclChecker` option on `DoctorOptions` for test injection
- `AclCheckOptions` type with injectable `tempRoot` and `fs` for testability

## Test Coverage

- **7 new extension tests**: accessible dirs, repair path (missing dirs → mkdir), unrepairable ACL flag, never-throws, buildPiSubagentsTempRoot path format, TEMP_DIR_SUBDIRS contents
- **5 new doctor tests**: accessible dirs ACL ok, EACCES CORRUPTED, EPERM CORRUPTED, non-blocking (other checks continue), ok=false on corruption
- **All 192 tests pass** (180 original + 12 new)
- **typecheck clean**, **build clean**

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

No new threat surface beyond what was documented in the plan's `<threat_model>`. The globalThis flag (`__piSubagentsTempAclBroken`) is boolean-only diagnostic, already documented as T-03-05 (accept).

## Known Stubs

None — all data sources are wired to real filesystem operations.

## Self-Check: PASSED

- All 4 modified files verified present
- Both task commits (5028923, 4d76cb4) verified in git log
- 03-02-SUMMARY.md verified present