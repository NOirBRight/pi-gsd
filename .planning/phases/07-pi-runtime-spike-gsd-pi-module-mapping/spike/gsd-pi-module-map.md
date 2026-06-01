# gsd-pi Module Map → v2.0 Deep Modules

**Phase:** 7
**Source:** `D:\Workstation\gsd-pi-fork` (v1.0.2, commit `fc39cdcdd`, 2026-05-25)
**Date:** 2026-05-31
**Decision:** All five modules mirror in v2.0 (per D-09)

## Reference Source

All file paths, line counts, and interface signatures verified against the gsd-pi fork at:

```
D:\Workstation\gsd-pi-fork  (v1.0.2, commit fc39cdcdd)
```

Canonical ADR anchors:

| ADR | Topic | File |
|-----|-------|------|
| ADR-009 | Orchestration kernel refactor (6-plane UOK model) | `docs/dev/ADR-009-orchestration-kernel-refactor.md` |
| ADR-014 | Auto Orchestration deep module design | `docs/dev/ADR-014-auto-orchestration-deep-module.md` |
| ADR-015 | Runtime invariant modules + `advance()` pipeline ordering | `docs/dev/ADR-015-runtime-invariant-modules.md` |
| ADR-016 | Worktree safety fail-closed | `docs/dev/ADR-016-worktree-safety-fail-closed.md` |
| ADR-017 | State reconciliation drift-driven | `docs/dev/ADR-017-state-reconciliation-drift-driven.md` |

**Important:** The original ROADMAP.md referenced `extensions/gsd/{auto, state-reconciliation, safety}/` — this path does NOT exist in v1.0.2. Actual implementation files are at `src/resources/extensions/gsd/` (per D-08).

## Module Map Table

| v2.0 Module | Phase | gsd-pi ADR Surface | gsd-pi File References | Mirror | Interface Contract |
|-------------|-------|--------------------|------------------------|--------|-------------------|
| **Auto Orchestration** | 9 | ADR-009 §2-4 (UOK planes), ADR-014 §3-5 (deep module), ADR-015 §2 (advance() pipeline) | `packages/daemon/src/orchestrator.ts` (469 lines), `src/resources/extensions/gsd/auto/orchestrator.ts` | Mirror | `start(sessionContext)`, `advance()`, `resume()`, `stop(reason)`, `getStatus()` |
| **State Reconciliation** | 10 | ADR-017 §3-5 (drift catalog, detection loop) | `src/resources/extensions/gsd/state-reconciliation.ts` (25 lines), `src/resources/extensions/gsd/state-reconciliation/` dir | Mirror | `reconcileBeforeDispatch(basePath, deps)` → `{ ok, stateSnapshot, repaired, blockers }` |
| **Worktree Safety** | 11 | ADR-016 §2-4 (validation checks, fail-closed) | `src/resources/extensions/gsd/worktree-safety.ts` (329 lines) | Mirror | `prepareUnitRoot(unitType, unitId)` → valid root or `worktree-invalid` |
| **Recovery Classification** | 11 | ADR-015 §3-4 (failure taxonomy) | `src/resources/extensions/gsd/recovery-classification.ts` (139 lines) | Mirror | `classifyFailure(input)` → `{ failureKind, action, reason }` |
| **Tool Contract** | 12 | ADR-015 §5 (pre-dispatch validation) | `src/resources/extensions/gsd/tool-contract.ts` (82 lines), `src/resources/extensions/gsd/auto/contracts.ts` | Mirror | `compileUnitToolContract(unitType)` → `{ ok, contract }` |

## Per-Module Deep Dives

### Auto Orchestration (Phase 9)

**gsd-pi ADR surface:** ADR-009 defines the 6-plane Unit Orchestration Kernel (UOK) model: Plan, Execute, Verify, Closeout, Recovery, Journal. ADR-014 refines this into a deep module with explicit invariants.

**Verified interface contract:**
```
start(sessionContext)    → { ok, unitId }
advance()                → { ok, nextUnit } | { stop, reason }
resume(unitId, message)   → { ok }
stop(reason)              → { ok }
getStatus()               → { currentUnit, queue, journalEntry }
```

**ADR-014 invariants (must be enforced in v2.0):**
- Exactly one active unit at any time
- Idempotent advance — calling advance() on an already-advanced session is a no-op
- Lock ownership validation before any mutation
- No skipping verification transitions
- Every state transition journaled

**advance() pipeline ordering (from ADR-015):**
State Reconciliation → Dispatch Decision → Tool Contract → Worktree Safety → Runtime Persistence

