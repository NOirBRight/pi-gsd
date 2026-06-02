---
phase: 11-worktree-safety-recovery-classification
plan: 04
subsystem: worktree-lease-lifecycle
tags: [worktree-safety, orchestrator, journal, lease-evidence]
dependency_graph:
  requires: [11-03, worktree-safety, orchestrator-journal-integration]
  provides: [WTREE-02, RECOV-02]
  affects: [src/worktree-safety, src/orchestrator]
tech_stack:
  added: []
  patterns: [result-style lease operations, bounded journal evidence, orchestrator lifecycle cleanup]
key_files:
  created: []
  modified:
    - src/worktree-safety/types.ts
    - src/worktree-safety/git.ts
    - src/worktree-safety/lease.ts
    - src/worktree-safety/index.ts
    - src/orchestrator/state-machine.ts
    - tests/worktree-safety.test.ts
    - tests/orchestrator.test.ts
    - tests/orchestrator-journal.test.ts
decisions:
  - Real lease release removes the owned `.planning/worktree-leases/lease.json` record after owner evidence matches.
  - Orchestrator release events are forwarded through `AdvanceResult.events` and the existing journal adapter path; no second journal writer was added.
metrics:
  completed_at: 2026-06-02T01:05:00Z
  commits: skipped by user instruction
---

# Phase 11 Plan 04: Worktree Safety + Recovery Classification Summary

Closed the missing `lease_released` lifecycle gap by adding a real owned lease release operation and wiring it into source-writing orchestrator completion/cleanup.

## Completed Tasks

- Task 1: Added `releaseLeaseOwnership` with ownership/session/root/branch/host/pid validation, safe `.planning` path enforcement, owned lease deletion, and bounded `lease_released` journal events.
- Task 2: Wired release cleanup into `advanceOrchestration` after successful source-writing dispatch and post-dispatch failure cleanup, forwarding release events through `AdvanceResult.events` for `createAutoOrchestrator` journal persistence.

## Verification

- RED gate: `npx vitest run tests/worktree-safety.test.ts tests/orchestrator.test.ts tests/orchestrator-journal.test.ts --reporter=dot` failed before implementation with missing `releaseLeaseOwnership` and missing `lease_released` lifecycle events.
- `npx vitest run tests/worktree-safety.test.ts tests/recovery.test.ts --reporter=dot` — passed.
- `npx vitest run tests/orchestrator.test.ts tests/orchestrator-journal.test.ts tests/worktree-safety.test.ts tests/recovery.test.ts --reporter=dot` — passed.
- `npm run typecheck` — passed.
- `npm run check` — passed (28 files, 399 tests, build, doctor).
- Source grep confirmed `leaseReleasedEvent` has a production caller in `src/worktree-safety/lease.ts` and tests do not append a synthetic `leaseReleasedEvent` to the journal.

## Would-be Commit Boundaries

Commits were intentionally skipped per user instruction.

- `test(11-04): add failing lease release lifecycle tests`
- `feat(11-04): implement owned lease release operation`
- `feat(11-04): wire lease release through orchestrator lifecycle`
- `docs(11-04): complete lease lifecycle gap summary`

## Deviations from Plan

None - plan executed as written, except commits/STATE automation were skipped per explicit user instruction to avoid commits and preserve current uncommitted Phase 11 work.

## Known Stubs

None.

## Threat Flags

None beyond the plan threat model. The new release path reuses `.planning` path containment and bounded journal redaction.

## Self-Check: PASSED

- Summary created at `.planning/phases/11-worktree-safety-recovery-classification/11-04-SUMMARY.md`.
- Key files exist and targeted/full verification passed.
- Commits intentionally skipped per user instruction.
