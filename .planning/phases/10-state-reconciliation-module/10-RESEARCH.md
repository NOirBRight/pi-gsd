# Phase 10: State Reconciliation Module - Research

Gathered: 2026-06-01
Status: Complete

## Summary

Phase 10 should replace the minimal Phase 9 reconciliation seam with a native `src/state-reconciliation/` module, while preserving the existing orchestrator gate order. The safest implementation shape is a narrow public API with a richer internal catalog: scan canonical `.planning/` artifacts, classify known drift, plan deterministic metadata repairs, default to dry-run, and apply only when explicitly requested.

Confidence is high for repo integration patterns and medium for the exact repair rules for `sketch-flag-drift`, `stale-worker`, and `unregistered-milestone`, because the current repo names those categories but does not yet define their final field schema.

## Existing Patterns To Reuse

- Keep `src/orchestrator/gates.ts` as the pre-dispatch ordering owner. It already calls `reconcileBeforeDispatch` before dispatch decision, tool contract, worktree root, and runtime persistence.
- Replace `src/orchestrator/reconciliation.ts` with an adapter that calls `src/state-reconciliation/`, preserving the `GateAdapter` surface expected by `runPreDispatchGates`.
- Use structured result objects, not printing or thrown control flow. Existing orchestrator, journal, state digest, and gates all return `{ ok, messages/evidence, written }`-style records.
- Keep file writes constrained to `.planning/` and fail closed on unsafe or corrupt state. Journal already refuses paths outside `.planning` and refuses to overwrite corrupt journals.
- Use injected dependencies for tests. Current tests inject gates, dispatch, runners, journal adapters, clocks, and temp project roots.
- Keep local TypeScript imports with `.js` suffix and add no new runtime dependencies.

## Recommended Module Breakdown

```text
src/state-reconciliation/
├── index.ts
├── types.ts
├── errors.ts
├── scan.ts
├── artifacts.ts
├── roadmap.ts
├── state.ts
├── journal.ts
├── catalog.ts
├── repair.ts
└── drift/
    ├── sketch-flag.ts
    ├── completion-timestamp.ts
    ├── roadmap-divergence.ts
    ├── stale-worker.ts
    ├── unregistered-milestone.ts
    ├── summary-count-mismatch.ts
    └── noncanonical-plan-like-file.ts
```

Public API should be close to:

```ts
reconcileBeforeDispatch(basePath, { apply?: boolean, phase?: string, now?: () => string })
```

Return concept:

```ts
{
  ok,
  snapshot,
  repairs,
  blockers,
  written,
  evidence
}
```

`apply` defaults to `false`.

## Drift Catalog

| Drift Kind | Detection | Repair Policy | Blocker Reason |
|---|---|---|---|
| `sketch-flag-drift` | `.planning/sketches/` or sketch findings state conflicts with workflow/UI phase flags. | Repair only if the correct boolean/metadata value is mechanically provable; otherwise block. | `sketch-flag-drift` |
| `completion-timestamp-drift` | ROADMAP row says complete but timestamp is missing or inconsistent with canonical artifact completion. | Repair deterministic timestamp only when canonical phase artifacts prove completion. | `completion-timestamp-drift` |
| `roadmap-divergence` | ROADMAP phase row plan counts/status diverge from canonical `XX-YY-PLAN.md` and `XX-YY-SUMMARY.md` files. | Repair counts/status if artifact set is complete and canonical. | `roadmap-divergence` |
| `stale-worker` | Journal says a unit/session is active but canonical artifacts or lifecycle state prove it is stale. | Do not kill or recover workers in Phase 10; return typed blocker with category hint. | `stale-worker` |
| `unregistered-milestone` | STATE or phase artifacts reference milestone progress not represented in ROADMAP milestone metadata. | Repair only metadata if exact milestone identity already exists elsewhere; no synthesis. | `unregistered-milestone` |
| `summary-count-mismatch` | Completed plans exceed canonical `SUMMARY.md` count, or summaries are missing for executed plans. | Missing summary content is a blocker; incorrect derived count can be repaired. | `summary-count-mismatch` |
| `noncanonical-plan-like-file` | Files like `09-PLAN-CHECK.md` resemble plan artifacts but do not match canonical `XX-YY-PLAN.md`. | Never count as plan; report evidence. Usually blocker only if it would alter counts. | `noncanonical-plan-like-file` |
| `unknown-drift` | Any detector finds unsupported state mismatch. | Never repair. | `unknown-drift` |

