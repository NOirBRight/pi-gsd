# Phase 09: Auto Orchestration Native Module - Research

**Researched:** 2026-06-01
**Domain:** Native TypeScript runtime orchestration for Pi/GSD auto-chain execution
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Unit Boundary
- **D-01:** Model orchestration Units at **workflow-step granularity**. Plan, Execute, Verify, Closeout, and settings-gated workflow steps are Units; individual model/tool turns are not Units in Phase 9.
- **D-02:** Unit inclusion must be driven by `/gsd-settings` / `.planning/config.json` workflow settings, not hardcoded assumptions. Downstream agents must inspect the settings workflow and config reference thoroughly, including toggles beyond phase-only settings.
- **D-03:** Optional gates such as UI phase, AI phase, code review, UI review, skip-discuss, verifier, plan checker, worktrees, and auto-advance should follow the configured `workflow.*` settings. If settings and phase signals are ambiguous or conflict, the orchestrator should ask the user rather than silently choosing.
- **D-04:** Exact precedence between settings, roadmap phase indicators, and user confirmation is **not fully locked**. Planning must research existing upstream/autonomous behavior and propose a precise precedence rule consistent with current `/gsd-settings` semantics.
- **D-05:** Unit failure should first use existing settings-driven retry/repair controls where applicable, especially `workflow.node_repair` and `workflow.node_repair_budget`. When retry/repair is exhausted or behavior is ambiguous, pause with a typed reason and resume hint. Do not invent the full Phase 11 recovery taxonomy in Phase 9.

### State Journal and Resume
- **D-06:** Detailed lifecycle state should live in a sibling machine-readable orchestration state/journal artifact, not as full transition history inside `STATE.md`.
- **D-07:** Resume should use **current snapshot + replayable history**: restore from the latest unfinished Unit snapshot, while retaining event history for audit/debug replay.
- **D-08:** Record gate-level lifecycle events: orchestration start/stop, Unit start/end, settings resolved, gate pass/fail, retry/repair attempt, pause, resume, and stop. Do not log every tool call in Phase 9.
- **D-09:** `STATE.md` should remain a human-readable current-position digest and resume pointer if upstream handler semantics permit. Planner must verify upstream `STATE.md` / `resume-project` consumption and write through `gsd-tools query state.*` handlers, never by direct edit.
- **D-10:** The rationale for D-09 is upstream-aligned: `STATE.md` is documented as short-term project memory/current position and should stay under 100 lines. A verbose transition log belongs in a sibling journal.

### Native vs CLI Boundary
- **D-11:** The native TypeScript orchestrator owns the loop, dispatch decisions, Unit state machine, and code gates. `gsd-tools.cjs` remains acceptable for registered `.planning/` mutations only.
- **D-12:** Dispatch Plan/Execute/Verify/Closeout through Pi subagent/agent APIs using official GSD agents/prompts as inputs. Do not rely on slash-prompt self-orchestration for the auto loop.
- **D-13:** Remove `AUTO_MODE_CHECKLIST` and replace it with code-enforced gates that validate expected artifacts and statuses after each Unit.
- **D-14:** Phase 9 defines a thin `reconcileBeforeDispatch` seam/stub and minimal pre-dispatch checks only. Full drift catalog, idempotent repair, and reconciliation failure handling belong to Phase 10.

### Observability
- **D-15:** The orchestrator journal records lifecycle and gate events: orchestration start/stop, Unit start/end, settings resolved, gate pass/fail, retry scheduled, pause/resume/stop.
- **D-16:** Enable `GSD_AUDIT=1` only in the scoped environment of native `--auto` / `--chain` runs, so upstream `DispatchLogger` captures hub-level events without changing normal workflow defaults.
- **D-17:** Logs are redacted by default. Do not record full user text, secrets, tokens, or unbounded arguments. Capture IDs, paths, event kinds, statuses, attempts, and short reasons. Deeper argument capture requires explicit opt-in.
- **D-18:** `getStatus()` must expose current Unit, queue/remaining Units, attempt, last event, and resume hint for CLI/extension display.

### Claude's Discretion
- Exact sibling journal filename and schema, as long as it supports current snapshot + replayable history.
- Exact `getStatus()` return shape, as long as it includes the fields in D-18.
- Exact code-gate implementation details and artifact validators, as long as gates replace prompt reminders and are covered by tests.
- Exact wording of pause/resume messages.

### Deferred Ideas (OUT OF SCOPE)

## Deferred Ideas

