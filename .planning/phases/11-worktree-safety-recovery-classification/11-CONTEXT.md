# Phase 11: Worktree Safety + Recovery Classification - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 delivers two paired runtime safety modules for pi-gsd-core:

1. `src/worktree-safety/prepareUnitRoot(unitType, unitId)` validates the root used by source-writing orchestration Units and fails closed with a typed `worktree-invalid` recovery decision when safety invariants are violated.
2. `src/recovery/classifyFailure(input)` classifies orchestration/gate failures into exactly eight explicit recovery classes, each mapped to exactly one action: `retry`, `pause-with-remediation`, `self-heal`, or `stop`.

This phase connects the Phase 9 orchestrator gate seam and the Phase 10 structured reconciliation blockers. It does not implement broad worktree lifecycle projection, parallel slice orchestration, Tool Contract Bridge, Settings Bridge, or generated workflow changes.

</domain>

<decisions>
## Implementation Decisions

### Root Validation Contract
- **D-01:** Fail-closed worktree/root validation applies to **source-writing Units**, not every read-only Unit. Read-only discuss/research/plan-style Units do not need isolated worktree validation unless they become source writers.
- **D-02:** When `workflow.worktrees=false`, source-writing Units may use the project root, but `prepareUnitRoot` must still validate `.git`, expected branch, and `GSD_PROJECT_ROOT`. Only isolated worktree/lease requirements are skipped.
- **D-03:** `GSD_PROJECT_ROOT` mismatch decisions must include full path evidence: `expectedProjectRoot`, `actualCwd`, `resolvedUnitRoot`, `unitId`, `unitType`, and `branch`.
- **D-04:** `prepareUnitRoot` should expose a Result-style API such as `{ ok, root?, decision? }`. Failures are typed recovery decisions, not thrown errors across module boundaries and not raw coupling to `GateResult`.

### Lease Ownership Rules
- **D-05:** Lease ownership is bound to `unitId` + orchestration session identity, including phase, branch, and process/host evidence.
- **D-06:** Stale leases may self-heal only when the holder is proven inactive and root/branch evidence matches. If evidence is incomplete or contradictory, pause with remediation.
- **D-07:** Branch mismatch is a safety-boundary failure. Do not automatically checkout/switch branches in recovery. Return a `worktree-invalid`-style decision that stops or pauses with clear remediation.
- **D-08:** Lease acquisition, release, and stale-reclaim evidence should be recorded in the orchestrator journal so recovery classification can consume structured facts.

### Eight Recovery Classes
- **D-09:** Use a safety-boundary-first taxonomy with exactly these eight classes:
  1. `transient-external-failure`
  2. `repairable-state-drift`
  3. `unrepaired-state-drift`
  4. `worktree-invalid`
  5. `dispatch-contract-invalid`
  6. `artifact-gate-failed`
  7. `user-input-required`
  8. `internal-invariant-violation`
- **D-10:** Phase 10 `ReconciliationBlocker` values must map by explicit `reasonCode` table. Do not scrape prose and do not rely only on `suggestedNextAction`.
- **D-11:** `partial-write` must map to `stop` and preserve `written[]`/evidence. Do not attempt automatic rollback or continuation.
- **D-12:** No `other`, `unknown`, or `null` fallback is allowed. Unmodeled failures must be classified into an explicit stop-class such as `internal-invariant-violation` or `dispatch-contract-invalid`.

### Recovery Action Mapping
- **D-13:** Each recovery class maps to exactly one action. The mapping is not user-configurable; config may tune parameters like retry budgets, but cannot change class→action semantics.
- **D-14:** Initial locked mapping:
  - `transient-external-failure` → `retry`
  - `repairable-state-drift` → `self-heal`
  - `unrepaired-state-drift` → `pause-with-remediation`
  - `worktree-invalid` → `stop`
  - `dispatch-contract-invalid` → `stop`
  - `artifact-gate-failed` → `pause-with-remediation`
  - `user-input-required` → `pause-with-remediation`
  - `internal-invariant-violation` → `stop`
- **D-15:** Planner should verify this table against v1.0 triage failure families and Phase 7 gsd-pi references, but should not reintroduce a catch-all class.

### Telemetry and Orchestrator Handoff
- **D-16:** Gate failures should embed a typed `recoveryDecision` field in the existing `GateResult` failure branch while retaining current `reason`, `resumeHint`, and `evidence` fields for compatibility.
- **D-17:** Telemetry `exitReason` should directly use the recovery class value. Additional `action` fields are allowed, but the exit reason taxonomy is the eight-class recovery taxonomy.
- **D-18:** Journal/status records should store structured, bounded evidence only: class, action, reasonCode, unitId, paths, branch, attempt, `written[]`, and concise messages. Do not log full user text, secrets, tokens, or unbounded raw errors.

### Claude's Discretion
- Exact TypeScript type names and file split inside `src/worktree-safety/` and `src/recovery/`.
- Exact lease file/schema shape, as long as journal events remain the recovery-classification-readable source for lease evidence.
- Exact table-driven test fixture layout.
- Exact remediation message wording, as long as it includes actionable evidence and preserves redaction constraints.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 11 scope and current project state
- `.planning/ROADMAP.md` §Phase 11 — phase goal, WTREE/RECOV requirement IDs, success criteria, and two-plan expectation.
- `.planning/PROJECT.md` — v2.0 direction: native Pi runtime modules while keeping upstream GSD content canonical.
- `.planning/STATE.md` — current position and carried decisions from Phases 8-10.
- `.planning/REQUIREMENTS.md` — referenced by ROADMAP for WTREE-01/02 and RECOV-01/02, but this file is currently absent in the working tree; planner should confirm whether requirements are tracked elsewhere before assuming missing requirements are intentional.

