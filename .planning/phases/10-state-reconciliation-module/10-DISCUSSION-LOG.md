# Phase 10: State Reconciliation Module - Discussion Log

Date: 2026-06-01
Mode: `gsd-discuss-phase 10 --chain`

## Initial Phase

Phase 10 target:

Replace `gsd_query` SDK bridge usage for all `.planning/` state operations with a native idempotent reconciliation module.

The initial ROADMAP success criteria required:
- `src/state-reconciliation/` exposes `reconcileBeforeDispatch(basePath)`
- drift catalog covers known cases
- every drift kind has idempotent repair tests
- `ReconciliationFailedError` flows to Phase 11 Recovery Classification
- Auto Orchestration calls reconciliation before dispatch

## Area 1: Drift Repair Boundary

Prompted question:

How aggressive should repair be?

Options discussed:
- Conservative repair
- Aggressive repair
- Detect only

Selected:

Conservative repair.

Decision:

Only deterministic metadata drift may be auto-repaired. Missing or ambiguous content artifacts become typed blockers.

Follow-up question:

How should non-repairable drift be represented?

Options discussed:
- Typed per-drift blockers
- One generic blocker
- Human-readable only

Selected:

Typed per-drift blockers.

Decision:

Each drift returns a stable reason code and evidence paths.

## Area 2: State Truth Priority

Prompted question:

When artifacts, ROADMAP, STATE, and journal disagree, what wins?

Options discussed:
- Artifacts first
- ROADMAP first
- Journal first

Selected:

Artifacts first.

Decision:

Canonical disk artifacts are the source of truth. ROADMAP, STATE, and journal are derived state that can be repaired when metadata diverges.

Follow-up question:

Which artifacts count as canonical?

Options discussed:
- Canonical GSD artifacts only
- Any phase markdown
- Configurable patterns

Selected:

Canonical GSD artifacts only.

Decision:

Only canonical GSD artifact names count toward completion state. Noncanonical markdown is evidence only.

## Area 3: Repair Output Shape

Prompted question:

What should reconciliation return?

Options discussed:
- Structured report
- Throw-or-pass only
- Text summary

Selected:

Structured report.

Decision:

Return a report with `ok`, `snapshot`, `repairs`, `blockers`, `written`, and `evidence` concepts.

Follow-up question:

Should reconciliation write automatically?

Options discussed:
- Dry-run then apply explicitly
- Always repair when possible
- Never write

Selected:

Dry-run then apply explicitly.

Decision:

Default to dry-run. Writes require explicit `apply: true` from CLI/orchestrator.

## Area 4: Failure Handoff

Prompted question:

What should `ReconciliationFailedError` carry into Phase 11?

Options discussed:
- Typed reason plus evidence
- Raw report only
- Error string only

Selected:

Typed reason plus evidence.

Decision:

`ReconciliationFailedError` carries `reasonCode`, `blockers[]`, `repairPlan`, `evidence[]`, and `suggestedNextAction`.

Follow-up question:

How specific should Phase 10 suggested actions be?

Options discussed:
- Suggest only category
- Choose concrete recovery action
- No suggestion

Selected:

Suggest only category.

Decision:

Phase 10 suggests category-level next actions only. Concrete recovery action selection remains Phase 11 scope.

## Additional Accepted Recommendations

Recommendation:

Repair transaction safety should be explicit.

Accepted decision:

Plan repairs first and run precondition checks before writes. If a partial write occurs, return a `partial-write` blocker with `written[]`; do not build complex rollback in Phase 10.

Recommendation:

The drift catalog should close over the ROADMAP cases plus current-session evidence.

Accepted decision:

Minimum catalog includes sketch flag, completion timestamps, roadmap divergence, stale worker, unregistered milestone, `summary-count-mismatch`, and `noncanonical-plan-like-file`. Unknown drift becomes an `unknown-drift` blocker.

## Deferred Boundaries

Deferred to Phase 11:
- recovery action taxonomy
- retry/pause/self-heal/stop decision logic
- worktree safety enforcement

Deferred to Phase 12:
- Tool Contract Bridge
- Settings Bridge

Explicitly not included:
- content synthesis
- automatic backfill of missing artifacts
- broad cleanup of noncanonical files

## Outcome

Discussion complete. Phase 10 is ready for planning with locked decisions captured in `10-CONTEXT.md`.
