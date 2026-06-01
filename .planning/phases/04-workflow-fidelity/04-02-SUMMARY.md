---
phase: 04-workflow-fidelity
plan: 02
subsystem: doctor
tags: doctor, rpiv, ask-user-question, peer-dependency

requires:
  - phase: 04-workflow-fidelity
    provides: existing doctor command infrastructure (resolveOfficialPackage, resolvePiSubagentsPackage patterns)
provides:
  - rpiv-ask-user-question availability check in doctor command
  - resolveRpivPackage module resolver
  - peerDependency declaration for @juicesharp/rpiv-ask-user-question
affects: [doctor command output, npm install workflow]

tech-stack:
  added: ["@juicesharp/rpiv-ask-user-question (peerDependency)"]
  patterns: ["createRequire/require.resolve pattern for optional dependency resolution"]

key-files:
  created: ["src/rpiv.ts"]
  modified: ["src/doctor.ts", "tests/doctor.test.ts", "package.json"]

key-decisions:
  - "rpiv check is warning-level (does not set ok:false) — missing rpiv is not an error, just informational"
  - "Used peerDependency not regular dependency — rpiv is installed via pi install, not npm"

patterns-established:
  - "Optional dependency resolver: resolveRpivPackage mirrors resolvePiSubagentsPackage pattern, uses createRequire"

requirements-completed: [D-02, D-05]

duration: 2min
completed: 2026-05-30
---

# Phase 4 Plan 2: Workflow Fidelity Summary

**rpiv-ask-user-question availability check in doctor command with peerDependency declaration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-30T02:59:54Z
- **Completed:** 2026-05-30T03:01:50Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Doctor command now checks for @juicesharp/rpiv-ask-user-question availability
- Warning message includes install command and explains --text fallback mode
- All 234 tests pass including 4 new rpiv-specific tests
- package.json declares rpiv as peerDependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Add rpiv-ask-user-question availability check to doctor** (TDD)
   - RED: `b9b3a44` - test(04-02): add failing tests for rpiv-ask-user-question doctor check
   - GREEN: `bc590dc` - feat(04-02): add rpiv-ask-user-question availability check to doctor

## Files Created/Modified
- `src/rpiv.ts` - New module resolver for @juicesharp/rpiv-ask-user-question (mirrors resolvePiSubagentsPackage pattern)
- `src/doctor.ts` - Added rpiv check after pi-subagents check, added rpivResolver option to DoctorOptions
- `tests/doctor.test.ts` - Added 4 tests for rpiv doctor check (installed ok, missing warning, malformed module, existing checks still pass)
- `package.json` - Added @juicesharp/rpiv-ask-user-question as peerDependency (^1.15.0)

## Decisions Made
- rpiv missing produces a warning (not error) — missing rpiv means AskUserQuestion-dependent workflows fall back to --text mode, not a hard failure
- Used peerDependency rather than regular dependency — rpiv is installed via `pi install npm:@juicesharp/rpiv-ask-user-question`, not npm

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Doctor check for rpiv is complete and verified
- rpiv is declared as peerDependency, users will be guided to install it
- Phase 04 plan 02 is the final plan in the workflow-fidelity phase

## Self-Check: PASSED

- All created/modified files exist: src/rpiv.ts, src/doctor.ts, tests/doctor.test.ts, package.json
- Both TDD commits exist: b9b3a44 (RED), bc590dc (GREEN)
- 04-02-SUMMARY.md created

---
*Phase: 04-workflow-fidelity*
*Completed: 2026-05-30*