**Verified implementation files:**
- `packages/daemon/src/orchestrator.ts` (469 lines) — primary orchestrator, runs the `advance()` loop
- `src/resources/extensions/gsd/auto/orchestrator.ts` — auto-mode orchestrator entry point with recovery hooks
- `src/resources/extensions/gsd/auto-dispatch.ts` (1,827 lines) — unit dispatch logic
- `src/resources/extensions/gsd/auto-start.ts` (1,561 lines) — session initialization
- `src/resources/extensions/gsd/auto-post-unit.ts` (2,375 lines) — post-execution checks and closeout
- `src/resources/extensions/gsd/auto-verification.ts` (955 lines) — verification gate

### State Reconciliation (Phase 10)

**gsd-pi ADR surface:** ADR-017 defines drift-driven state reconciliation with a 2-pass detection-repair loop.

**Verified interface contract:**
```
reconcileBeforeDispatch(basePath, deps) → {
  ok: boolean,
  stateSnapshot: ProjectState,
  repaired: DriftRecord[],
  blockers: string[]
}
```

**Drift catalog (7 typed DriftRecord variants):**
- `stale-sketch-flag` — sketch artifacts flagged but resolved
- `unmerged-merge-state` — merge markers left in planning docs
- `stale-worker` — worker processes running past TTL
- `unregistered-milestone` — milestone completed but not in registry
- `roadmap-divergence` — ROADMAP.md out of sync with disk
- `missing-completion-timestamp` — phase marked done but no timestamp
- `cascading` — repair of one drift caused another (2nd pass re-checks)

**Implementation pattern:** 2-pass loop (MAX_PASSES=2). Pass 1: detect all drifts, apply repairs. Pass 2: re-detect; if new drifts appeared (cascading), flag as `blockers` instead of re-repairing. Idempotent — running reconciliation twice produces the same result.

**Verified implementation files:**
- `src/resources/extensions/gsd/state-reconciliation.ts` (25 lines) — entry point + detection loop
- `src/resources/extensions/gsd/state-reconciliation/` directory — per-drift repair modules
- `src/resources/extensions/gsd/state.ts` (1,722 lines) — state management core

### Worktree Safety (Phase 11)

**gsd-pi ADR surface:** ADR-016 defines fail-closed worktree validation — no silent degradation to project root.

**Verified interface contract:**
```
prepareUnitRoot(unitType, unitId) → {
  ok: true, root: string
} | {
  ok: false,
  decision: {
    failureKind: "worktree-invalid",
    action: "stop" | "pause-with-remediation",
    reason: string
  }
}
```

**Validation checks (verified from ADR-016 + source):**
- `.git` directory exists at root
- Branch name matches expected (from unit context)
- Git worktree lease ownership is current (no stale lock files)
- `GSD_PROJECT_ROOT` environment variable matches resolved root

**Verified implementation files:**
- `src/resources/extensions/gsd/worktree-safety.ts` (329 lines) — validation + root preparation
- `src/resources/extensions/gsd/worktree.ts` (235 lines) — worktree management
- `src/resources/extensions/gsd/worktree-lifecycle.ts` (1,989 lines) — full lifecycle
- `src/resources/extensions/gsd/worktree-root.ts` (182 lines) — root resolution

### Recovery Classification (Phase 11)

**gsd-pi ADR surface:** ADR-015 defines typed failure taxonomy — no `other` bucket.

**Verified interface contract:**
```
classifyFailure(input) → {
  failureKind: RecoveryFailureKind,
  action: "retry" | "pause-with-remediation" | "self-heal" | "stop",
  reason: string,
  exitReason?: string,
  remediation?: RemediationSteps
}
```

**8 explicit RecoveryFailureKind values (verified from source):**
| Kind | Action | Description |
|------|--------|-------------|
| `tool-schema` | retry | Tool call schema mismatch |
| `deterministic-policy` | stop | Policy violation (intentional) |
| `stale-worker` | self-heal | Worker TTL expired |
| `worktree-invalid` | stop | Worktree root validation failed |
| `provider-quota` | pause-with-remediation | API rate limit or quota |
| `network` | retry | Transient network error |
| `verification-drift` | stop | Verification assertion failed |
| `reconciliation-drift` | stop | State reconciliation failed |

**Verified implementation files:**
- `src/resources/extensions/gsd/recovery-classification.ts` (139 lines) — classifier
- `src/resources/extensions/gsd/auto-recovery.ts` (1,222 lines) — auto-mode recovery actions
- `src/resources/extensions/gsd/closeout-recovery.ts` (290 lines) — closeout recovery

### Tool Contract (Phase 12)

**gsd-pi ADR surface:** ADR-015 §5 — pre-dispatch validation running BEFORE model turn.

