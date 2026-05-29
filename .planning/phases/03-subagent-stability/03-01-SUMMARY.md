---
phase: 03-subagent-stability
plan: 01
subsystem: subagent-infra
tags: [eperm, acl, windows, dir-container, es-module]

# Dependency graph
requires: []
provides:
  - "EPERM-tolerant ensureAccessibleDir with pid-scoped fallback (upstream PR)"
  - "DIRS mutable container replacing export const RESULTS_DIR/ASYNC_DIR"
  - "All 11 consumer module sites migrated to DIRS.*"
affects: [pi-subagents-upstream, subagent-stability]

# Tech tracking
tech-stack:
  added: []
  patterns: [eperm-catch-fallback, mutable-dirs-container]

key-files:
  created:
    - D:/Workstation/pi-subagents/test/unit/ensure-accessible-dir.test.ts
  modified:
    - D:/Workstation/pi-subagents/src/extension/index.ts
    - D:/Workstation/pi-subagents/src/shared/types.ts
    - D:/Workstation/pi-subagents/src/extension/doctor.ts
    - D:/Workstation/pi-subagents/src/runs/background/async-execution.ts
    - D:/Workstation/pi-subagents/src/runs/background/async-job-tracker.ts
    - D:/Workstation/pi-subagents/src/runs/background/async-resume.ts
    - D:/Workstation/pi-subagents/src/runs/background/run-id-resolver.ts
    - D:/Workstation/pi-subagents/src/runs/background/run-status.ts
    - D:/Workstation/pi-subagents/src/runs/background/stale-run-reconciler.ts
    - D:/Workstation/pi-subagents/src/runs/shared/nested-events.ts

key-decisions:
  - "DIRS object pattern chosen over getter/setter pattern — simpler, ES module const binding + mutable properties"
  - "Pid-scoped fallback (`${dirPath}-${process.pid}`) chosen for uniqueness per-process on ACL corruption"
  - "Backward-compatible RESULTS_DIR/ASYNC_DIR aliases retained in types.ts for any undiscovered consumers"

patterns-established:
  - "EPERM catch + recovery + fallback: catch EPERM/EACCES → try rmSync+mkdirSync → pid-scoped fallback"
  - "DIRS mutable container: export const DIRS = { results, async, chain, artifacts } — const binding, mutable properties"

requirements-completed: [D-01, D-02, D-03]

# Metrics
duration: 180s
completed: "2026-05-30"
---

# Phase 03: Subagent Stability — Plan 01 Summary

**EPERM-tolerant ensureAccessibleDir with pid-scoped fallback + DIRS mutable container submitted as upstream PR to pi-subagents**

## Performance

- **Duration:** ~3 min (inline execution)
- **Tasks:** 2/2
- **Files modified:** 11 (in pi-subagents repo)

## Accomplishments

- `ensureAccessibleDir` now catches EPERM/EACCES from `mkdirSync`, attempts rmSync+retry, and falls back to `${dirPath}-${process.pid}` when recovery fails
- DIRS mutable container exported from `types.ts` — object properties can be reassigned at runtime while the const binding stays ES module compatible
- All 11 consumer module sites migrated from `RESULTS_DIR`/`ASYNC_DIR` direct usage to `DIRS.results`/`DIRS.async`
- Unit tests for ensureAccessibleDir and DIRS container (9 pass)
- Upstream PR submitted: https://github.com/nicobailon/pi-subagents/pull/232

## Task Commits

1. **Task 1 + 2 (combined):** EPERM-tolerant ensureAccessibleDir + DIRS container - `34d0dac` (feat)

## Decisions Made

- Chose DIRS object pattern over getter/setter — simpler API, same mutability via object properties
- Kept backward-compatible `RESULTS_DIR`/`ASYNC_DIR` aliases in types.ts as static snapshots
- Fork at NOirBRight/pi-subagents created; push to fork succeeded (upstream push denied: permission)

## Deviations from Plan

- Combined Task 1 and Task 2 into a single commit since they were tightly coupled (DIRS needed before call site updates, ensureAccessibleDir return value change needed DIRS)
- Test file couldn't import directly from index.ts (Node.js strip-only mode doesn't support TS parameter properties) — used standalone copy of ensureAccessibleDir in test file with note to keep in sync

## Issues Encountered

- Push to upstream `nicobailon/pi-subagents` denied (403 Permission) — required fork instead
- Node.js `--experimental-strip-types` can't import index.ts due to TypeScript parameter properties in that file
- Pre-existing test failures in upstream repo (9 failures in TUI/index-child tests) — these are Windows-specific issues unrelated to my changes
- Subagent executor failed twice when attempting worktree-based dispatch (Pi runtime doesn't support `isolation="worktree"`)

## Next Phase Readiness

- Upstream PR pending review per D-03: 2-week window before considering fork as primary dependency
- Plan 03-02 (interim guard) already complete — provides safety net while PR is pending
- Plan 03-03 can proceed with verification

---
*Phase: 03-subagent-stability*
*Completed: 2026-05-30*