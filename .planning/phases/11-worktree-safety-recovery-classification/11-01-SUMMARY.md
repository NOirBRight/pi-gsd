---
phase: 11-worktree-safety-recovery-classification
plan: 01
subsystem: recovery-classification
tags: [recovery, orchestration, telemetry]
dependency_graph:
  requires: [state-reconciliation, orchestrator]
  provides: [RECOV-01, RECOV-02]
  affects: [src/recovery, src/orchestrator]
tech_stack:
  added: []
  patterns: [typed const arrays, explicit classification tables, NodeNext exports]
key_files:
  created: [src/recovery/types.ts, src/recovery/classify-failure.ts, src/recovery/index.ts, tests/recovery.test.ts]
  modified: [src/index.ts, src/orchestrator/types.ts, src/orchestrator/reconciliation.ts, src/orchestrator/state-machine.ts, tests/orchestrator.test.ts]
decisions:
  - Reconciliation gate reasons now surface recovery class as the runtime reason while preserving reasonCode in evidence/recoveryDecision.
metrics:
  completed_at: 2026-06-02T00:00:00Z
  commits: skipped by user instruction
---

# Phase 11 Plan 01: Recovery Classification Summary

Implemented a typed eight-class recovery taxonomy with fixed class-to-action mapping, reconciliation reason-code classification, GateResult recoveryDecision handoff, and recovery-class exitReason telemetry.

## Completed Tasks

- Task 1: Defined `RECOVERY_CLASSES`, `RECOVERY_ACTIONS`, `RecoveryDecision`, classifier input types, and `classifyFailure`.
- Task 2: Added `recoveryDecision` / `exitReason` to orchestrator gate failures and events, including reconciliation failure mapping.

## Verification

- `npx vitest run tests/recovery.test.ts tests/worktree-safety.test.ts tests/orchestrator.test.ts tests/orchestrator-journal.test.ts` — passed.
- `npm run typecheck` — passed.
- `npm run check` — passed (394 tests, build, doctor).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Compatibility] Updated existing reconciliation expectations**
- **Found during:** Task 2 verification.
- **Issue:** Existing tests expected `reasonCode` as event `reason`; Plan 11 requires `exitReason`/runtime reason to use recovery classes.
- **Fix:** Updated tests to assert recovery class reason while preserving reasonCode in evidence and `recoveryDecision.reasonCode`.
- **Files modified:** `tests/orchestrator.test.ts`, `tests/e2e/orchestrator-chain.test.ts`.
- **Commit:** skipped by user instruction.

## Known Stubs

None.

## Self-Check: PASSED

Files exist: `src/recovery/types.ts`, `src/recovery/classify-failure.ts`, `src/recovery/index.ts`, `tests/recovery.test.ts`. Commits intentionally skipped per user instruction.