**Verified interface contract:**
```
compileUnitToolContract(unitType) → {
  ok: true,
  contract: {
    requiredPrompts: string[],      // must be present in context
    allowedTools: string[],         // tools the LLM may call
    schemaEnums: Record<string, string[]>,    // allowed enum values
    validationRules: ValidationRule[],
    closeoutTools: string[]         // required for closeout
  }
}
```

**Key invariant:** Tool Contract validation runs BEFORE the model turn launches, not after. Planner tools reject invalid inputs upfront rather than delegating to downstream guards.

**Verified implementation files:**
- `src/resources/extensions/gsd/tool-contract.ts` (82 lines) — contract compilation
- `src/resources/extensions/gsd/auto/contracts.ts` — per-unit-type contract definitions
- `src/resources/extensions/gsd/dispatch-guard.ts` (211 lines) — dispatch gate

## advance() Pipeline Ordering

From ADR-015, the canonical, enforced sequence the orchestrator calls during each `advance()` cycle:

```
State Reconciliation → Dispatch Decision → Tool Contract → Worktree Safety → Runtime Persistence
```

Each step gates the next. If a step returns blockers, the pipeline stops and hands off to Recovery Classification.

## Deferred / N/A Decisions

| gsd-pi Surface | Decision | Rationale |
|----------------|----------|-----------|
| Parallel slice orchestrator | **Defer → v2.1** | v2.0 scope is sequential orchestration; parallel is gsd-pi's `slice-parallel-orchestrator.ts` (1,077 lines) — significant additional complexity |
| Cloud MCP Gateway (daemon) | **N/A** | gsd-pi's daemon model (`packages/daemon/`) is a fundamentally different distribution model; out of scope for pi-gsd-redux (Pi extension, not standalone daemon) |
| Discord bot / web dashboard | **N/A** | gsd-pi's studio/web surfaces — not applicable to Pi extension |
| Worktree lifecycle + state projection | **Defer → v2.1** | gsd-pi's `worktree-lifecycle.ts` (1,989 lines) is substantially larger than v2.0 needs; Phase 11 covers only the safety module |
| gsd-pi prompts/agents | **N/A** | We consume gsd-core's prompts; gsd-pi's prompts are their fork per v2.0 Out of Scope |

## Module Organization vs v2.0 Target

| gsd-pi Source | pi-gsd-redux v2.0 Target | Notes |
|---------------|--------------------------|-------|
| `packages/daemon/src/orchestrator.ts` | `src/orchestrator/` | Phase 9 — core loop |
| `src/resources/extensions/gsd/auto/` | `src/orchestrator/auto/` | Phase 9 — auto-mode dispatch |
| `src/resources/extensions/gsd/state-reconciliation.ts` | `src/state-reconciliation/` | Phase 10 |
| `src/resources/extensions/gsd/worktree-safety.ts` | `src/worktree-safety/` | Phase 11 |
| `src/resources/extensions/gsd/recovery-classification.ts` | `src/recovery/` | Phase 11 |
| `src/resources/extensions/gsd/tool-contract.ts` | `src/tool-contract/` | Phase 12 |

## Architecture Patterns to Follow

### 1. Deep Module with Small Interface
gsd-pi modules expose narrow public APIs (one primary export function) while hiding complexity internally. Example: `state-reconciliation.ts` exports only `reconcileBeforeDispatch()` despite the 7-drift internal catalog.

### 2. Typed Discriminated Unions
All gsd-pi results use `{ ok: true, value } | { ok: false, error: TypedError }` patterns. v2.0 modules MUST follow this — no throwing from orchestration code, no `catch (e) { /* generic */ }` in the dispatch loop.

### 3. Idempotent Repair with Detection Loop
State Reconciliation uses an idempotent 2-pass loop. Repairs are pure functions: same input → same output. v2.0 `reconcileBeforeDispatch()` must be callable twice with no side-effect duplication.

### 4. Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | gsd-pi Evidence |
|-------------|-------------|-----------------|
| **Mixing orchestration logic with prompt content** | Prompt content is consumed from gsd-core; orchestration is our code. v1.0's `AUTO_MODE_CHECKLIST` is the canonical example of this anti-pattern | ADR-014 §6: "The deep module owns the loop; prompts describe the work, not the process" |
| **Silent degradation** | Worktree Safety is fail-closed for a reason — silently falling back to project root corrupts the user's working tree | ADR-016 §2: "No silent degradation to project root" |
| **`catch (e) { /* log */ }` without typed recovery** | Generic error handling prevents the orchestrator from making intentional decisions | ADR-015 §3: "All failures flow through typed Recovery Classification — no other bucket" |
| **Skipping pre-dispatch validation** | v1.0's `gsd_query` dispatched without contract validation; Planner would receive invalid inputs mid-execution | ADR-015 §5: "Reject invalid inputs upfront, not downstream" |
