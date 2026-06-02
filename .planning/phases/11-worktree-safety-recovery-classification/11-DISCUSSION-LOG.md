# Phase 11: Worktree Safety + Recovery Classification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 11-Worktree Safety + Recovery Classification
**Areas discussed:** Root validation contract, Lease ownership rules, Eight recovery classes, Telemetry handoff

---

## Root validation contract

### Which Units require fail-closed validation?

| Option | Description | Selected |
|--------|-------------|----------|
| Source writers | Validate Units that can write source/project files; read-only planning/research can use project root. | ✓ |
| All dispatched Units | Validate every Unit including discuss/research/plan. | |
| Execute only | Validate only execute Units. | |

**User's choice:** Source-writing Units.

### What when `workflow.worktrees=false`?

| Option | Description | Selected |
|--------|-------------|----------|
| Validate project root | Validate `.git`, branch, and `GSD_PROJECT_ROOT`; skip isolated lease requirement only. | ✓ |
| Direct pass | Preserve Phase 9 seam behavior. | |
| Direct stop | Require isolated worktree for all source-writing Units. | |

**User's choice:** Project root must still be validated.

### Evidence for `GSD_PROJECT_ROOT` mismatch

| Option | Description | Selected |
|--------|-------------|----------|
| Full path evidence | Include expectedProjectRoot, actualCwd, resolvedUnitRoot, unitId, unitType, branch. | ✓ |
| Minimal reason code | Only reasonCode/message. | |
| Paths plus snapshot | Include settings/journal summary too. | |

**User's choice:** Full path evidence.

### Return shape

| Option | Description | Selected |
|--------|-------------|----------|
| Result object | Return `{ ok, root?, decision? }`. | ✓ |
| Typed error | Throw WorktreeInvalidError. | |
| GateResult | Couple worktree module directly to orchestrator gate type. | |

**User's choice:** Result object.

---

## Lease ownership rules

### Lease identity

| Option | Description | Selected |
|--------|-------------|----------|
| unitId + session | Bind to unitId, orchestration sessionId, phase, branch, pid/host. | ✓ |
| Branch only | Simpler but weak for concurrent Units. | |
| Agent process | Strong local detection but fragile across restart. | |

**User's choice:** `unitId + session`.

### Stale lease handling

| Option | Description | Selected |
|--------|-------------|----------|
| Self-heal reclaim | Reclaim only when holder proven inactive and root/branch match; otherwise pause. | ✓ |
| Always pause | Conservative human remediation. | |
| Direct overwrite | New Unit takes over immediately. | |

**User's choice:** Self-heal reclaim with proof.

### Branch mismatch

| Option | Description | Selected |
|--------|-------------|----------|
| Stop/remediation | Treat as safety boundary failure; do not auto-checkout. | ✓ |
| Auto checkout expected | More automated but risky. | |
| Retry | Treat as transient. | |

**User's choice:** Stop/remediation.

### Lease evidence location

| Option | Description | Selected |
|--------|-------------|----------|
| Orchestrator journal | Record acquisition/release/stale-reclaim in structured journal events. | ✓ |
| Worktree-local file | Scan roots for lease files. | |
| Both | Strong diagnostics with consistency cost. | |

**User's choice:** Orchestrator journal.

---

## Eight recovery classes

### Taxonomy basis

| Option | Description | Selected |
|--------|-------------|----------|
| Safety boundary first | Eight explicit classes around transient failures, state drift, worktree, contracts, artifacts, user input, invariants. | ✓ |
| Module source | Name classes by subsystem source. | |
| Action first | Name classes around retry/pause/self-heal/stop. | |

**User's choice:** Safety-boundary-first taxonomy.

### Phase 10 mapping

| Option | Description | Selected |
|--------|-------------|----------|
| reasonCode table | Explicit table-driven mapping from each Phase 10 reasonCode. | ✓ |
| All pause | Conservative but wastes repairPlan. | |
| suggestedNextAction | Lower coupling but less precise. | |

**User's choice:** Explicit `reasonCode` mapping.

### partial-write

| Option | Description | Selected |
|--------|-------------|----------|
| partial-write → stop | Preserve written/evidence; no automatic rollback/continuation. | ✓ |
| partial-write → pause | Human remediation while session remains paused. | |
| partial-write → self-heal | Try automatic rollback/finish. | |

**User's choice:** `partial-write` maps to `stop`.

### Unknown fallback

| Option | Description | Selected |
|--------|-------------|----------|
| No other | Unknown/unmodeled failures become explicit stop-class. | ✓ |
| Temporary unknown | Easier initial implementation but violates success criteria. | |
| Return null | Let callers decide. | |

**User's choice:** No `other`, `unknown`, or `null` fallback.

---

## Telemetry handoff

### Gate failure integration

| Option | Description | Selected |
|--------|-------------|----------|
| Embed in GateResult | Add `recoveryDecision` to failure branch while retaining reason/resumeHint/evidence. | ✓ |
| Replace GateResult | Make gates return RecoveryDecision directly. | |
| Journal only | Keep typed decision only in journal. | |

**User's choice:** Embed in `GateResult`.

### Telemetry exit reason

| Option | Description | Selected |
|--------|-------------|----------|
| Recovery class | `exitReason` equals one of the eight classes. | ✓ |
| Action | `exitReason` is retry/pause/self-heal/stop. | |
| Class + action | Record two fields. | |

**User's choice:** Directly use recovery class.

### Journal/status detail

| Option | Description | Selected |
|--------|-------------|----------|
| Structured limited evidence | Record class/action/reasonCode/unitId/paths/branch/attempt/written. | ✓ |
| Full error object | Strong diagnostics but may leak or bloat. | |
| Summary only | Safest but insufficient for recovery. | |

**User's choice:** Structured, limited evidence.

### Configurable mapping

| Option | Description | Selected |
|--------|-------------|----------|
| No override | Fixed class→action mapping; config cannot change semantics. | ✓ |
| Advanced override | User can change mapping. | |
| Retry only configurable | Retry count/backoff tunable, action fixed. | |

**User's choice:** Do not allow configurable class→action overrides.

---

## Claude's Discretion

- Exact TypeScript type names and module file structure.
- Exact lease schema/file details, while journal remains the recovery-readable evidence source.
- Exact table-driven fixture layout.
- Exact remediation message wording.

## Deferred Ideas

- Full worktree lifecycle projection and long-lived worktree management remain deferred to v2.1.
- Tool Contract Bridge remains Phase 12.
- Settings Bridge remains Phase 12.
- Parallel slice orchestration remains deferred to v2.1.