### Prior phase decisions and handoff contracts
- `.planning/phases/10-state-reconciliation-module/10-CONTEXT.md` — Phase 10 typed blockers, dry-run/apply repair boundary, failure handoff shape, and category-level recovery hints.
- `.planning/phases/09-auto-orchestration-native-module/09-CONTEXT.md` — Phase 9 orchestrator Units, gate ordering, journal/status fields, redaction constraints, and `prepareUnitRoot` seam.
- `.planning/phases/08-upstream-1-2-0-upgrade-package-rename/08-CONTEXT.md` — v2.0 package rename and upstream compatibility constraints.
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/07-RESEARCH.md` — gsd-pi module mapping, ADR anchor list, and anti-patterns including no silent degradation to project root.
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/gsd-pi-module-map.md` — primary spike reference for Worktree Safety and Recovery Classification surfaces.

### Existing code integration points
- `src/orchestrator/gates.ts` — current gate order: reconciliation, dispatch decision, tool contract seam, `prepareUnitRoot`, runtime persistence; Phase 11 replaces the placeholder `prepareUnitRoot` behavior.
- `src/orchestrator/types.ts` — existing Unit, GateResult, journal event, settings, status, and worktrees setting types.
- `src/orchestrator/journal.ts` — journal persistence and redaction pattern for bounded structured events.
- `src/state-reconciliation/types.ts` — Phase 10 `ReconciliationBlocker`, `reasonCode`, `written[]`, `evidence[]`, and `suggestedNextAction` shapes consumed by recovery classification.
- `src/state-reconciliation/errors.ts` — structured reconciliation failure context handoff.
- `src/state-reconciliation/catalog.ts` — current reconciliation reason code catalog.
- `src/index.ts` — public exports for new module APIs if they are part of stable package surface.

### Generated/upstream references
- `generated/workflows/references/universal-anti-patterns.md` — no direct unsafe state mutations; fail closed on safety boundaries.
- `generated/workflows/references/planning-config.md` — workflow settings including `workflow.worktrees`, retry/repair settings, and auto-advance semantics.
- `generated/agents/gsd-code-fixer.md` — current generated-agent worktree/recovery sentinel behavior; useful as an example of existing worktree safety language, not necessarily a module API contract.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/orchestrator/gates.ts` already owns pre-dispatch gate order and contains a placeholder `prepareUnitRoot` function returning `phase-11-worktree-safety-seam`.
- `src/orchestrator/types.ts` already defines Unit types, settings including `workflow.worktrees`, `GateResult`, journal events, and `StopReason`; Phase 11 should extend rather than bypass these seams.
- `src/state-reconciliation/types.ts` provides typed blockers, evidence, repairs, writes, and reason codes that `classifyFailure` must consume.
- `src/state-reconciliation/errors.ts` provides structured failure context that should be an input fixture for recovery classification tests.
- `src/orchestrator/journal.ts` provides the existing place to record bounded structured lifecycle events.

### Established Patterns
- Application/runtime modules return structured results rather than printing from service boundaries.
- Local imports require `.js` suffixes under NodeNext.
- Generated files under `generated/` are upstream-derived and should not be hand-edited for runtime behavior.
- Phase 9 redaction decisions apply: record IDs, paths, event kinds, statuses, attempts, and short reasons; avoid full user text and secrets.
- Phase 10 established conservative repair boundaries: deterministic metadata repair can self-heal, ambiguous/content-bearing failures pause, partial writes stop.

### Integration Points
- `runPreDispatchGates` in `src/orchestrator/gates.ts` should call the real worktree safety module for source-writing Units.
- Recovery classification should be usable by gate failures, dispatch failures, reconciliation failures, and telemetry/journal/status emission.
- The planner should decide whether `GateResult` is extended directly in `src/orchestrator/types.ts` or adapted through a small recovery bridge, but the output must expose typed `recoveryDecision` to callers.
- Tests should be table-driven and cover every class, every action, known Phase 10 reason codes, worktree validation failures, and known v1.0 triage failure families.

</code_context>

<specifics>
## Specific Ideas

- User asked to continue the discussion in Chinese; planning artifacts remain English for downstream agents.
- The chosen recovery taxonomy intentionally differs from the earlier gsd-pi labels by organizing around safety boundaries and actionability. The Phase 7 gsd-pi references remain important evidence, but the Phase 11 taxonomy above is the locked target for this project.
- `workflow.worktrees=false` is not a blanket bypass for source-writing safety. It means no isolated worktree/lease requirement, while `.git`, expected branch, and `GSD_PROJECT_ROOT` still apply.

</specifics>

<deferred>
## Deferred Ideas

- Full worktree lifecycle projection and long-lived worktree management remain deferred to v2.1 unless separately roadmapped.
- Tool Contract Bridge remains Phase 12.
- Settings Bridge remains Phase 12.
- Parallel slice orchestration remains deferred to v2.1 per Phase 7.

</deferred>

---

*Phase: 11-Worktree Safety + Recovery Classification*
*Context gathered: 2026-06-01*
