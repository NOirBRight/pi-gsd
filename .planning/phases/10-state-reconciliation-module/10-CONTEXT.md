# Phase 10: State Reconciliation Module - Context

Gathered: 2026-06-01
Status: Ready for planning

## Phase Goal

Replace `gsd_query` SDK bridge usage for `.planning/` state operations with a native, typed, idempotent TypeScript reconciliation module.

Phase 10 owns the state reconciliation boundary that runs before auto-orchestration dispatch. It detects known drift between canonical GSD artifacts, ROADMAP/STATE metadata, and orchestration journal state; repairs deterministic metadata drift only when explicitly applied; and returns typed blockers for anything ambiguous or content-bearing.

## Locked Decisions

### D-01 Conservative Repair Boundary

Use conservative auto-repair. Phase 10 may automatically repair only deterministic metadata drift. Missing, ambiguous, or content-bearing artifacts are blockers, not synthesized content.

Examples:
- ROADMAP/STATE completion metadata can be repaired when canonical phase artifacts prove the state.
- Missing required plan, summary, verification, review, or context content becomes a typed blocker.
- Ambiguous evidence remains blocked until a human or later recovery phase classifies it.

### D-02 Typed Drift Blockers

Every drift kind returns stable typed blockers with reason codes and evidence paths. Blockers must be machine-readable enough for Phase 11 Recovery Classification to consume without scraping prose.

Expected blocker shape should include at least:
- `reasonCode`
- `message`
- `evidence`
- optional `phase`, `artifact`, or `repairPlan`

### D-03 Artifact-First Truth Priority

Canonical disk artifacts are the source of truth for phase completion and planning state. ROADMAP, STATE, and orchestration journal data are derived state and may be repaired when metadata diverges from canonical artifacts.

Priority order:
1. Canonical phase artifacts under `.planning/phases/`
2. ROADMAP/STATE metadata derived from those artifacts
3. Orchestration journal/session state
4. Noncanonical markdown as evidence only

### D-04 Canonical Artifact Names Only

Only canonical GSD artifact names count toward completion or plan state. Noncanonical markdown files can support evidence but must not count as plans, summaries, verification reports, or reviews.

Examples:
- `NN-XX-PLAN.md`, `NN-XX-SUMMARY.md`, `NN-VERIFICATION.md`, `NN-REVIEW.md`, `NN-CONTEXT.md` count.
- Files like `09-PLAN-CHECK.md` do not count as plan artifacts and should be classified as `noncanonical-plan-like-file` evidence.

### D-05 Structured Reconciliation Report

Expose `src/state-reconciliation/` with a `reconcileBeforeDispatch(basePath, options?)` style API that returns a structured report instead of loosely formatted text.

The report should be close to:

```ts
{
  ok: boolean;
  snapshot: ReconciledStateSnapshot;
  repairs: ReconciliationRepair[];
  blockers: ReconciliationBlocker[];
  written: ReconciliationWrite[];
  evidence: ReconciliationEvidence[];
}
```

Exact TypeScript names are implementation details, but the concepts above are locked.

### D-06 Dry Run By Default

Reconciliation defaults to dry-run. File writes require explicit `apply: true` from the CLI or orchestrator integration.

Planning and tests must cover both:
- dry-run reports proposed repairs without writing
- apply mode writes deterministic metadata repairs and records `written[]`

### D-07 Transaction Safety

Repair application must plan first, then perform precondition checks before writing. If a write sequence partially succeeds and then fails, return a `partial-write` blocker with the already-written paths in `written[]`.

Do not build a complex rollback system in Phase 10. Preserve evidence and make the failure explicit.

### D-08 Failure Handoff Shape

`ReconciliationFailedError` should carry structured failure context:
- `reasonCode`
- `blockers[]`
- `repairPlan`
- `evidence[]`
- `suggestedNextAction`

This is the handoff contract into Phase 11.

### D-09 Category-Level Recovery Hints Only

Phase 10 only suggests category-level next actions such as:
- `manual-review`
- `rerun-reconcile`
- `requires-recovery-classification`

Concrete choices like retry, pause, self-heal, stop, or escalation remain Phase 11 scope.

### D-10 Drift Catalog Minimum Closure

The initial drift catalog must cover the five ROADMAP-known cases plus the two concrete cases discovered while reconciling Phases 7-9.

