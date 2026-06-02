# Phase 11: Worktree Safety + Recovery Classification - Research

**Researched:** 2026-06-02  
**Domain:** TypeScript runtime safety modules for Git worktree validation and orchestration recovery taxonomy  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Full worktree lifecycle projection and long-lived worktree management remain deferred to v2.1 unless separately roadmapped.
- Tool Contract Bridge remains Phase 12.
- Settings Bridge remains Phase 12.
- Parallel slice orchestration remains deferred to v2.1 per Phase 7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WTREE-01 | `prepareUnitRoot(unitType, unitId)` returns a valid root or typed `worktree-invalid` recovery decision. [CITED: .planning/ROADMAP.md §Phase 11] | Worktree module API, source-writing predicate, Git/root/env/branch/lease checks below. |
| WTREE-02 | Validation covers `.git`, expected branch, lease ownership, and `GSD_PROJECT_ROOT`. [CITED: .planning/ROADMAP.md §Phase 11] | Worktree validation matrix and fixture strategy below. |
| RECOV-01 | `classifyFailure(input)` returns one of exactly eight explicit classes, with no `other`. [CITED: .planning/ROADMAP.md §Phase 11; .planning/phases/11-*/11-CONTEXT.md D-09/D-12] | Recovery taxonomy table and no-fallback test strategy below. |
| RECOV-02 | Each class maps to exactly one action and telemetry exit reasons use the same taxonomy. [CITED: .planning/ROADMAP.md §Phase 11; .planning/phases/11-*/11-CONTEXT.md D-13/D-17] | Action mapping, GateResult extension, and journal/status integration below. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No project-level `./CLAUDE.md` exists in this working tree. [VERIFIED: file read returned ENOENT] Global instructions still apply: use TDD for behavior changes, avoid new dependencies unless necessary, avoid secrets in artifacts, and do not commit without explicit user authorization. [CITED: C:\Users\noirb\.pi\agent\AGENTS.md]

## Summary

Phase 11 should be planned as two small, test-first TypeScript modules plus a thin orchestrator adapter: `src/recovery/` owns the fixed eight-class taxonomy and action map; `src/worktree-safety/` owns source-writing root validation and returns recovery decisions instead of throwing or degrading silently. [CITED: .planning/phases/11-worktree-safety-recovery-classification/11-CONTEXT.md D-01..D-18] The existing code already has the exact pre-dispatch seam in `src/orchestrator/gates.ts`, with gate order `reconcileBeforeDispatch → decideDispatch → validateToolContract → prepareUnitRoot → persistRuntimeState`. [VERIFIED: src/orchestrator/gates.ts]

Do not add packages. [VERIFIED: package.json] Use Node built-ins (`node:fs`, `node:path`, `node:child_process`), Git CLI probes, current Vitest infrastructure, and dependency injection for filesystem/git/process checks so table-driven tests can run without mutating real worktrees. [VERIFIED: package.json; src/orchestrator/gates.ts; vitest.config.ts]

