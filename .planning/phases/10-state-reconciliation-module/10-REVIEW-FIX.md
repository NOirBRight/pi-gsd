# Phase 10 Review Fix

Fixed: 2026-06-01

## Changes

- Active Execute reconciliation now allows the phase to proceed when canonical plans exist before matching summaries, and when incomplete-phase ROADMAP metadata is still catching up.
- Added `workflow.state_reconciliation_apply` plus `pi-gsd-core orchestrate --reconcile-apply` so metadata repair writes remain explicit and opt-in.
- `ReconciliationFailedError` now preserves both report evidence and blocker evidence, deduplicated for handoff consumers.
- E2E and CLI fixtures now use canonical `NN-YY-PLAN.md` / `NN-YY-SUMMARY.md` artifacts for the normal chain path.

## Verification

- Targeted: 5 files passed, 94 tests passed.
- Full gate: `npm run check` passed, including 25 test files / 370 tests, build, and doctor.