- Full drift catalog and idempotent repairs are deferred to Phase 10 State Reconciliation.
- Worktree root validation and fail-closed behavior are deferred to Phase 11 Worktree Safety.
- Full typed recovery taxonomy is deferred to Phase 11 Recovery Classification. Phase 9 only uses existing retry/repair settings and pauses with typed reason/resume hint.
- Full Tool Contract validation is deferred to Phase 12, though Phase 9 should expose a seam/gate order compatible with it.
- Parallel slice orchestration remains deferred to v2.1 per Phase 7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORCH-01 | pi-gsd-core owns the `--auto` and `--chain` execution loop in native TypeScript; `AUTO_MODE_CHECKLIST` becomes obsolete. | Native `src/orchestrator/` service should own Unit queue/state and call agent dispatch APIs, while transform removal is limited to `src/prompt-transform.ts` and tests. [CITED: .planning/REQUIREMENTS.md] [CITED: CLAUDE.md] |
| ORCH-02 | Auto Orchestrator dispatches Units explicitly and calls invariant gates in order: State Reconciliation → Dispatch decision → Tool Contract → Worktree Safety → Runtime persistence. | Phase 9 should implement the order as seams/stubs for future modules, with Phase 10/11/12 gates returning pass/deferred status rather than full implementations. [CITED: .planning/REQUIREMENTS.md] [CITED: .planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/gsd-pi-module-map.md] |
| ORCH-03 | Auto loop journals lifecycle transitions for resumability across Pi session boundaries, including paused/stopped/error states. | Use sibling JSON/JSONL artifact for current snapshot + replayable history and update `STATE.md` only as digest/resume pointer via `gsd-tools query state.*` if supported. [CITED: generated/workflows/templates/state.md] [VERIFIED: gsd-tools query state json/state get] |
| RUNTIME-03 | Remove `AUTO_MODE_CHECKLIST` prompt injection; native Auto Orchestration replaces its job. | Current source already has no-op injection but constants/comments remain; planner should require deletion and test update that generated prompts/workflows no longer contain `<pi_auto_mode_fidelity>`. [VERIFIED: src/prompt-transform.ts grep] [CITED: tests/prompt-transform.test.ts] |
</phase_requirements>

## Summary

Phase 9 should be planned as a native TypeScript application/runtime service, not as another prompt transform. The project architecture requires entry points to parse CLI/runtime inputs, services to orchestrate filesystem/subprocess/agent dispatch, pure transforms to remain side-effect-free, and resolvers/safety modules to encapsulate package/path discovery. [CITED: CLAUDE.md]

The most important planning constraint is settings fidelity: current upstream-generated workflows route `--auto`/`--chain` through config keys such as `workflow._auto_chain_active`, `workflow.auto_advance`, `workflow.research`, `workflow.plan_check`, `workflow.verifier`, `workflow.ui_phase`, `workflow.ui_review`, `workflow.code_review`, `workflow.node_repair`, and `workflow.node_repair_budget`. Unit inclusion must be derived from these settings and phase/artifact signals, with user questions only when ambiguity remains. [CITED: generated/workflows/references/planning-config.md] [CITED: generated/workflows/workflows/autonomous.md] [CITED: generated/workflows/workflows/discuss-phase/modes/chain.md]

**Primary recommendation:** Implement `src/orchestrator/` as a small state-machine module with explicit Unit queue construction, lifecycle journal persistence, artifact gates after each Unit, and seam interfaces for Phase 10/11/12 invariant modules; do not add dependencies. [CITED: .planning/phases/09-auto-orchestration-native-module/09-CONTEXT.md]

## Project Constraints (from CLAUDE.md)