**Primary recommendation:** implement `src/recovery/types.ts + classifyFailure.ts` first, then implement `src/worktree-safety/prepare-unit-root.ts`, and finally adapt `GateResult`, state-machine events, and journal redaction to carry bounded `recoveryDecision` evidence. [VERIFIED: src/orchestrator/types.ts; src/orchestrator/state-machine.ts; src/orchestrator/journal.ts]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recovery taxonomy and action mapping | API / Backend runtime module | Orchestrator | Recovery decisions are runtime control-flow data consumed by gates, dispatch, and telemetry. [VERIFIED: src/orchestrator/types.ts; .planning/phases/11-*/11-CONTEXT.md D-16/D-17] |
| Worktree/root validation | API / Backend runtime module | Git / filesystem boundary | Root safety depends on local Git and filesystem state before source-writing dispatch. [VERIFIED: src/orchestrator/gates.ts; CITED: gsd-pi ADR-016] |
| Lease evidence | API / Backend runtime module | Journal storage | Lease acquire/release/reclaim evidence must be structured and journal-readable for recovery. [CITED: .planning/phases/11-*/11-CONTEXT.md D-05..D-08] |
| Telemetry exit reason | Orchestrator | Journal/status persistence | `exitReason` must use the recovery class taxonomy while events remain bounded/redacted. [CITED: .planning/phases/11-*/11-CONTEXT.md D-17/D-18; VERIFIED: src/orchestrator/journal.ts] |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---|---:|---|---|
| TypeScript [VERIFIED: package.json; npm registry] | project range `^5.0.0`; registry latest checked `6.0.3` | Typed discriminated unions for recovery/worktree results. | Existing project language and NodeNext-style `.js` imports. [VERIFIED: package.json; .planning/phases/11-*/11-CONTEXT.md] |
| Node.js [VERIFIED: local environment] | project requires `>=22.0.0`; local `v25.7.0` | Runtime, fs/path/process/child_process probes. | Existing package engine and source code use Node built-ins. [VERIFIED: package.json; src/orchestrator/*.ts] |
| Git CLI [VERIFIED: local environment] | local `2.53.0.windows.2` | Resolve top-level, branch, and registered worktrees. | Git exposes `worktree list --porcelain`, `branch --show-current`, and related commands locally. [CITED: `git worktree -h`; `git branch --show-current` local probe] |
| Vitest [VERIFIED: package.json; npm registry] | project range `^4.0.0`; registry latest checked `4.1.8` | Unit and table-driven integration tests. | Existing test script is `vitest run`, include pattern is `tests/**/*.test.ts`. [VERIFIED: package.json; vitest.config.ts] |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|---|---:|---|---|
| `node:fs` / `node:path` [VERIFIED: source imports] | Node built-in | Check `.git`, lease file, path normalization. | Worktree module deps and fixtures. [VERIFIED: src/orchestrator/gates.ts; D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts] |
| `node:child_process.execFileSync` [VERIFIED: gsd-pi source] | Node built-in | Git probes with argument arrays, not shell strings. | Production git dependency implementation. [VERIFIED: D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Git CLI probes | Custom parsing of `.git/` internals | Avoid custom Git internals; CLI is more stable and test deps can stub it. [ASSUMED] |
| In-module direct `process.cwd()` / `process.env` | Injected deps with defaults | Injection makes branch/env/path failure tests deterministic and avoids mutating global process state in most tests. [VERIFIED: existing Phase 10 tests use fixtures; ASSUMED best practice] |

**Installation:** No new external packages should be installed for Phase 11. [VERIFIED: package.json; phase scope]

## Architecture Patterns

### System Architecture Diagram

```text
advanceOrchestration(snapshot, unit)
  → runPreDispatchGates(snapshot, unit)
    → reconcileBeforeDispatch
       └─ ReconciliationFailedError / blocker reasonCode
          → recovery.classifyFailure({ kind: "reconciliation", reasonCode, written, evidence })
    → decideDispatch
       └─ ambiguous unit / pause-for-user
          → recovery.classifyFailure({ kind: "gate", gate, reason })
    → validateToolContract (Phase 12 seam)
    → worktreeSafety.prepareUnitRoot(unitType, unitId, context)
       ├─ read-only or planning-only → ok root/not-required
       ├─ worktrees=false → validate project root `.git`, branch, GSD_PROJECT_ROOT; skip isolated lease
       └─ worktrees=true → validate unit root `.git`, expected branch, lease, GSD_PROJECT_ROOT
          └─ invalid → recovery decision class `worktree-invalid`, action `stop`
    → persistRuntimeState
  → dispatch(unit)
  → runPostDispatchGate(...written)
     └─ artifact failure / partial write evidence
        → recovery.classifyFailure(...)
  → journal/status events with recoveryDecision.class as exitReason
```

### Recommended Project Structure

```text
src/
├── recovery/
│   ├── types.ts              # RecoveryClass, RecoveryAction, RecoveryDecision unions
│   ├── classify-failure.ts   # explicit tables and classifier
│   └── index.ts              # public exports
├── worktree-safety/
│   ├── types.ts              # PrepareUnitRootInput/Result, lease evidence types
│   ├── git.ts                # default Git probe deps
│   ├── lease.ts              # minimal lease read/check/reclaim evidence helpers
│   ├── prepare-unit-root.ts  # public prepareUnitRoot implementation
│   └── index.ts              # public exports
└── orchestrator/
    ├── gates.ts              # adapt prepareUnitRoot result to GateResult
    ├── types.ts              # add recoveryDecision to failure branch/events
    ├── state-machine.ts      # propagate class/action into pause/stop/retry events
    └── journal.ts            # allow redacted recoveryDecision/exitReason fields
```

### Pattern 1: Explicit Class → Action Table
**What:** define `RECOVERY_ACTIONS satisfies Record<RecoveryClass, RecoveryAction>` and derive decisions from that table. [CITED: .planning/phases/11-*/11-CONTEXT.md D-13/D-14]  
**When to use:** all `classifyFailure` branches. [CITED: .planning/phases/11-*/11-CONTEXT.md D-09]

```ts
// Source: .planning/phases/11-worktree-safety-recovery-classification/11-CONTEXT.md D-09/D-14
export const RECOVERY_CLASSES = [
  "transient-external-failure",
  "repairable-state-drift",
  "unrepaired-state-drift",
  "worktree-invalid",
  "dispatch-contract-invalid",
  "artifact-gate-failed",
  "user-input-required",
  "internal-invariant-violation",
] as const;

export const RECOVERY_ACTIONS = {
  "transient-external-failure": "retry",
  "repairable-state-drift": "self-heal",
  "unrepaired-state-drift": "pause-with-remediation",
  "worktree-invalid": "stop",
  "dispatch-contract-invalid": "stop",
  "artifact-gate-failed": "pause-with-remediation",
  "user-input-required": "pause-with-remediation",
  "internal-invariant-violation": "stop",
} satisfies Record<RecoveryClass, RecoveryAction>;
```

### Pattern 2: Result-Style Safety Module
**What:** worktree safety returns `{ ok: true, root } | { ok: false, decision }`, not thrown errors and not `GateResult`. [CITED: .planning/phases/11-*/11-CONTEXT.md D-04]  
**When to use:** `src/worktree-safety/prepare-unit-root.ts`, then adapt in `src/orchestrator/gates.ts`. [VERIFIED: src/orchestrator/gates.ts]

```ts
// Source: Phase 11 CONTEXT D-04 and gsd-pi ADR-016 pattern
export type PrepareUnitRootResult =
  | { ok: true; root: string; evidence: WorktreeEvidence }
  | { ok: false; decision: RecoveryDecision };
```

### Pattern 3: Dependency-Injection for Git/FS/Env
**What:** default deps call real `fs`, `process`, and Git CLI; tests pass stubs. [VERIFIED: D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts; tests/state-reconciliation.test.ts fixture style]  
**When to use:** every `.git`, branch, lease, and env test. [ASSUMED]

### Anti-Patterns to Avoid
- **Silent fallback to project root:** corrupts source-writing isolation and is explicitly forbidden. [CITED: gsd-pi ADR-016; .planning/phases/11-*/11-CONTEXT.md D-01/D-02]
- **Branch auto-checkout in recovery:** branch mismatch is safety-boundary failure; do not switch branches automatically. [CITED: .planning/phases/11-*/11-CONTEXT.md D-07]
- **Prose scraping for reconciliation decisions:** use Phase 10 `reasonCode` tables. [CITED: .planning/phases/11-*/11-CONTEXT.md D-10; VERIFIED: src/state-reconciliation/types.ts]
- **`other` / `unknown` recovery class:** no fallback bucket is allowed; unmodeled inputs must become explicit stop classes. [CITED: .planning/phases/11-*/11-CONTEXT.md D-12]
- **Raw error logging:** journal redaction currently whitelists bounded keys and truncates strings; extend that pattern, do not bypass it. [VERIFIED: src/orchestrator/journal.ts]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Git branch/worktree discovery | Manual `.git` internals parser | `git branch --show-current`, `git worktree list --porcelain`, injectable Git probe deps | Git CLI supports these operations and avoids brittle internals. [CITED: `git worktree -h`; local Git probe] |
| Recovery action semantics | Configurable or heuristic action mapping | Locked `RECOVERY_ACTIONS` table | User locked one action per class. [CITED: .planning/phases/11-*/11-CONTEXT.md D-13/D-14] |
| State drift classifier | Message substring scraping | `ReconciliationReasonCode` table | Phase 10 exposes typed reason codes and blocker evidence. [VERIFIED: src/state-reconciliation/types.ts; tests/state-reconciliation.test.ts] |
| Journal sanitization | New ad-hoc event writer | Existing `redactJournalEvent` pattern | Current journal allows only bounded keys and filters unsafe fields. [VERIFIED: src/orchestrator/journal.ts] |

**Key insight:** this phase is mainly typed control-flow and safety-boundary validation; custom cleverness increases risk because the user already locked the taxonomy and fail-closed behavior. [CITED: .planning/phases/11-*/11-CONTEXT.md]

## Common Pitfalls

### Pitfall 1: Treating `workflow.worktrees=false` as full bypass
**What goes wrong:** source-writing Units skip `.git`, branch, and `GSD_PROJECT_ROOT` validation. [CITED: .planning/phases/11-*/11-CONTEXT.md D-02]  
**How to avoid:** branch logic should skip isolated worktree/lease checks only; root checks still run against project root. [CITED: .planning/phases/11-*/11-CONTEXT.md D-02]

### Pitfall 2: Adding recovery taxonomy but not wiring telemetry
**What goes wrong:** `GateResult` has typed decisions, but `lastEvent.reason` / exit reasons still use legacy strings like `gate-failed`. [VERIFIED: src/orchestrator/state-machine.ts currently writes `gate.reason`]  
**How to avoid:** extend failure branch and events with `recoveryDecision`; set telemetry `exitReason` to `decision.class`. [CITED: .planning/phases/11-*/11-CONTEXT.md D-16/D-17]

### Pitfall 3: Losing Phase 10 `written[]` on `partial-write`
**What goes wrong:** classifier stops correctly but drops already-written path evidence. [CITED: .planning/phases/11-*/11-CONTEXT.md D-11]  
**How to avoid:** classifier input and `RecoveryDecision.evidence` must preserve bounded `written[]` from reconciliation reports/blockers. [VERIFIED: src/state-reconciliation/types.ts; tests/state-reconciliation.test.ts]

### Pitfall 4: Real Git mutations in tests
**What goes wrong:** tests accidentally switch branches, prune worktrees, or depend on ambient repo state. [ASSUMED]  
**How to avoid:** use injected deps for unit tests; reserve a small integration smoke for read-only probes. [VERIFIED: Phase 10 tests use temp fixtures; tests/state-reconciliation.test.ts]

## Code Examples

### Gate adapter shape
```ts
// Source: src/orchestrator/gates.ts current seam + Phase 11 CONTEXT D-16
const prepared = prepareUnitRoot({ snapshot, unit });
if (!prepared.ok) {
  return {
    ok: false,
    gate: "prepareUnitRoot",
    reason: prepared.decision.class,
    retryable: prepared.decision.action === "retry",
    resumeHint: prepared.decision.remediation,
    evidence: prepared.decision.evidence.map(evidenceToString),
    recoveryDecision: prepared.decision,
  };
}
```

### Reconciliation reason-code mapping
```ts
// Source: src/state-reconciliation/types.ts + Phase 11 CONTEXT D-10/D-11
const RECONCILIATION_CLASS_BY_REASON = {
  "sketch-flag-drift": "unrepaired-state-drift",
  "completion-timestamp-drift": "repairable-state-drift",
  "roadmap-divergence": "repairable-state-drift",
  "stale-worker": "repairable-state-drift",
  "unregistered-milestone": "unrepaired-state-drift",
  "summary-count-mismatch": "artifact-gate-failed",
  "noncanonical-plan-like-file": "unrepaired-state-drift",
  "unknown-drift": "unrepaired-state-drift",
  "partial-write": "internal-invariant-violation",
} satisfies Record<ReconciliationReasonCode, RecoveryClass>;
```

Planner note: the exact mapping above is a recommendation from local evidence; keep `partial-write → stop` locked, and validate each non-partial mapping in plan tasks with table tests. [CITED: .planning/phases/11-*/11-CONTEXT.md D-11/D-15; VERIFIED: src/state-reconciliation/types.ts]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Prompt/agent instructions handle worktree safety and recovery | Native runtime modules behind orchestrator gates | v2.0 Phases 9-11 [CITED: .planning/ROADMAP.md] | Planner should create code tasks, not generated prompt edits. [CITED: .planning/phases/11-*/11-CONTEXT.md deferred/generated refs] |
| Generic `GateResult.reason` strings | Typed `RecoveryDecision` embedded into failures | Phase 11 target [CITED: .planning/phases/11-*/11-CONTEXT.md D-16] | Backward compatibility keeps `reason/resumeHint/evidence`; new consumers use `recoveryDecision`. |
| gsd-pi taxonomy labels (`provider`, `runtime-unknown`, etc.) | Project-specific eight safety-boundary classes | Locked in Phase 11 discussion [CITED: .planning/phases/11-*/11-CONTEXT.md D-09; VERIFIED: D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/recovery-classification.ts] | Do not copy gsd-pi class names verbatim. |

**Deprecated/outdated:**
- `phase-11-worktree-safety-seam` placeholder in `src/orchestrator/gates.ts` must be replaced by the real module. [VERIFIED: src/orchestrator/gates.ts]
- Generated-agent sentinel behavior in `generated/agents/gsd-code-fixer.md` is useful safety language but not the module API contract. [CITED: .planning/phases/11-*/11-CONTEXT.md canonical refs; VERIFIED: generated/agents/gsd-code-fixer.md]

## Existing Code Seams to Plan Around

| File | Current State | Phase 11 Planning Implication |
|---|---|---|
| `src/orchestrator/gates.ts` | Contains placeholder `prepareUnitRoot` and gate order. [VERIFIED] | Replace local function with import from `src/worktree-safety/`; adapt failure to `GateResult`. |
| `src/orchestrator/types.ts` | `GateResult` failure has `reason`, `retryable`, `resumeHint`, `evidence`; no `recoveryDecision`. [VERIFIED] | Extend failure branch and likely `OrchestrationEvent` with `recoveryDecision`/`exitReason`. |
| `src/orchestrator/state-machine.ts` | Retry behavior is based on `gate.retryable` and `node_repair_budget`; pause uses `gate.reason`. [VERIFIED] | Convert `RecoveryAction.retry` to retryable; decide whether `self-heal` happens in this phase or records decision only. |
| `src/orchestrator/journal.ts` | Redacts by allowed keys only: currently no `recoveryDecision` or `exitReason`. [VERIFIED] | Update whitelist safely with bounded structured recovery fields. |
| `src/orchestrator/reconciliation.ts` | Converts `ReconciliationFailedError` to `GateResult` using reason code. [VERIFIED] | Call `classifyFailure` here or in gate failure handler so blockers map by reasonCode. |
| `src/state-reconciliation/types.ts` | Exposes `ReconciliationReasonCode`, blockers, evidence, and `written[]`. [VERIFIED] | Use as classifier input; table-test every reason code. |
| `src/index.ts` | Re-exports orchestrator but not new modules. [VERIFIED] | Export `recovery` and `worktree-safety` if intended as stable package API. |

## Known v1.0 / Prior-Triage Failure Families to Cover

| Family | Evidence | Expected Class | Expected Action |
|---|---|---|---|
| Provider/network transient failure | Checkpoints reference network timeouts as retry-then-checkpoint. [CITED: generated/workflows/references/checkpoints.md] | `transient-external-failure` | `retry` |
| Missing auth / user credentials | Checkpoints classify auth gate as requiring human input, not failure. [CITED: generated/workflows/references/checkpoints.md] | `user-input-required` | `pause-with-remediation` |
| Tool/schema/dispatch mismatch | Phase 12 seam and ADR-015 identify prompt/tool/schema mismatch as runtime invariant. [CITED: gsd-pi ADR-015; .planning/ROADMAP.md Phase 12] | `dispatch-contract-invalid` | `stop` |
| Artifact gate failure | `runPostDispatchGate` fails when PLAN/SUMMARY/VERIFICATION/closeout evidence is missing. [VERIFIED: src/orchestrator/gates.ts] | `artifact-gate-failed` | `pause-with-remediation` |
| State reconciliation drift | Phase 10 reason codes and `ReconciliationFailedError` handoff. [VERIFIED: src/state-reconciliation/types.ts; src/state-reconciliation/errors.ts] | Table-driven by reasonCode | Table-driven by class |
| Partial writes | Phase 10 `partial-write` preserves written paths. [VERIFIED: tests/state-reconciliation.test.ts] | `internal-invariant-violation` recommended | `stop` locked |
| Invalid worktree / branch / `.git` | Worktree safety success criteria. [CITED: .planning/ROADMAP.md Phase 11; gsd-pi ADR-016] | `worktree-invalid` | `stop` |
| Internal impossible state | No fallback bucket; unmodeled inputs become explicit stop class. [CITED: .planning/phases/11-*/11-CONTEXT.md D-12] | `internal-invariant-violation` | `stop` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Use Git CLI rather than parsing `.git` internals. | Standard Stack / Don't Hand-Roll | Low; implementation may need one extra Git probe abstraction. |
| A2 | `execute` is the initial primary source-writing Unit, with predicate/metadata allowing future source writers. | Architecture Patterns / Existing Seams | Medium; if more Unit types write source now, planner must add them to the predicate tests. |
| A3 | Recommended reconciliation reason-code mappings except locked `partial-write → stop`. | Code Examples / Known Families | Medium; user may prefer different state-drift boundaries, but all remain within locked eight classes. |
| A4 | Self-heal lease reclamation can be represented by structured decision/evidence in this phase without full worktree lifecycle management. | Architecture Patterns | Medium; if implementation discovers lifecycle needs, defer broad lifecycle to v2.1 per context. |

## Open Questions (RESOLVED)

1. **Which Unit types are source-writing beyond `execute`?**
   - Resolution: `execute` is source-writing now, and the source-writing predicate must also support future automated source-fix/review-repair style Units when they become native Units. Read-only discuss/research/plan-style Units remain non-isolated unless they become source writers. [CITED: .planning/phases/11-*/11-CONTEXT.md D-01]
   - Planning consequence: implement `isSourceWritingUnit(unit)` with an explicit current UnitType table plus a metadata/flag escape hatch for future automated source-fix/review-repair style Units; table-test both current `execute` and the future-style source-writing marker.
2. **Where should lease files live?**
   - Resolution: durable lease evidence for recovery is the orchestrator journal. Any local lease file/schema lives under `.planning` as an implementation detail for coordination only, not as the recovery source of truth. [CITED: .planning/phases/11-*/11-CONTEXT.md D-08 and Claude's Discretion]
   - Planning consequence: lease acquire, release, and stale-reclaim helpers must emit journal-compatible structured events/evidence. Tests should prove recovery can consume journal-recorded lease facts; local lease files may be used for coordination but cannot be the only durable evidence.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | Runtime/tests | ✓ | `v25.7.0` | Must satisfy package `>=22.0.0`; local does. [VERIFIED: local probe; package.json] |
| npm | Tests/build scripts | ✓ | `11.10.1` | — [VERIFIED: local probe] |
| Git CLI | Worktree/branch probes | ✓ | `2.53.0.windows.2` | Stub deps in unit tests; production requires Git. [VERIFIED: local probe] |
| Vitest | Test framework | ✓ | installed via project dependency; registry latest `4.1.8` | Existing `npm test`. [VERIFIED: package.json; npm registry] |

**Missing dependencies with no fallback:** None found. [VERIFIED: local probes]  
**Missing dependencies with fallback:** None found. [VERIFIED: local probes]

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest, project range `^4.0.0`. [VERIFIED: package.json] |
| Config file | `vitest.config.ts`. [VERIFIED] |
| Quick run command | `npm test -- tests/recovery.test.ts tests/worktree-safety.test.ts tests/orchestrator.test.ts --runInBand` [ASSUMED: Vitest CLI accepts file filters; verify during planning] |
| Full suite command | `npm run check` [VERIFIED: package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| WTREE-01 | Valid root vs typed `worktree-invalid` result; no thrown boundary errors. | unit | `npm test -- tests/worktree-safety.test.ts` | ❌ Wave 0 |
| WTREE-02 | `.git`, branch, lease, `GSD_PROJECT_ROOT`, and `worktrees=false` behavior. | unit/table | `npm test -- tests/worktree-safety.test.ts` | ❌ Wave 0 |
| RECOV-01 | Exactly eight classes, no fallback class, all inputs produce explicit class. | unit/table | `npm test -- tests/recovery.test.ts` | ❌ Wave 0 |
| RECOV-02 | One action per class; telemetry/gate result uses same taxonomy. | unit/integration | `npm test -- tests/recovery.test.ts tests/orchestrator.test.ts` | partial: `tests/orchestrator.test.ts` exists |

### Sampling Rate
- **Per task commit:** targeted Vitest file(s) above. [ASSUMED]
- **Per wave merge:** `npm test` then `npm run typecheck`. [VERIFIED: package scripts]
- **Phase gate:** `npm run check` green. [VERIFIED: package scripts]

### Wave 0 Gaps
- [ ] `tests/recovery.test.ts` — covers RECOV-01/RECOV-02, all eight classes, all action mappings, Phase 10 reason-code table. [ASSUMED]
- [ ] `tests/worktree-safety.test.ts` — covers WTREE-01/WTREE-02, source-writing predicate, `.git`, branch, lease, env mismatch, `worktrees=false`. [ASSUMED]
- [ ] Add orchestrator integration cases to `tests/orchestrator.test.ts` for `recoveryDecision`, event `exitReason`, and journal redaction. [VERIFIED: tests/orchestrator.test.ts exists]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | No authentication feature in scope. [VERIFIED: phase scope] |
| V3 Session Management | no | No web/session feature in scope. [VERIFIED: phase scope] |
| V4 Access Control | yes | Enforce source-writing Unit root/lease ownership before dispatch. [CITED: .planning/phases/11-*/11-CONTEXT.md D-01/D-05] |
| V5 Input Validation | yes | Validate unit type/id, paths, branch names, env root, and reason-code enums using typed tables. [VERIFIED: src/orchestrator/types.ts; src/state-reconciliation/types.ts] |
| V6 Cryptography | no | No cryptographic feature in scope. [VERIFIED: phase scope] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Path confusion / writing in wrong root | Tampering | Resolve paths, compare expected project/unit root, fail closed on mismatch. [CITED: .planning/phases/11-*/11-CONTEXT.md D-03] |
| Lease spoofing or stale ownership | Elevation/Tampering | Bind lease to unit/session/phase/branch/process/host evidence; self-heal only with proof holder inactive. [CITED: .planning/phases/11-*/11-CONTEXT.md D-05/D-06] |
| Secret leakage through recovery evidence | Information disclosure | Journal bounded fields only; omit tokens, env, raw args, full user text. [CITED: .planning/phases/11-*/11-CONTEXT.md D-18; VERIFIED: src/orchestrator/journal.ts] |
| Branch mismatch auto-repair | Tampering | Do not checkout/switch branches automatically; stop with remediation. [CITED: .planning/phases/11-*/11-CONTEXT.md D-07] |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/11-worktree-safety-recovery-classification/11-CONTEXT.md` — locked Phase 11 decisions and scope. [VERIFIED]
- `.planning/ROADMAP.md` — Phase 11 requirements and success criteria. [VERIFIED]
- `src/orchestrator/gates.ts`, `src/orchestrator/types.ts`, `src/orchestrator/state-machine.ts`, `src/orchestrator/journal.ts` — current integration seams. [VERIFIED]
- `src/state-reconciliation/types.ts`, `src/state-reconciliation/errors.ts`, `src/state-reconciliation/catalog.ts` — Phase 10 handoff model. [VERIFIED]
- `D:/Workstation/gsd-pi-fork/docs/dev/ADR-015-runtime-invariant-modules.md`, `ADR-016-worktree-safety-fail-closed.md` — gsd-pi reference architecture. [VERIFIED: local fork]
- `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts`, `recovery-classification.ts` — reference implementation patterns, not copied taxonomy. [VERIFIED: local fork]

### Secondary (MEDIUM confidence)
- `generated/workflows/references/planning-config.md` — settings names and current upstream config docs. [VERIFIED]
- `generated/agents/gsd-code-fixer.md` — existing generated worktree/recovery sentinel behavior. [VERIFIED]
- Local Git help/probes: `git worktree -h`, `git worktree list --porcelain`, `git branch --show-current`. [VERIFIED: local environment]

### Tertiary (LOW confidence)
- Assumptions about exact source-writing Unit predicate and lease file location; planner should lock these in Wave 0 tests. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing project dependencies and local tool versions verified; no new package installs. [VERIFIED]
- Architecture: HIGH — phase context, prior phase seams, and local source code all align. [VERIFIED]
- Pitfalls: HIGH for locked pitfalls, MEDIUM for predicate/lease details because exact shape is discretionary. [CITED: .planning/phases/11-*/11-CONTEXT.md]

**Research date:** 2026-06-02  
**Valid until:** 2026-07-02 for project-internal seams; re-check npm/Git versions if dependency versions change.