Minimum required drift kinds:
- sketch flag drift
- completion timestamp drift
- roadmap divergence
- stale worker
- unregistered milestone
- `summary-count-mismatch`
- `noncanonical-plan-like-file`

Anything outside the catalog should become an `unknown-drift` blocker rather than being silently repaired.

## Scope Boundaries

In scope:
- native TypeScript reconciliation module
- fixture-backed idempotent drift detection and repair
- dry-run and apply modes
- pre-dispatch auto-orchestration integration
- typed blockers and typed failed reconciliation errors
- deterministic metadata repair for derived ROADMAP/STATE/journal state

Out of scope:
- full recovery action taxonomy
- retry/pause/self-heal/stop decision logic
- worktree safety enforcement
- Tool Contract Bridge and Settings Bridge
- content synthesis or automatic backfill of missing artifacts
- broad `.planning/` cleanup unrelated to dispatch safety

## Canonical References

Planning:
- `.planning/ROADMAP.md` Phase 10 section
- `.planning/PROJECT.md`
- `.planning/STATE.md`

Prior phase context:
- `.planning/phases/09-auto-orchestration-native-module/09-CONTEXT.md`
- `.planning/phases/09-auto-orchestration-native-module/09-01-SUMMARY.md`
- `.planning/phases/09-auto-orchestration-native-module/09-02-SUMMARY.md`
- `.planning/phases/09-auto-orchestration-native-module/09-03-SUMMARY.md`
- `.planning/phases/09-auto-orchestration-native-module/09-CHECK.md`
- `.planning/phases/09-auto-orchestration-native-module/09-VERIFICATION.md`
- `.planning/phases/08-upstream-1-2-0-upgrade-package-rename/08-CONTEXT.md`
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/07-CONTEXT.md`

Generated GSD references:
- `generated/workflows/references/artifact-types.md`
- `generated/workflows/templates/state.md`
- `generated/workflows/references/checkpoints.md`
- `generated/workflows/references/planning-config.md`
- `generated/workflows/references/universal-anti-patterns.md`

Current code:
- `src/orchestrator/reconciliation.ts`
- `src/orchestrator/gates.ts`
- `src/orchestrator/state-digest.ts`
- `src/orchestrator/journal.ts`
- `src/orchestrator/types.ts`
- `src/cli.ts`
- `src/extension.ts`

## Code Context

Reusable Phase 9 seam:
- `src/orchestrator/reconciliation.ts` already provides a minimal pre-dispatch reconciliation seam.
- `src/orchestrator/gates.ts` already calls reconciliation before dispatch decision, tool contract validation, unit root preparation, and runtime state persistence.
- This should be replaced or wrapped by the Phase 10 module rather than bypassed.

State mutation pattern:
- Existing orchestration state digest logic goes through the GSD tool runner instead of directly editing human markdown.
- Phase 10 should preserve that discipline where applicable: direct markdown mutation should be limited to explicit, deterministic metadata repair paths with clear tests.

Journal pattern:
- `src/orchestrator/journal.ts` provides machine-state persistence and redaction behavior.
- Reconciliation evidence should integrate with journal/session state without treating journal state as the canonical source for phase artifact truth.

Testing pattern:
- Use fixtures that model DB/journal/disk state in and reconciled state out.
- Each drift kind needs idempotence coverage: first apply writes expected repairs, second apply reports no additional writes.
- Tests should verify dry-run does not write.

## Discussion Inputs

The discussion was grounded in concrete drift found while reconciling Phases 7-9:
- Phases 7 and 8 were semantically complete but missing summary artifacts.
- Phase 9 had `09-PLAN-CHECK.md`, which looked plan-like but was noncanonical and caused plan-count misclassification.
- Package rename and launcher/workflow generation repairs showed that generated artifacts and canonical names must be treated precisely.

These examples should become fixtures where useful, especially for `summary-count-mismatch` and `noncanonical-plan-like-file`.

## Agent Discretion

The planner/implementer may choose:
- exact TypeScript type names
- exact fixture directory layout
- scanner abstraction boundaries
- exact category names for recovery hints, as long as they remain stable and typed
- whether existing `src/orchestrator/reconciliation.ts` becomes an adapter or is replaced by imports from `src/state-reconciliation/`

Do not reopen the locked decisions above unless implementation evidence shows a contradiction.