- Do not hand-edit `generated/`; generated files are regenerated from upstream `node_modules/@opengsd/gsd-core/`. [CITED: CLAUDE.md]
- Keep four-layer architecture: entry (`cli.ts`, `extension.ts`, `index.ts`), application services, pure transforms, resolvers/safety. [CITED: CLAUDE.md]
- Local TypeScript imports require `.js` suffixes under NodeNext. [CITED: CLAUDE.md] [CITED: tsconfig.json]
- Pure transforms must not import or use `fs`, `path`, or `os`. [CITED: CLAUDE.md]
- Services should return structured `{ ok, messages }`-style results; CLI is responsible for stdout/stderr. [CITED: CLAUDE.md]
- Pi extension hooks must never throw; hook logic must be wrapped defensively. [CITED: CLAUDE.md]
- Use Vitest globals; do not import `describe`/`it` from `vitest`. [CITED: CLAUDE.md] [CITED: vitest.config.ts]
- Run targeted tests first, then `npm run check` for the authoritative gate. [CITED: CLAUDE.md]
- Do not introduce new dependencies unless existing tools are insufficient. [CITED: global AGENTS.md]
- TDD is preferred for behavior changes: start with failing tests, implement smallest change, then refactor. [CITED: global AGENTS.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `--auto` / `--chain` loop ownership | Application service (`src/orchestrator/`) | CLI / Pi extension entry | Loop/state decisions are business/runtime orchestration, while CLI/extension only parse and invoke. [CITED: CLAUDE.md] |
| Unit dispatch | Application service | Pi subagent resolver/integration | Dispatch is runtime orchestration; package availability belongs in resolver/integration layer. [CITED: src/pi-subagents.ts] |
| Settings resolution | Application service | `gsd-tools.cjs` config query fallback | Settings drive Unit queue; existing upstream handlers are acceptable for registered `.planning/` reads/writes in Phase 9. [CITED: 09-CONTEXT.md] |
| Lifecycle journal | Application service | Filesystem persistence adapter | Journal is machine-readable runtime state; `STATE.md` remains a human digest. [CITED: generated/workflows/templates/state.md] |
| `STATE.md` digest pointer | Upstream state handler boundary | Application service | Direct `STATE.md` edits are forbidden for workflow state mutations; use `gsd-tools query state.*` where available. [CITED: 09-CONTEXT.md] [VERIFIED: gsd-tools query state json/state get] |
| Artifact gates | Application service | Future Tool Contract / State Reconciliation / Worktree modules | Phase 9 gates should validate expected artifacts/statuses and expose seam ordering for later modules. [CITED: .planning/REQUIREMENTS.md] |
| Prompt checklist removal | Pure transform module | Generator tests | Removing behavioral injection belongs in `prompt-transform.ts` and transform/generation tests, not generated files. [CITED: src/prompt-transform.ts] [CITED: CLAUDE.md] |

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| TypeScript / NodeNext | TS configured in `tsconfig.json`; Node available v25.7.0 | Native orchestration module and typed service interfaces | Existing project stack is TypeScript ESM with NodeNext and strict mode. [CITED: tsconfig.json] [VERIFIED: `node --version`] |
| `@opengsd/gsd-core` | 1.2.0 pinned; npm latest 1.2.0 | Canonical GSD prompts/workflows/agents and `gsd-tools.cjs` handlers | Project consumes upstream content as canonical and already pins 1.2.0. [CITED: package.json] [VERIFIED: npm registry] |
| `pi-subagents` | git dependency in `package.json`; installed package version 0.27.0 | Pi subagent package resolution and eventual agent dispatch surface | Existing resolver validates the installed package; Phase 9 should reuse/extend this seam. [CITED: package.json] [VERIFIED: require.resolve pi-subagents/package.json] |
| Vitest | devDependency `^4.0.0`; npm latest observed 4.1.7 | Unit and integration tests | Existing project test framework and config use Vitest globals. [CITED: package.json] [CITED: vitest.config.ts] [VERIFIED: npm registry] |

### Supporting
| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| `resolveOfficialPackage()` | current source | Resolve `@opengsd/gsd-core` root and `gsdTools` path | Use for all official package paths; never hardcode `node_modules`. [CITED: src/official.ts] |
| `gsd-tools.cjs` | from `@opengsd/gsd-core@1.2.0` | Registered `.planning/` config/state mutations and queries | Use only for handler-backed planning state/config operations during Phase 9. [CITED: 09-CONTEXT.md] [VERIFIED: require.resolve @opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs] |
| `DispatchLogger` / `GSD_AUDIT=1` | upstream 1.2.0 seam | Hub-level dispatch tracing | Scope `GSD_AUDIT=1` to orchestrator-run invocations only. [CITED: .planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/upstream-1.2.0-impact.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `src/orchestrator/` Unit state machine | More prompt reminders / workflow edits | Repeats the known fragile LLM-compliance problem and violates RUNTIME-03. [CITED: .planning/REQUIREMENTS.md] |
| Sibling JSON/JSONL journal | Full transition history inside `STATE.md` | Conflicts with upstream `STATE.md` short-term-memory / under-100-lines guidance. [CITED: generated/workflows/templates/state.md] |
| `resolveOfficialPackage()` | Hardcoded `node_modules/@opengsd/...` path | Breaks linked/global/pnpm-style installs; existing resolver already validates paths. [CITED: src/official.ts] |
| Existing dependencies | New state-machine library | Unnecessary for a small deterministic Unit queue; project preference is no new dependencies without need. [CITED: global AGENTS.md] [ASSUMED] |

**Installation:** No new packages recommended for Phase 9. [CITED: package.json]

## Package Legitimacy Audit

No external package installation is recommended for Phase 9. Existing packages remain in `package.json`; planner should not add dependencies unless a later implementation task proves existing TypeScript/Vitest/Node primitives insufficient. [CITED: package.json] [CITED: global AGENTS.md]

## Architecture Patterns

### System Architecture Diagram

```text
Pi slash command / CLI / extension context
        |
        v
Entry parser detects --auto / --chain and session context
        |
        v
Orchestrator.start(sessionContext)
        |
        v
Resolve settings + phase/artifact state
        |
        v
Build Unit queue: Discuss? -> Plan -> UI/AI gates? -> Execute -> Code Review? -> Verify? -> UI Review? -> Closeout
        |
        v
advance() loop for one Unit at a time
        |
        +--> reconcileBeforeDispatch seam (Phase 10 stub/minimal check)
        +--> dispatch decision + ambiguity check
        +--> toolContract seam (Phase 12 stub)
        +--> worktreeSafety seam (Phase 11 stub/minimal check)
        +--> persist runtime snapshot + append journal event
        +--> dispatch Pi/GSD agent Unit
        +--> artifact/status gate validates outputs
        |
        v
pause / retry / continue / stop
        |
        v
Sibling journal + optional STATE.md resume pointer + getStatus() display
```

### Recommended Project Structure

```text
src/
├── orchestrator/
│   ├── index.ts              # public exports for start/advance/resume/stop/getStatus
│   ├── types.ts              # Unit, status, event, journal, dependency interfaces
│   ├── state-machine.ts      # pure-ish Unit transition logic, no direct CLI printing
│   ├── settings.ts           # config resolution/default normalization
│   ├── journal.ts            # sibling state/journal read/write adapter
│   ├── gates.ts              # artifact gates + Phase 10/11/12 seam interfaces
│   └── dispatch.ts           # Pi subagent / official prompt dispatch adapter seam
└── index.ts                  # export orchestrator API if stable public API

tests/
├── orchestrator.test.ts
├── orchestrator-journal.test.ts
├── orchestrator-settings.test.ts
└── e2e/orchestrator-chain.test.ts
```

### Pattern 1: Dependency-injected orchestrator service
**What:** Export a factory or functions that accept dependencies for config, dispatch, journal, clock, and file checks, while production adapters wrap `gsd-tools.cjs`/Pi integration. [CITED: CLAUDE.md]
**When to use:** Required for unit-testing state transitions without invoking real agents. [CITED: tests existing Vitest pattern]
**Example:**
```typescript
// Source: project service conventions in CLAUDE.md + src/doctor.ts
export interface OrchestratorDeps {
  readSettings(basePath: string): Promise<ResolvedWorkflowSettings>;
  dispatchUnit(unit: OrchestrationUnit): Promise<UnitDispatchResult>;
  appendEvent(event: OrchestrationEvent): Promise<void>;
  writeSnapshot(snapshot: OrchestrationSnapshot): Promise<void>;
}
```

### Pattern 2: Snapshot + append-only event journal
**What:** Maintain a latest current snapshot for quick resume plus replayable events for audit/debug. [CITED: 09-CONTEXT.md]
**When to use:** Every lifecycle transition in start/advance/resume/stop and every gate pass/fail/retry/pause. [CITED: 09-CONTEXT.md]
**Example:**
```json
{
  "version": 1,
  "snapshot": {
    "phase": "09",
    "status": "paused",
    "currentUnit": { "id": "09-plan", "type": "plan", "attempt": 1 },
    "remainingUnits": ["execute", "verify", "closeout"],
    "resumeHint": "Resolve plan-checker blocker, then call resume()."
  },
  "events": [
    { "ts": "2026-06-01T00:00:00.000Z", "type": "orchestration_started", "phase": "09" },
    { "ts": "2026-06-01T00:00:01.000Z", "type": "unit_started", "unitId": "09-plan" }
  ]
}
```

### Pattern 3: Artifact gates instead of prompt reminders
**What:** After each Unit returns, verify the expected artifact/status exists before advancing. [CITED: .planning/REQUIREMENTS.md]
**When to use:** Plan requires `*-PLAN.md`; execute requires `*-SUMMARY.md` per plan; verifier requires verification artifact or configured skip; closeout requires phase/milestone state updated. [CITED: generated/workflows/references/artifact-types.md]
**Example:**
```typescript
// Source: artifact taxonomy in generated/workflows/references/artifact-types.md
export type GateResult =
  | { ok: true; evidence: string[] }
  | { ok: false; reason: string; retryable: boolean; resumeHint: string };
```

### Anti-Patterns to Avoid
- **Prompt-driven self-orchestration:** Do not rely on `/gsd-plan-phase --auto` prompt text to remember later steps; native code owns the queue. [CITED: .planning/REQUIREMENTS.md]
- **Direct `STATE.md` mutation:** Use upstream handlers for `STATE.md` digest changes when possible; journal detailed transitions separately. [CITED: 09-CONTEXT.md] [VERIFIED: gsd-tools query state json/state get]
- **Generated workflow edits:** Do not edit `generated/workflows/*`; change source transforms/runtime code and regenerate only if needed. [CITED: CLAUDE.md]
- **Full future-module implementation in Phase 9:** Do not implement drift catalog, worktree fail-closed checks, or full tool-contract validation now; expose seams. [CITED: 09-CONTEXT.md]
- **Unbounded logs:** Do not write full prompts, user text, secrets, tokens, or unbounded args to the journal. [CITED: 09-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Official package path resolution | Custom `node_modules` path search | `resolveOfficialPackage()` | Existing resolver validates official package paths including `gsdTools`. [CITED: src/official.ts] |
| Planning config/state mutations | Ad hoc JSON/Markdown edits for existing handlers | `gsd-tools.cjs query config-*` / `state.*` where available | Upstream handlers encode active-workstream and state semantics. [CITED: generated/workflows/workflows/settings.md] [VERIFIED: gsd-tools query state json] |
| Unit dispatch observability for gsd-tools calls | Custom verbose argument logger | Scoped `GSD_AUDIT=1` plus redacted orchestrator journal | Upstream DispatchLogger is opt-in and redacts args by default. [CITED: 07 spike upstream-1.2.0-impact.md] |
| Prompt content behavior | Forked generated workflows | Canonical `@opengsd/gsd-core` prompts + native runtime gates | Project value is transparent upstream content compatibility. [CITED: .planning/PROJECT.md] |
| Test framework | New test runner | Vitest | Existing config and tests use Vitest globals. [CITED: vitest.config.ts] |

**Key insight:** The hard problem is not parsing `--auto`; it is preserving workflow semantics deterministically across session boundaries while keeping upstream content canonical. Native Unit state + gates solve that; more prompt instructions do not. [CITED: .planning/REQUIREMENTS.md] [CITED: .planning/PROJECT.md]

## Common Pitfalls

### Pitfall 1: Treating `--chain` and `--auto` as environment variables
**What goes wrong:** Orchestrator waits for env/tool input that Pi never supplies. [CITED: 07 spike pi-argv.md]
**Why it happens:** Pi substitutes `$ARGUMENTS` in prompt templates before the LLM sees content; flags arrive as literal prompt text in v1 prompt flow. [CITED: 07 spike pi-argv.md]
**How to avoid:** Native entry integration must detect mode at the actual Pi/CLI boundary it controls; if using prompt-triggered handoff, parse substituted arguments explicitly. [CITED: 07 spike pi-argv.md]
**Warning signs:** Code checks `process.env.ARGUMENTS` or assumes `$ARGUMENTS` survives to runtime. [ASSUMED]

### Pitfall 2: Ignoring non-phase settings that affect Unit inclusion
**What goes wrong:** Orchestrator skips enabled research/plan-check/review/verifier/UI gates or runs disabled ones. [CITED: generated/workflows/references/planning-config.md]
**Why it happens:** Current checklist only named a subset; `/gsd-settings` exposes many `workflow.*` toggles. [CITED: generated/workflows/workflows/settings.md]
**How to avoid:** Define a `ResolvedWorkflowSettings` type with defaults from planning-config and a queue builder covered by table tests. [CITED: generated/workflows/references/planning-config.md]
**Warning signs:** Hardcoded queue `Plan -> Execute -> Verify -> Closeout` with no optional Units. [CITED: 09-CONTEXT.md]

### Pitfall 3: Directly editing `STATE.md` for journal history
**What goes wrong:** `STATE.md` becomes verbose, conflicts with upstream resume/current-position semantics, or breaks state handlers. [CITED: generated/workflows/templates/state.md]
**Why it happens:** ORCH-03 allows `STATE.md` or sibling file, but Phase 9 context locks sibling journal for detailed lifecycle. [CITED: 09-CONTEXT.md]
**How to avoid:** Store detailed events in sibling machine-readable artifact; update `STATE.md` only as short digest/resume pointer through handlers. [CITED: 09-CONTEXT.md]
**Warning signs:** Dozens of event lines appended under `STATE.md ## Accumulated Context`. [ASSUMED]

### Pitfall 4: Letting future modules expand Phase 9 scope
**What goes wrong:** Phase 9 balloons into State Reconciliation, Worktree Safety, Tool Contract, and Recovery Classification. [CITED: ROADMAP.md]
**Why it happens:** ORCH-02 names all invariant gates, but later phases own deep implementations. [CITED: .planning/REQUIREMENTS.md]
**How to avoid:** Implement seam interfaces and minimal pre-dispatch checks, with clear `deferred`/`notImplementedYet` outcomes where appropriate. [CITED: 09-CONTEXT.md]
**Warning signs:** New drift catalogs or full worktree lease validation appear in Phase 9 tasks. [CITED: ROADMAP.md]

### Pitfall 5: Logging sensitive or unbounded data
**What goes wrong:** Journal/trace leaks prompts, secrets, tokens, or large arguments. [CITED: 09-CONTEXT.md]
**Why it happens:** Lifecycle logging is mistaken for full tool-call tracing. [CITED: 09-CONTEXT.md]
**How to avoid:** Journal only event kind, IDs, paths, statuses, attempts, timestamps, and short reasons; keep args redacted unless explicitly opted in. [CITED: 09-CONTEXT.md]
**Warning signs:** Event schemas contain `prompt`, `userText`, `env`, or raw tool args fields. [ASSUMED]

## Code Examples

### Public API surface
```typescript
// Source: ROADMAP.md Phase 9 success criteria + gsd-pi module map
export interface AutoOrchestrator {
  start(sessionContext: OrchestratorSessionContext): Promise<OrchestratorResult>;
  advance(): Promise<AdvanceResult>;
  resume(): Promise<OrchestratorResult>;
  stop(reason: StopReason): Promise<OrchestratorResult>;
  getStatus(): OrchestratorStatus;
}
```

### Gate ordering seam
```typescript
// Source: REQUIREMENTS.md ORCH-02 + Phase 7 gsd-pi module map
async function advanceUnit(unit: OrchestrationUnit, deps: OrchestratorDeps) {
  await deps.reconcileBeforeDispatch(unit);     // Phase 10 seam
  await deps.decideDispatch(unit);              // Phase 9 owned
  await deps.validateToolContract(unit);        // Phase 12 seam
  await deps.prepareUnitRoot(unit);             // Phase 11 seam
  await deps.persistRuntimeState(unit);         // Phase 9 owned
  return deps.dispatchUnit(unit);               // Phase 9 dispatch seam
}
```

### Safe scoped audit environment
```typescript
// Source: Phase 9 D-16 + upstream DispatchLogger spike
const childEnv = {
  ...process.env,
  GSD_AUDIT: "1",
  // Do not set GSD_AUDIT_ARGS unless user explicitly opts in.
};
```

### STATE handler usage pattern
```bash
# Source: verified locally with gsd-tools query state json/state get
node "$(node -e "console.log(require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs'))")" query state json --raw
node "$(node -e "console.log(require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs'))")" query state get "Current Position"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `$GSD_SDK` / `gsd_query` bridge to upstream SDK modules | Upstream `gsd-tools.cjs` + Phase 8 launcher transform; native modules planned for v2.0 | Upstream 1.2.0 / Phase 8 | Phase 9 must not resurrect SDK imports. [CITED: STATE.md] |
| `AUTO_MODE_CHECKLIST` prompt compliance workaround | Native TypeScript Unit orchestration with code gates | Phase 9 target | Remove constants/injection tests and enforce gates in code. [CITED: .planning/REQUIREMENTS.md] |
| Detailed transition history in prompt context | Sibling machine-readable journal + `STATE.md` digest pointer | Phase 9 decision | Enables resume without bloating `STATE.md`. [CITED: 09-CONTEXT.md] |
| Full invariant module behavior in one orchestrator | Ordered seams: State Reconciliation, Tool Contract, Worktree Safety | v2.0 phased roadmap | Phase 9 should wire order but defer deep implementations. [CITED: ROADMAP.md] |

**Deprecated/outdated:**
- `AUTO_MODE_CHECKLIST` behavioral injection: obsolete after native orchestration; current function is already no-op but should be fully removed. [VERIFIED: src/prompt-transform.ts]
- `gsd_query` Pi tool and SDK route bridge: deleted in Phase 8; do not reintroduce. [CITED: STATE.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A new state-machine dependency is unnecessary for Phase 9. | Standard Stack / Alternatives | If Unit orchestration grows more complex than expected, implementation may need more custom testing or later dependency discussion. |
| A2 | Warning sign examples such as checking `process.env.ARGUMENTS` are likely failure modes. | Common Pitfalls | Low; affects diagnostic guidance only. |
| A3 | Event schemas containing raw prompt/user/env fields would violate redaction goals. | Common Pitfalls | Medium; planner should explicitly validate log schemas against D-17. |

## Open Questions (RESOLVED in Phase 09 closeout)

1. **Where is the native trigger wired?** — RESOLVED
   - What we know: Pi currently substitutes slash-command args into prompt content, and existing CLI exposes `official` passthrough but no orchestrator command. [CITED: 07 spike pi-argv.md] [CITED: src/cli.ts]
   - Resolution: Phase 09 exposes both `pi-gsd-core orchestrate` and Pi extension command handlers for `gsd-plan-phase`, `gsd-execute-phase`, `gsd-verify-work`, and `gsd-ship` when args include `--auto` / `--chain`. [VERIFIED: src/cli.ts] [VERIFIED: src/extension.ts] [VERIFIED: tests/extension.test.ts]

2. **Exact settings precedence rule.** — RESOLVED
   - What we know: Context leaves precedence between explicit flags, persistent config, roadmap phase indicators, and user confirmation not fully locked. [CITED: 09-CONTEXT.md]
   - Resolution: explicit invocation starts orchestration; normalized `workflow.*` settings decide Unit inclusion; inferred phase signals enable conditional candidates only when settings allow; conflicts pause with a resume hint. [VERIFIED: src/orchestrator/settings.ts] [VERIFIED: src/orchestrator/index.ts] [VERIFIED: tests/orchestrator-settings.test.ts]

3. **STATE.md write-through handler for resume pointer.** — RESOLVED
   - What we know: `state json` and `state get` work locally; generated docs describe `state update/patch`, but exact field/section update semantics for a custom resume pointer need verification before implementation. [VERIFIED: gsd-tools query state json/state get] [CITED: 07 spike upstream-1.2.0-impact.md]
   - Resolution: Phase 09 writes the replayable sibling journal as canonical resume state and uses the official state handler for a bounded digest pointer when available; direct Markdown editing remains outside the runtime path. [VERIFIED: src/orchestrator/journal.ts] [VERIFIED: src/orchestrator/state-digest.ts]

4. **Pi subagent callable surface inside package code.** — RESOLVED WITH ADAPTER SEAM
   - What we know: `src/pi-subagents.ts` currently resolves package metadata only; generated prompts instruct LLM use of Pi `subagent` tool. [CITED: src/pi-subagents.ts] [CITED: generated/workflows/workflows/autonomous.md]
   - Resolution: no stable programmatic Pi subagent API is assumed inside package code. Dispatch remains behind `DispatchAdapter`; the Pi extension wires the native loop and fails closed with an actionable pause if a runner is unavailable, while tests inject runners that produce artifacts. [VERIFIED: src/orchestrator/dispatch.ts] [VERIFIED: src/extension.ts]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | TypeScript runtime, CLI, tests | ✓ | v25.7.0 | Project targets Node 22+ per PROJECT.md; current local is newer. [VERIFIED: `node --version`] |
| npm | scripts and package metadata checks | ✓ | 11.10.1 | — [VERIFIED: `npm --version`] |
| Git | worktree/status tests and GSD planning commands | ✓ | 2.53.0.windows.2 | — [VERIFIED: `git --version`] |
| `@opengsd/gsd-core` `gsd-tools.cjs` | state/config handler calls | ✓ | package 1.2.0 | Use `resolveOfficialPackage()` in code. [VERIFIED: require.resolve] |
| `pi-subagents` package | agent dispatch integration | ✓ | package.json resolved; installed version 0.27.0 | Keep dispatch behind adapter; if runtime tool unavailable, pause with install/enable hint. [VERIFIED: require.resolve] |
| Vitest | unit/integration tests | ✓ | devDependency `^4.0.0`; npm latest observed 4.1.7 | — [CITED: package.json] [VERIFIED: npm registry] |

**Missing dependencies with no fallback:** none found for research/planning. [VERIFIED: environment probes]

**Missing dependencies with fallback:** programmatic Pi subagent dispatch API not yet verified; use adapter seam and early test/spike. [ASSUMED]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest via `vitest.config.ts` [CITED: vitest.config.ts] |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/orchestrator.test.ts tests/orchestrator-settings.test.ts tests/orchestrator-journal.test.ts` |
| Full suite command | `npm run check` [CITED: CLAUDE.md] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ORCH-01 | `--auto`/`--chain` native loop advances without checklist prompts | integration | `npx vitest run tests/e2e/orchestrator-chain.test.ts` | ❌ Wave 0 |
| ORCH-02 | Unit dispatch calls gates in fixed order and pauses on blockers | unit | `npx vitest run tests/orchestrator.test.ts -t "gate order"` | ❌ Wave 0 |
| ORCH-03 | Journal snapshot + history supports resume after pause/error | unit | `npx vitest run tests/orchestrator-journal.test.ts` | ❌ Wave 0 |
| RUNTIME-03 | `AUTO_MODE_CHECKLIST` constants/injection removed and generated artifacts lack marker | unit | `npx vitest run tests/prompt-transform.test.ts -t "auto mode"` plus grep for `<pi_auto_mode_fidelity>` | ⚠️ Existing file, new assertions needed |

### Sampling Rate
- **Per task commit:** targeted Vitest file for changed module. [CITED: CLAUDE.md]
- **Per wave merge:** `npm test` then `npm run build`. [CITED: CLAUDE.md]
- **Phase gate:** `npm run check` green before verification. [CITED: CLAUDE.md]

### Wave 0 Gaps
- [ ] `tests/orchestrator.test.ts` — covers ORCH-01/ORCH-02 state machine and gate ordering.
- [ ] `tests/orchestrator-settings.test.ts` — covers settings-driven Unit inclusion/defaults.
- [ ] `tests/orchestrator-journal.test.ts` — covers ORCH-03 snapshot/history/resume.
- [ ] `tests/e2e/orchestrator-chain.test.ts` — fixture full chain without prompt checklist.
- [ ] Update `tests/prompt-transform.test.ts` — RUNTIME-03 marker removal and no exported checklist behavior.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth/session feature in this phase. [CITED: ROADMAP.md] |
| V3 Session Management | no | Orchestrator resume is local workflow state, not user web sessions. [CITED: 09-CONTEXT.md] |
| V4 Access Control | yes | Do not overwrite non-owned generated agents; for Phase 9, keep journal writes under `.planning/` and use safe paths. [CITED: CLAUDE.md] |
| V5 Input Validation | yes | Validate `sessionContext`, phase IDs, Unit types, settings values, journal schema, and stop reasons with explicit TypeScript guards; no new validation library recommended. [ASSUMED] |
| V6 Cryptography | no | No cryptographic feature; never log secrets/tokens. [CITED: 09-CONTEXT.md] |

### Known Threat Patterns for TypeScript CLI/runtime orchestration

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal / writes outside project | Tampering | Resolve base path, constrain journal to `.planning/`, and use existing safe-output patterns where deleting/writing directories. [CITED: CLAUDE.md] |
| Secret leakage in logs | Information Disclosure | Redacted lifecycle schema; no full user text/env/tool args. [CITED: 09-CONTEXT.md] |
| Stale auto-chain flag causing unintended execution | Elevation/Repudiation | Sync `_auto_chain_active` with explicit invocation intent; existing workflows clear stale flag on manual entry. [CITED: generated/workflows/workflows/execute-phase.md] [CITED: generated/workflows/workflows/discuss-phase/modes/chain.md] |
| Ambiguous settings silently choosing behavior | Tampering/Repudiation | Pause and ask user rather than silently choosing when settings and phase signals conflict. [CITED: 09-CONTEXT.md] |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/09-auto-orchestration-native-module/09-CONTEXT.md` — locked Phase 9 decisions and boundaries.
- `.planning/REQUIREMENTS.md` — ORCH-01/02/03 and RUNTIME-03 requirements.
- `.planning/ROADMAP.md` — Phase 9 scope and success criteria.
- `.planning/STATE.md` — prior decisions and Phase 8 completion context.
- `CLAUDE.md` — project architecture and coding/test conventions.
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/*.md` — argv contract, gsd-pi module map, upstream 1.2.0 impact.
- `generated/workflows/references/planning-config.md` — settings keys/defaults.
- `generated/workflows/workflows/autonomous.md`, `discuss-phase/modes/chain.md`, `execute-phase.md`, `execute-plan.md` — current prompt-driven auto behavior.
- `generated/workflows/templates/state.md` and `generated/workflows/references/artifact-types.md` — artifact/state semantics.
- Source files: `src/prompt-transform.ts`, `src/cli.ts`, `src/index.ts`, `src/official.ts`, `src/pi-subagents.ts`.
- Verified commands: `node --version`, `npm --version`, `git --version`, `npm view`, `require.resolve`, `gsd-tools query state json/state get`.

### Secondary (MEDIUM confidence)
- Existing test layout and grep results in `tests/*.test.ts` and `vitest.config.ts`.

### Tertiary (LOW confidence)
- Assumptions about exact native Pi subagent programmatic dispatch API and absence of need for a state-machine dependency.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stack is existing project stack verified from package/config and environment probes.
- Architecture: HIGH — project CLAUDE and Phase 7/9 decisions give clear layering and API surface.
- Pitfalls: MEDIUM-HIGH — most are directly evidenced by generated workflows and prior spikes; a few warning examples are assumed.

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 for project-internal architecture; re-check npm/upstream surfaces before changing dependencies or `@opengsd/gsd-core` version.