`partial-write` must be a separate write failure blocker containing already-written paths in `written[]`.

## Fixture And Test Strategy

Use Vitest with temp project roots via `mkdtempSync`, matching current tests.

Recommended tests:

- One table-driven unit suite per drift kind in `tests/state-reconciliation.test.ts`.
- For every repairable drift: dry-run reports `repairs[]` and leaves files unchanged; apply writes expected paths; second apply writes nothing.
- For every blocking drift: dry-run and apply both return `ok: false`, stable `reasonCode`, evidence paths, and no writes.
- Fixture scenarios:
  - Phase 7/8 semantic completion with missing summaries -> `summary-count-mismatch` blocker.
  - Phase 9 `09-PLAN-CHECK.md` -> `noncanonical-plan-like-file` evidence, not counted as plan.
  - ROADMAP `0/2` vs canonical artifacts complete -> repairable `roadmap-divergence`.
  - Complete ROADMAP row with missing timestamp -> repairable `completion-timestamp-drift`.
  - Corrupt `orchestration-state.json` -> fail closed, no overwrite.
- Add one e2e test extending `tests/e2e/orchestrator-chain.test.ts`: orchestrator calls reconciliation before dispatch and pauses with a typed gate failure when blockers exist.

## Integration Notes

- `src/orchestrator/reconciliation.ts` should become the compatibility adapter:
  - derive `basePath` from `snapshot.cwd ?? process.cwd()`;
  - call the new module with `apply: true` only if orchestrator/CLI explicitly enables it;
  - map blockers to `GateResult` failure with `gate: "reconcileBeforeDispatch"`;
  - preserve existing minimal checks for `snapshot.status === "running"` and `currentUnit.id === unit.id`.
- `src/orchestrator/gates.ts` should keep the current order unchanged; do not inline drift logic there.
- Journal state is derived evidence, not canonical truth. Disk artifacts under `.planning/phases/` win over ROADMAP/STATE, and ROADMAP/STATE win over journal/session state.
- Add `ReconciliationFailedError` for Phase 11 handoff, but gates should still convert it into structured gate failure rather than letting it escape the orchestration loop.

## Risks And Open Questions

- Exact `sketch-flag-drift` fields are not implemented in current code; planner should require a narrow first-pass definition tied to `.planning/sketches/MANIFEST.md`, sketch README `winner`, and project-local sketch findings presence.
- `unregistered-milestone` can become content synthesis if it creates new milestone prose. Keep Phase 10 limited to metadata repair when the milestone identity already exists.
- `stale-worker` overlaps with Phase 11 recovery/worktree safety. Phase 10 should detect and block, not recover.
- Markdown mutation is fragile. Keep repair functions line-oriented and narrowly scoped to ROADMAP table rows, STATE frontmatter/progress/current-position fields, and journal JSON only.
- Stable reason-code names must be chosen before implementation starts; changing them later will break Phase 11 Recovery Classification consumers.

## Sources

- `.planning/phases/10-state-reconciliation-module/10-CONTEXT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `src/orchestrator/reconciliation.ts`
- `src/orchestrator/gates.ts`
- `src/orchestrator/journal.ts`
- `src/orchestrator/state-digest.ts`
- `src/orchestrator/types.ts`
- `tests/orchestrator.test.ts`
- `tests/orchestrator-journal.test.ts`
- `generated/workflows/references/artifact-types.md`
- `generated/workflows/templates/state.md`
- `generated/workflows/references/checkpoints.md`
- `generated/workflows/references/planning-config.md`
