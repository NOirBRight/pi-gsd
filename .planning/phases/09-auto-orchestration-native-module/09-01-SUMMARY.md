---
phase: 09-auto-orchestration-native-module
plan: 01
subsystem: orchestration
tags: [typescript, vitest, auto-orchestration, state-machine]

requires:
  - phase: 08-upstream-1-2-0-upgrade-package-rename
    provides: upstream 1.2.0 runtime baseline and retired SDK bridge context
provides:
  - Settings-driven workflow-step Unit queue construction
  - Pure orchestrator state transitions with ordered ORCH-02 gate seams
  - Public injectable AutoOrchestrator facade and singleton delegates
affects: [phase-10-state-reconciliation, phase-11-worktree-safety, phase-12-tool-contract]

tech-stack:
  added: []
  patterns: [structured service records, dependency injection, pure state transitions]

key-files:
  created:
    - src/orchestrator/types.ts
    - src/orchestrator/settings.ts
    - src/orchestrator/state-machine.ts
    - src/orchestrator/gates.ts
    - src/orchestrator/reconciliation.ts
    - src/orchestrator/index.ts
    - tests/orchestrator-settings.test.ts
    - tests/orchestrator.test.ts
  modified: []

key-decisions:
  - "Workflow-step Units are a closed TypeScript union; prompt/tool turns remain outside Phase 9 orchestration."
  - "Phase 10/11/12 behavior is represented by ordered seams only, with structured GateResult failures instead of exceptions."
  - "Facade APIs return structured records and use dependency injection so Pi dispatch and persistence can be wired later without printing."

patterns-established:
  - "TDD RED/GREEN commits per orchestrator slice."
  - "Gate failures pause with typed reason/resumeHint and bounded node_repair retry attempts."

requirements-completed: [ORCH-01, ORCH-02]

duration: 6min
completed: 2026-05-31
---

# Phase 09 Plan 01: Native Auto-Orchestration Kernel Summary

**Typed workflow-step orchestration kernel with settings-derived queues, ordered gate seams, and an injectable facade.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-31T17:58:58Z
- **Completed:** 2026-05-31T18:04:44Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added `src/orchestrator/types.ts` and `settings.ts` for closed Unit contracts, normalized `workflow.*` settings, and settings-driven Unit queue decisions.
- Added pure transition logic and gate seams in `state-machine.ts`, `gates.ts`, and `reconciliation.ts`, including ORCH-02 gate ordering and retry-budget pause behavior.
- Added `createAutoOrchestrator` plus `start`, `advance`, `resume`, `stop`, and `getStatus` facade methods with dependency injection and no service printing.

## Task Commits

1. **Task 1 RED: settings tests** - `73d07c3` (test)
2. **Task 1 GREEN: settings queue** - `e072b81` (feat)
3. **Task 2 RED: transition tests** - `61daad3` (test)
4. **Task 2 GREEN: gate/state transitions** - `11d7b11` (feat)
5. **Task 3 RED: facade tests** - `1cd34c8` (test)
6. **Task 3 GREEN: facade implementation** - `f13f429` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `src/orchestrator/types.ts` - Unit, settings, gate, snapshot, event, status, and facade contracts.
- `src/orchestrator/settings.ts` - `resolveWorkflowSettings` and `buildUnitQueue` with conflict pause handling.
- `src/orchestrator/state-machine.ts` - Pure start/advance/resume/stop/status transitions and retry handling.
- `src/orchestrator/gates.ts` - ORCH-02 pre-dispatch gate order and Phase 9 artifact gate seams.
- `src/orchestrator/reconciliation.ts` - Minimal Phase 9 state reconciliation seam.
- `src/orchestrator/index.ts` - Injectable AutoOrchestrator service and singleton facade exports.
- `tests/orchestrator-settings.test.ts` - Settings normalization, queue inclusion, and conflict pause tests.
- `tests/orchestrator.test.ts` - Gate ordering, retry, artifact pause, transition, and facade tests.

## Decisions Made

- Used dependency injection for settings, queue building, dispatch, journal, digest, gates, and clock to keep the facade testable and no-print.
- Kept Phase 10/11/12 work as named seams (`reconcileBeforeDispatch`, `validateToolContract`, `prepareUnitRoot`) rather than implementing deferred modules.
- Represented ambiguous settings/phase conflicts as a `pause-for-user` Unit with a non-empty resume hint.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- TypeScript flagged `readConfig()` as returning `unknown`; fixed by checking the parsed object before reading `config.workflow`.

## User Setup Required

None.

## Known Stubs

None. Seam-only behavior for Phase 10/11/12 is intentional per D-14 and the plan scope.

## TDD Gate Compliance

- RED commits present: `73d07c3`, `61daad3`, `1cd34c8`
- GREEN commits present: `e072b81`, `11d7b11`, `f13f429`
- REFACTOR commits: none needed

## Verification

- `npx vitest run tests/orchestrator-settings.test.ts` — passed during Task 1.
- `npx vitest run tests/orchestrator.test.ts` — passed during Tasks 2 and 3.
- `npx vitest run tests/orchestrator-settings.test.ts tests/orchestrator.test.ts` — 2 files, 11 tests passed.
- `npm run typecheck` — passed.

## Threat Flags

None. New trust-boundary surfaces match the plan threat model: settings input validation, closed Unit dispatch decisions, structured gate evidence, and bounded status fields.

## Self-Check: PASSED

- Verified created files exist.
- Verified task commits exist in git history.
- Verified targeted tests and typecheck pass.
