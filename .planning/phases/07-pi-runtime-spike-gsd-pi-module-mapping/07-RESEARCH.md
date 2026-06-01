# Phase 7: Pi Runtime Spike + gsd-pi Module Mapping - Research

**Researched:** 2026-05-31
**Domain:** Pi Runtime Integration (argv-passing), gsd-pi Deep-Module Architecture, GSD Upstream 1.2.0 Surface Change Analysis
**Confidence:** HIGH

## Summary

This research covers three independent but strategically connected domains that establish the technical foundation for v2.0 Runtime Refactor (Phases 8-13). The Pi argv-passing mechanism is a straightforward string-substitution pipeline in `prompt-templates.js` — slash command arguments are parsed bash-style, then substituted into template content via `$1`/`$2`/`$@`/`$ARGUMENTS` placeholders. The gsd-pi module mapping confirms all five v2.0 anchor modules (Auto Orchestration, State Reconciliation, Worktree Safety, Recovery Classification, Tool Contract) have well-defined ADR surfaces and implementation artifacts in the gsd-pi fork at `D:\Workstation\gsd-pi-fork` (commit `fc39cdcdd`). The upstream 1.2.0 analysis reveals three major structural changes from 1.1.0: complete SDK directory removal (the 91-route `gsd_query` bridge in pi-gsd-redux is broken at the import level), `gsd-tools.cjs` as the new CLI bridge replacing `sdk/dist/query/*.js` modules, and a `DispatchLogger` seam (`observability/logger.cjs`) providing structured event tracing with opt-in audit file support.

**Primary recommendation:** The Phase 8 upgrade MUST happen before any v2.0 module work — the 1.2.0 SDK removal means pi-gsd-redux's current `gsd_query` tool cannot import its handlers. The Phase 7 spike produces three artifacts (`pi-argv.md`, `gsd-pi-module-map.md`, `upstream-1.2.0-impact.md`) that all feed directly into Phase 8-13 planning. All five gsd-pi modules mirror in v2.0 with no deferrals.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| argv-passing (/gsd:foo → prompt) | Browser/Client (Pi) | — | Pi runtime owns slash command parsing and template substitution; pi-gsd-redux consumes the substituted prompt content |
| Auto Orchestration dispatch | API/Backend (pi-gsd-redux) | — | Native TS loop in pi-gsd-redux; dispatches Units, calls invariant gates; no LLM delegation |
| State Reconciliation (`.planning/` drift) | API/Backend (pi-gsd-redux) | — | Owns DB/disk projection-drift detection and repair; replaces `gsd_query` SDK bridge |
| Worktree Safety (root validation) | API/Backend (pi-gsd-redux) | — | Fail-closed validation before source-writing Units; gated at dispatch time |
| Recovery Classification | API/Backend (pi-gsd-redux) | — | Typed failure taxonomy; consumed by Auto Orchestration for retry/stop/escalate decisions |
| Tool Contract compilation | API/Backend (pi-gsd-redux) | — | Per-unit contract compiled before dispatch; consumed by Auto Orchestration gate |
| gsd-tools CLI surface | API/Backend (gsd-core) | — | Upstream-owned CLI bridge; pi-gsd-redux may shell out or reimplement select sub-commands |
| DispatchLogger observability | API/Backend (gsd-core) | API/Backend (pi-gsd-redux) | Upstream seam for event tracing; v2.0 can wire its own logger for orchestration observability |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Three artifacts to produce: `pi-argv.md`, `gsd-pi-module-map.md`, `upstream-1.2.0-impact.md`
- **D-02:** One plan covering all three (independent, small, sequential execution is fine)
- **D-03:** Code-level inspection for 1.2.0 analysis (gsd-tools CLI surface + gsd_run launcher + DispatchLogger seam), not just release notes
- **D-04:** Does NOT do a full v1.1.0→v1.2.0 diff — that's Phase 8's job
- **D-05:** Argv spike scope is Pi side only — verify how Pi slash command arguments reach workflow prompt content via `$ARGUMENTS` substitution
- **D-06:** gsd-tools/gsd_run calling conventions covered by upstream-1.2.0-impact.md, not pi-argv.md
- **D-07:** gsd-pi reference source: local fork `D:\Workstation\gsd-pi-fork` (v1.0.2), commit `fc39cdcdd`
- **D-08:** Mapping anchored on ADR surface (ADR-009/014/017) + file-level references to `packages/daemon/src/` — NOT the non-existent `extensions/gsd/{auto,state-reconciliation,safety}/` path
- **D-09:** All five v2.0 anchor modules mirror in v2.0 (none deferred to v2.1)
- **D-10:** Phase 8 runs upgrade before any v2.0 module work
- **D-11:** SETTINGS-01/02 deferred to Phase 12

### Claude's Discretion

- Spike artifact location: phase directory `.planning/phases/07-*/spike/`
- All form-level decisions (directory naming, file naming, markdown structure)
- Exact reproducer approach for argv spike

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUNTIME-01 | Verify how Pi delivers slash command arguments to workflow prompts — the `$ARGUMENTS` substitution contract | §Pi Argv-Passing Mechanism (verified via `prompt-templates.js` source analysis) |
| STATE-03 | `reconcileBeforeDispatch(basePath)` returns either reconciled state or terminal `blockers: string[]` | §gsd-pi Module Mapping → State Reconciliation (ADR-017 surface documented; drift catalog enumerated) |
| ORCH-01 | pi-gsd-redux owns `--auto`/`--chain` loop in native TS | §gsd-pi Module Mapping → Auto Orchestration (ADR-009/014 surfaces; orchestrator API contract documented) |
| UPSTREAM-03 | `$GSD_SDK` transform output migrated from `gsd_query` to either native State Reconciliation or `gsd_run` | §Upstream 1.2.0 Impact (gsd-tools CLI surface + gsd_run shell function cataloged; SDK absence confirmed) |
| UPSTREAM-04 | Evaluate whether upstream 1.2.0 `DispatchLogger` seam provides suitable observability hook for v2.0 Auto Orchestration | §Upstream 1.2.0 Impact → DispatchLogger Seam (API surface, audit file format, wiring point documented; assessment: suitable) |
</phase_requirements>

## Standard Stack

This phase is a research spike — no production dependencies are installed, and no new packages are added to the project. The research reads existing artifacts:

### Research Tools Used

| Tool | Version | Purpose | Why Used |
|------|---------|---------|----------|
| Node.js | v25.7.0 | Read and interpret source files, run `npm pack` | Runtime already present |
| npm | v11.10.1 | Package inspection (`npm view`, `npm pack`) | Already installed |
| Git | 2.53.0 | gsd-pi fork commit pinning | Already installed |
| `npm pack @opengsd/gsd-core@1.2.0` | — | Extract 1.2.0 tarball for source inspection | Temporary extraction to `/tmp/gsd120/`; not installed into project |

### Artifacts Produced (no dependencies)

| Artifact | Location | Format | Consumer |
|----------|----------|--------|----------|
| `pi-argv.md` | `.planning/phases/07-*/spike/` | Markdown with reproducer and contract spec | Phase 8-9 planners (how args reach prompts in Pi) |
| `gsd-pi-module-map.md` | `.planning/phases/07-*/spike/` | Markdown with mirror/defer/N/A decision table | Phase 9-12 planners (which gsd-pi surfaces to implement) |
| `upstream-1.2.0-impact.md` | `.planning/phases/07-*/spike/` | Markdown with API surface catalog | Phase 8 planner (known changeset before upgrade execution) |

## Package Legitimacy Audit

> **Skipped** — this phase installs no external packages. All research reads existing artifacts (gsd-pi fork on disk, upstream 1.2.0 tarball extracted to `/tmp/`, node_modules/@opengsd/get-shit-done-redux@1.1.0, node_modules/@earendil-works/pi-coding-agent). No `npm install`, `pip install`, or `cargo add` operations. The `npm pack` command used for 1.2.0 inspection downloads a tarball but does not execute any scripts — it is a read-only archive extraction.

## Architecture Patterns

### gsd-pi Deep-Module Architecture (reference for v2.0)

gsd-pi organizes runtime invariants as first-class modules behind a deep Auto Orchestration module. The pattern is:

```
Auto Orchestration (ADR-014)
  ├── State Reconciliation (ADR-017)      — drift-driven, runs before every dispatch
  ├── Dispatch Decision                   — selects next Unit from reconciled state
  ├── Tool Contract (ADR-015)             — compiles per-unit prompt/policy/schema
  ├── Worktree Safety (ADR-016)           — validates unit root before source writes
  └── Recovery Classification (ADR-015)   — typed failure → retry/escalate/stop
```

**Key pattern: `advance()` pipeline ordering is fixed and enforced.** gsd-pi ADR-015 specifies the exact sequence: State Reconciliation → Dispatch → Tool Contract → Worktree Safety → Runtime persistence. The orchestrator owns this sequence; modules are called in order.

**Why this matters for pi-gsd-redux v2.0:** Our current architecture has 4 layers (entry → application services → pure transforms → resolvers). v2.0 adds an **orchestration layer** between application services and transforms, following gsd-pi's deep-module pattern. The orchestrator becomes the new top-level controller, calling invariant modules in fixed sequence before each Unit dispatch.

### Pattern 1: Deep Module with Small Interface

**What:** Each module exposes a small, testable public API (typically 1-3 functions) while internal complexity is contained in subdirectories.

**Example from gsd-pi:**

```typescript
// Source: gsd-pi state-reconciliation/index.ts (ADR-017)
// Public surface: one function
export async function reconcileBeforeDispatch(
  basePath: string,
  deps: ReconciliationDeps = defaultDeps,
): Promise<ReconciliationResult>;
```

**Internal structure:**
```
state-reconciliation/
  index.ts       → reconcileBeforeDispatch (public API)
  errors.ts      → ReconciliationFailedError
  types.ts       → DriftRecord, ReconciliationDeps, ReconciliationResult
  registry.ts    → DriftKind → { detect, repair } map
  drift/         → one file per drift kind (sketch-flag.ts, merge-state.ts, ...)
```

**When to use for pi-gsd-redux v2.0:** Every v2.0 module follows this pattern. The `src/orchestrator/`, `src/state-reconciliation/`, `src/worktree-safety/`, `src/recovery/`, and `src/tool-contract/` directories each expose a small public API with internal complexity gated behind typed interfaces.

### Pattern 2: Typed Discriminated Unions for Failure/Drift Taxonomy

**What:** Use TypeScript discriminated unions with a `kind` field rather than free-text strings or error codes.

**Example from gsd-pi:**

```typescript
// Source: gsd-pi state-reconciliation/types.ts (ADR-017)
type DriftRecord =
  | { kind: "stale-sketch-flag"; mid: string; sid: string }
  | { kind: "unmerged-merge-state"; basePath: string }
  | { kind: "stale-worker"; lockPath: string; pid: number }
  | { kind: "unregistered-milestone"; milestoneId: string }
  | { kind: "roadmap-divergence"; milestoneId: string; sliceId?: string }
  | { kind: "missing-completion-timestamp"; entity: "task"|"slice"|"milestone"; ids: string[] };

// Source: gsd-pi recovery-classification.ts (ADR-015)
export type RecoveryFailureKind =
  | "tool-schema"
  | "deterministic-policy"
  | "stale-worker"
  | "worktree-invalid"
  | "verification-drift"
  | "reconciliation-drift"
  | "provider"
  | "runtime-unknown";
```

**When to use for pi-gsd-redux v2.0:** Every module that classifies errors or drift must use this pattern. The compiler enforces exhaustiveness checking on switch/case. Adding a new drift kind means adding a type member — this is a compile-time change that forces all consumers to handle the new variant.

### Pattern 3: Idempotent Repair with Detection Loop

**What:** Reconciliation runs in a detection-detect-repair-recheck loop (capped at 2 passes) to handle cascading repairs. All repair functions must be idempotent (safe under retry).

**Example from gsd-pi:**

```typescript
// Source: gsd-pi state-reconciliation/index.ts (ADR-017, lines 52-109)
const MAX_PASSES = 2;

export async function reconcileBeforeDispatch(...): Promise<ReconciliationResult> {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // 1. Invalidate cache → re-derive state
    // 2. Detect all drift kinds
    // 3. If no drift → return clean
    // 4. Apply all repairs (collecting failures, not aborting on first)
    // 5. If any failure → throw ReconciliationFailedError
    // 6. If all succeed → loop again (cascading drift detection)
  }
  // After cap: final re-derive + detect. Persistent drift → throw.
}
```

**When to use for pi-gsd-redux v2.0:** The `StateReconciliation` module (Phase 10) follows this exact lifecycle. The loop cap (2 passes) prevents infinite retry while handling cascading repairs.

### Anti-Patterns to Avoid

- **Scattered invariant checks in dispatch code:** Do not scatter worktree checks, drift detection, or recovery logic across the Auto Orchestration dispatch path. Each invariant lives in its own module. Detected in gsd-pi pre-ADR-015 triage — the same bugs appeared in multiple dispatch sites.
- **Free-text blocker comparison:** Do not match blockers by regex or substring. Use typed `DriftRecord` discriminated unions. gsd-pi ADR-017 explicitly rejects predicate-matched repairs over free-text blockers as fragile (same problem as dispatch rule registry drift).
- **Silent degradation to project root:** Do not fall back to project root when worktree root is invalid. ADR-016 mandates fail-closed — the Unit stops with a typed `worktree-invalid` recovery decision. pi-gsd-redux must never silently run source-writing Units outside the milestone worktree.
- **Generic "other" failure bucket:** Recovery Classification must have exactly 8 explicit classes (not 7 + "other"). gsd-pi ADR-015 requires `runtime-unknown` as the catch-all, not `other`. Telemetry uses the same taxonomy — no separate "misc" bucket.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| argv parsing for slash commands | Custom arg parser | Pi's `parseCommandArgs()` already handles bash-style quoting — consume it, don't reimplement | Pi owns this; reimplementing creates a second parser that can diverge. The contract is: Pi performs substitution, pi-gsd-redux reads the substituted prompt content. |
| `$ARGUMENTS` substitution in workflow prompts | Custom substitution engine | Pi's `substituteArgs()` already handles `$1`/`$2`/`$@`/`$ARGUMENTS`/`${@:N}`/`${@:N:L}` | Same reason — Pi owns the template expansion. pi-gsd-redux's job is to ensure the template content (emitted by `npm run generate`) is compatible with this substitution contract. |
| CLI bridge to gsd-core state operations | Custom CLI wrapper | Use `gsd-tools.cjs` via `gsd_run()` shell function (from `_runtime-launcher.snippet.sh`) for Phase 8 upgrade; replace with native State Reconciliation in Phase 10 | `gsd-tools.cjs` is the upstream-blessed CLI surface. The `_runtime-launcher.snippet.sh` resolves the tool location across 4 fallback paths. Building our own CLI wrapping duplicates upstream's location resolution logic. |
| Event tracing for orchestration dispatch | Custom event log | Wire into upstream `DispatchLogger` seam (`createDefaultLogger`) for dispatch events; add pi-gsd-redux-specific events for orchestration lifecycle transitions | The DispatchLogger already provides `traceId` generation, stderr error output, and opt-in `.gsd-trace.jsonl` audit. Adding our own parallel event system creates two trace sources that must be correlated. |

**Key insight:** The `gsd_query` Pi tool's 91-route SDK bridge is the single biggest technical debt item in v1.0. It imports from `@opengsd/get-shit-done-redux/sdk/dist/query/*.js` — a directory that does not exist in `@opengsd/gsd-core@1.2.0`. The bridge is broken at the import level. Phase 8 must either delete the tool entirely or replace every import with calls to `gsd-tools.cjs` / `gsd_run()` (then later replace those with native State Reconciliation in Phase 10).

## Pi Argv-Passing Mechanism (RUNTIME-01)

### Verified Flow

The Pi runtime delivers slash command arguments to workflow prompts through a two-stage string substitution pipeline in `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js`.

**Entry point:** User types `/gsd-plan-phase 07 --chain`

**Stage 1 — Parsing (`parseCommandArgs`, line ~18):**
Pi parses the argument portion of the slash command (`07 --chain`) using a bash-style parser that respects quoted strings. Result: `["07", "--chain"]`.

**Stage 2 — Template resolution (`expandPromptTemplate`, line ~240):**
Pi matches the template name (`gsd-plan-phase`) against loaded templates (from `.pi/prompts/`, project prompts dir, explicit paths). When found, it calls `substituteArgs(template.content, parsedArgs)`.

**Stage 3 — Substitution (`substituteArgs`, line ~58):**
Six substitution patterns are supported, applied in order:
1. `$1`, `$2`, ... — positional args (applied first to prevent wildcard values containing `$<digit>` from re-substituting)
2. `${@:N}` or `${@:N:L}` — bash-style arg slicing
3. `$ARGUMENTS` — all args joined with spaces
4. `$@` — all args joined with spaces (legacy)

**The contract:** Workflow prompt content can use `$1`, `$2`, `$ARGUMENTS`, `$@`, `${@:start}`, or `${@:start:length}` as placeholders. Pi performs literal string substitution before the prompt is sent to the LLM. The LLM never sees `$ARGUMENTS` — it sees the substituted text.

**Implications for v2.0:**
- `--chain` and `--auto` flags appear as literal strings in the substituted prompt content
- pi-gsd-redux's Auto Orchestration (Phase 9) must detect these flags in the prompt content to trigger native orchestration mode
- `$ARGUMENTS` substitution is Pi-owned, not pi-gsd-redux-owned — we cannot change the substitution contract
- The `AUTO_MODE_CHECKLIST` (currently at `src/prompt-transform.ts:917`) is injected into prompt content before Pi substitution happens — it's part of the template, not post-substitution

## gsd-pi Module Mapping (D-07, D-08, D-09)

### Reference Source

- **Fork:** `D:\Workstation\gsd-pi-fork` (v1.0.2)
- **Commit:** `fc39cdcdd07ba13dd408b0cbd009b295894497dc` (2026-05-25)
- **Anchors:** ADR-009 (orchestration kernel), ADR-014 (auto orchestration deep module), ADR-015 (runtime invariants), ADR-016 (worktree safety fail-closed), ADR-017 (state reconciliation drift-driven)

### Module Map

| v2.0 Module | Phase | gsd-pi ADR Surface | gsd-pi File References | Mirror Decision | Interface Contract |
|-------------|-------|--------------------|------------------------|-----------------|--------------------|
| Auto Orchestration | 9 | ADR-009 (6-plane UOK) + ADR-014 (deep module) | `auto/orchestrator.ts` (415 lines), `auto/contracts.ts`, `auto/phases.ts`, `auto/session.ts` | **Mirror** | `start(sessionContext)`, `advance()`, `resume()`, `stop(reason)`, `getStatus()` |
| State Reconciliation | 10 | ADR-017 (drift-driven) | `state-reconciliation/index.ts` (109 lines), `state-reconciliation/drift/*.ts` (7 drift handlers), `state-reconciliation/registry.ts` | **Mirror** | `reconcileBeforeDispatch(basePath, deps)` → `{ ok, stateSnapshot, repaired, blockers }` |
| Worktree Safety | 11 | ADR-016 (fail-closed) | `worktree-safety.ts` (327+ lines, `createWorktreeSafetyModule`) | **Mirror** | `prepareUnitRoot(unitType, unitId)` → valid root or typed `worktree-invalid` |
| Recovery Classification | 11 | ADR-015 (runtime invariants) | `recovery-classification.ts` (139 lines) | **Mirror** | `classifyFailure(input)` → `{ failureKind, action, reason, exitReason, remediation }` with 8 explicit classes |
| Tool Contract | 12 | ADR-015 (runtime invariants) | `tool-contract.ts` (84 lines) | **Mirror** | `compileUnitToolContract(unitType)` → `{ ok, contract }` with prompt obligations, tools, schema, validation, closeout |

### Deferred/N/A Decisions

| gsd-pi Surface | Decision | Rationale |
|----------------|----------|-----------|
| Parallel slice orchestrator (ADR-009 execution plane) | **Defer to v2.1** | Not in v2.0 scope per ROADMAP; single-worker deterministic mode only |
| Cloud MCP Gateway (daemon model) | **N/A** | Different distribution model; pi-gsd-redux runs inside Pi, not as standalone daemon |
| Discord bot / control channel | **N/A** | gsd-pi's `packages/daemon/src/orchestrator.ts` is Discord-specific; not applicable to Pi runtime |
| Worktree lifecycle projection (ADR-016 part 2) | **Defer to v2.1** | Worktree creation/teardown is Phase 11 scope extension |
| gsd-pi's `prompts/` set | **N/A** | We consume gsd-core's prompts; gsd-pi's prompts are their fork, not ours |

### gsd-pi Module Organization vs v2.0 Target

| gsd-pi Path | pi-gsd-redux v2.0 Path | Notes |
|-------------|------------------------|-------|
| `src/resources/extensions/gsd/auto/orchestrator.ts` | `src/orchestrator/` | pi-gsd-redux owns the loop in TS; gsd-pi's auto/ subdirectory structure is a reference pattern |
| `src/resources/extensions/gsd/state-reconciliation/` | `src/state-reconciliation/` | Same module pattern: index.ts + errors.ts + types.ts + registry.ts + drift/ subdir |
| `src/resources/extensions/gsd/worktree-safety.ts` | `src/worktree-safety/` | Single file in gsd-pi; may expand to directory in v2.0 |
| `src/resources/extensions/gsd/recovery-classification.ts` | `src/recovery/` | Single file in gsd-pi; may expand with provider-classifier sub-module |
| `src/resources/extensions/gsd/tool-contract.ts` | `src/tool-contract/` | Single file in gsd-pi; will need unit-manifest registry in v2.0 |

## Upstream 1.2.0 Impact (D-03, D-04)

### Structural Changes from 1.1.0 → 1.2.0

| Change | 1.1.0 (`@opengsd/get-shit-done-redux`) | 1.2.0 (`@opengsd/gsd-core`) | Impact on pi-gsd-redux |
|--------|---------------------------------------|------------------------------|------------------------|
| Package name | `@opengsd/get-shit-done-redux` | `@opengsd/gsd-core` | `src/official.ts:5` constant, all imports, path-rewrite inputs, comments, test fixtures must change |
| SDK directory | `sdk/dist/query/*.js` (200+ files, full query dispatch layer) | **Removed entirely** — no `sdk/` directory exists | `src/gsd-query-tool.ts` 91-route `COMMAND_ROUTE` imports from a directory that doesn't exist — broken at the import level |
| CLI bridge | `bin/gsd-tools.cjs` (limited surface) | `get-shit-done/bin/gsd-tools.cjs` (expanded surface: 30+ atomic commands + phase/roadmap/milestone/validation/progress ops) | All `$GSD_SDK` transforms must redirect from `gsd_query` Pi tool → `gsd_run()` shell function or native State Reconciliation |
| `gsd_run` launcher | Did not exist as a named surface | Shell function in `_runtime-launcher.snippet.sh` — resolves `gsd-tools.cjs` across 4 fallback paths | Workflow files that call `gsd_run query ...` must have the shell snippet sourced first; Pi runtime needs the function defined |
| observability | No structured event layer | `bin/lib/observability/event.cjs` + `logger.cjs` + `redaction.cjs` → `DispatchLogger` seam with `traceId`-based event tracing | New seam for v2.0 Auto Orchestration observability; opt-in audit file at `.planning/.gsd-trace.jsonl` |
| `command-routing-hub.cjs` | Did not exist | New hub that accepts optional `logger: { onEvent }` → dispatches through `DispatchLogger` | pi-gsd-redux can inject custom logger for orchestration event tracing |
| bin/lib modules | ~25 files | ~80+ files — full library extracted from SDK into CJS modules under `bin/lib/` | New modules for: drift, graphify, worktree-safety, observability, install-profiles, etc. |
| Hooks structure | Minimal hooks | 15+ hooks in `hooks/dist/` + 2 CLI scripts | pi-gsd-redux does not use hooks directly (Pi runtime doesn't support hook execution model) |

### gsd-tools CLI Surface (1.2.0)

The `gsd-tools.cjs` entry point supports the following command families. This is the replacement for `sdk/dist/query/*.js`:

```
Atomic Commands:
  state load, state json, state update, state get, state patch,
  state begin-phase, state signal-waiting, state signal-resume,
  resolve-model, find-phase, commit, commit-to-subrepo,
  verify-summary, generate-slug, current-timestamp,
  list-todos, verify-path-exists, config-ensure-section,
  history-digest, summary-extract, state-snapshot,
  phase-plan-index, websearch

Phase Operations:
  phase next-decimal, phase add, phase insert,
  phase remove, phase complete

Roadmap Operations:
  roadmap get-phase, roadmap analyze,
  roadmap update-plan-progress, roadmap annotate-dependencies

Requirements Operations:
  requirements mark-complete

Milestone Operations:
  milestone complete

Validation:
  validate consistency, validate health, validate agents

Progress:
  progress [json|table|bar]

UAT Audit:
  audit-uat, uat render-checkpoint

Open Artifact Audit:
  audit-open

Intel:
  intel query, intel status, intel update
```

[VERIFIED: npm registry — extracted from `gsd-tools.cjs` in `@opengsd/gsd-core@1.2.0` tarball]

### gsd_run Launcher Convention

`gsd_run` is **not a binary** — it is a shell function defined in `_runtime-launcher.snippet.sh`:

```bash
# Source: _runtime-launcher.snippet.sh (1.2.0)
gsd_run() { node "$GSD_TOOLS" "$@"; }
```

Where `GSD_TOOLS` is resolved across 4 fallback paths (project `get-shit-done/bin/`, `.claude/get-shit-done/bin/`, `PATH`, `~/.claude/get-shit-done/bin/`).

**Implication for pi-gsd-redux:** Workflow files in v2.0 should NOT call `gsd_run` directly in Pi — Pi doesn't have a shell execution environment for inline bash. Instead:
1. **Phase 8 (transition):** `$GSD_SDK` transform output redirects to Pi tool calls or direct `gsd-tools.cjs` invocation
2. **Phase 10 (target):** Replace all `gsd_run`/`gsd-tools` with native State Reconciliation calls

### DispatchLogger Seam Assessment (UPSTREAM-04)

**Question:** Does the 1.2.0 `DispatchLogger` seam provide a suitable observability hook for v2.0 Auto Orchestration?

**Assessment: YES — suitable as a dispatch-level event sink, but not as an orchestration lifecycle logger.**

**DispatchLogger API surface:**

```typescript
// Interface (in command-routing-hub.cjs, line ~209)
interface DispatchLogger {
  onEvent(event: DispatchEvent): void;
}

// DispatchEvent shape (in observability/event.cjs)
interface DispatchEvent {
  traceId: string;           // UUID v4, generated per dispatch
  parentTraceId?: string;    // propagated from caller if valid UUID v4
  command: string;           // dispatched verb
  args?: unknown;            // only present when includeArgs=true AND GSD_AUDIT_ARGS=1
  result: {                  // HubResult
    kind: 'ok' | 'UnknownCommand' | 'InvalidArgs' | 'HandlerRefusal' | 'HandlerFailure';
    ...payload
  };
  timestamp: string;         // ISO 8601
}
```

**Default behavior (createDefaultLogger):**
1. Silent on success (`result.kind === 'ok'`)
2. Structured JSON to stderr on error
3. Opt-in audit file: when `GSD_AUDIT=1` or `config.audit.enabled=true`, appends every event as JSONL to `.planning/.gsd-trace.jsonl`
4. Args redacted by default; opt-in via `GSD_AUDIT_ARGS=1`

**Wiring point:** `command-routing-hub.cjs` accepts an optional `logger` property. Consumers inject `createDefaultLogger()` or provide their own `{ onEvent }` implementation. The hub calls `logger.onEvent(event)` after every dispatch.

**Suitability for v2.0 orchestration:**
- ✅ Provides structured `traceId`-based dispatch tracing
- ✅ Opt-in audit file is crash-safe (synchronous `fs.appendFileSync`)
- ✅ Error events emit to stderr — pi-gsd-redux can capture this in orchestration
- ⚠️ Limited to Hub dispatch events only — does not cover orchestration lifecycle transitions (state changes, Unit dispatch decisions, gate results)
- ⚠️ Args are redacted by default — orchestration observability may need args for debugging

**Recommendation for v2.0:** Use DispatchLogger for Hub-level dispatch tracing (what commands are called, what results they return). Add a separate `OrchestrationLogger` for orchestration lifecycle events (Unit dispatch decisions, gate outcomes, state transitions). The orchestration logger follows the same `{ onEvent }` interface pattern and writes to the same `.gsd-trace.jsonl` file with a different event type discriminator.

## Runtime State Inventory

> This section is included because v2.0 involves a rename/rebrand from `@opengsd/get-shit-done-redux` to `@opengsd/gsd-core` and the retirement of the `gsd_query` SDK bridge.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — pi-gsd-redux is a generator/runtime adapter with no data stores. State files (.planning/) are project-owned, not adapter-owned. | None |
| Live service config | None — pi-gsd-redux has no live services, daemons, or external configurations. | None |
| OS-registered state | None — no Windows Task Scheduler tasks, pm2 processes, or systemd units reference pi-gsd-redux. | None |
| Secrets and env vars | None — pi-gsd-redux does not manage secrets. GSD settings.json is project-scoped, not adapter-scoped. | None |
| Build artifacts / installed packages | **`node_modules/@opengsd/get-shit-done-redux/`** (1.1.0 installed). **`node_modules/@opengsd/gsd-core/`** (not yet installed — only 1.1.0 exists). `package.json` lists `@opengsd/get-shit-done-redux` as dependency. | Phase 8: `npm uninstall @opengsd/get-shit-done-redux && npm install @opengsd/gsd-core@1.2.0` |

## Common Pitfalls

### Pitfall 1: Assuming `$ARGUMENTS` is an environment variable or tool input

**What goes wrong:** Developers treat `${ARGUMENTS}` as a shell variable or Pi tool input, then try to read it from `process.env` or tool parameters. It doesn't exist there.

**Why it happens:** The Pi `prompt-templates.js` code is buried in `node_modules/` and the `expandPromptTemplate` function is not obvious from the public Pi API surface. The `substituteArgs` function handles `$ARGUMENTS`, `$@`, `$1`, `$2`, `${@:N}`, and `${@:N:L}` as literal string replacements in template content — the LLM never sees the raw placeholder.

**How to avoid:** Always think of `$ARGUMENTS` as a Pi-side template substitution, not a runtime variable. pi-gsd-redux's workflow prompts are templates; Pi performs substitution before sending content to the LLM. The v2.0 approach: detect `--auto`/`--chain` in the substituted content (they arrive as literal strings), then trigger native orchestration.

**Warning signs:** Grepping for `process.env.ARGUMENTS` or `$ARGUMENTS` in runtime code. The placeholder only appears in template content (`.md` files under `generated/prompts/`, `commands/gsd/`, `get-shit-done/workflows/`).

### Pitfall 2: Treating gsd-tools.cjs as an SDK replacement

**What goes wrong:** Attempting to create a new Pi tool that shells out to `gsd-tools.cjs` for every operation, replicating the 91-route bridge pattern.

**Why it happens:** The natural reaction to SDK removal is "find the new CLI and wrap it." gsd-tools.cjs exists and works, so creating a `gsd_tools` Pi tool that calls `node gsd-tools.cjs <subcommand>` seems like the straightforward migration path.

**How to avoid:** Use `gsd-tools.cjs`/`gsd_run()` as a Phase 8 transition bridge only. Phase 10 replaces it with native State Reconciliation. The CLI bridge is not the target architecture — it's a compatibility shim during the upgrade. Design Phase 8 with the explicit assumption that `gsd-tools.cjs` calls will be removed in Phase 10.

**Warning signs:** Starting to build a new `COMMAND_ROUTE` mapping from gsd-tools subcommands. Adding `child_process.execSync` calls in transform output. Any pattern that looks like `gsd-tools.cjs` → another dispatch table.

### Pitfall 3: Copying gsd-pi's parallel orchestration prematurely

**What goes wrong:** Building parallel slice orchestration (ADR-009 execution plane's DAG scheduler) in v2.0 because gsd-pi has it and it looks sophisticated.

**Why it happens:** ADR-009's execution plane describes sub-agents, team-workers, and parallel modes. The temptation is to implement all of it.

**How to avoid:** v2.0 is **single-worker deterministic mode only.** The parallel slice orchestrator is explicitly deferred to v2.1. ADR-009's execution plane is a reference for what's possible, not a v2.0 requirement. Focus on getting the single-loop `advance()` pipeline correct first.

**Warning signs:** Designing a DAG scheduler, edge types for resource conflicts, or multi-worker dispatch. All of these are v2.1 concerns.

### Pitfall 4: Skipping the `_runtime-launcher.snippet.sh` resolution logic

**What goes wrong:** Hardcoding `node get-shit-done/bin/gsd-tools.cjs` as the invocation path, which fails when the package is installed at a different location (global, `.claude/`, PATH).

**Why it happens:** The tarball inspection shows `get-shit-done/bin/gsd-tools.cjs` exists. It's easy to assume it's always in the project root.

**How to avoid:** The `_runtime-launcher.snippet.sh` resolves `GSD_TOOLS` across 4 fallback paths. pi-gsd-redux must replicate this resolution logic at install/generate time and embed the resolved path in workflows, not assume a fixed location. Alternatively, use `require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs')` which handles Node module resolution.

**Warning signs:** Workflow `$GSD_SDK` transforms that emit `node get-shit-done/bin/gsd-tools.cjs` instead of a resolved path.

## Code Examples

### Verified: Pi $ARGUMENTS Substitution Pipeline

```javascript
// Source: node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js
// Line ~18: parseCommandArgs — parses bash-style quoted argument strings
export function parseCommandArgs(argsString) {
    const args = [];
    let current = "";
    let inQuote = null;
    for (let i = 0; i < argsString.length; i++) {
        const char = argsString[i];
        if (inQuote) {
            if (char === inQuote) { inQuote = null; }
            else { current += char; }
        } else if (char === '"' || char === "'") {
            inQuote = char;
        } else if (/\s/.test(char)) {
            if (current) { args.push(current); current = ""; }
        } else { current += char; }
    }
    if (current) { args.push(current); }
    return args;
}

// Line ~58: substituteArgs — replaces placeholders in template content
export function substituteArgs(content, args) {
    let result = content;
    // $1, $2, ... positional (FIRST, before wildcards to prevent re-substitution)
    result = result.replace(/\$(\d+)/g, (_, num) => {
        return args[parseInt(num, 10) - 1] ?? "";
    });
    // ${@:start} or ${@:start:length} — bash-style slicing
    result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
        let start = parseInt(startStr, 10) - 1;
        if (start < 0) start = 0;
        if (lengthStr) {
            return args.slice(start, start + parseInt(lengthStr, 10)).join(" ");
        }
        return args.slice(start).join(" ");
    });
    const allArgs = args.join(" ");
    result = result.replace(/\$ARGUMENTS/g, allArgs);  // $ARGUMENTS → all args
    result = result.replace(/\$@/g, allArgs);            // $@ → all args (legacy)
    return result;
}

// Line ~240: expandPromptTemplate — orchestrates the full flow
export function expandPromptTemplate(text, templates) {
    if (!text.startsWith("/")) return text;
    const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
    if (!match) return text;
    const templateName = match[1];
    const argsString = match[2] ?? "";
    const template = templates.find((t) => t.name === templateName);
    if (template) {
        const args = parseCommandArgs(argsString);
        return substituteArgs(template.content, args);
    }
    return text;
}
```

### Verified: Upstream 1.2.0 DispatchLogger Seam

```javascript
// Source: /tmp/gsd120/package/get-shit-done/bin/lib/observability/event.cjs
// makeDispatchEvent — creates structured event per dispatch
function makeDispatchEvent({ command, args, result, includeArgs = false, parentTraceId }) {
  const resolvedParentTraceId = isValidParentTraceId(parentTraceId) ? parentTraceId : undefined;
  const event = {
    traceId: randomUUID(),       // UUID v4 per dispatch
    parentTraceId: resolvedParentTraceId,
    command: String(command),
    result,
    timestamp: new Date().toISOString(),
  };
  if (includeArgs && args !== undefined) { event.args = args; }
  return Object.freeze(event);
}

// Source: /tmp/gsd120/package/get-shit-done/bin/lib/observability/logger.cjs
// createDefaultLogger — default behavior: silent on ok, stderr on error, opt-in audit
function createDefaultLogger({ cwd = process.cwd(), config } = {}) {
  return {
    onEvent(event) {
      const isOk = event && event.result && event.result.kind === 'ok';
      // Audit file (both ok and error) when GSD_AUDIT=1 or config.audit.enabled=true
      if (_isAuditEnabled(config)) {
        try { _appendAuditLine(cwd, _toAuditRecord(event)); } catch (auditErr) { /* warn stderr */ }
      }
      // Stderr on error
      if (!isOk) {
        try { process.stderr.write(_safeStringify(_toStderrRecord(event)) + '\n'); } catch (stderrErr) { /* last-resort warn */ }
      }
    },
  };
}

// Source: /tmp/gsd120/package/get-shit-done/bin/lib/command-routing-hub.cjs (line ~209)
// Hub accepts optional logger — pi-gsd-redux can inject custom logger here
const _logger = (logger && typeof logger.onEvent === 'function')
  ? logger
  : createNoOpLogger();
// ... after dispatch ...
_logger.onEvent(event);
```

### Verified: gsd-pi Auto Orchestration API Contract

```typescript
// Source: gsd-pi ADR-014 + auto/orchestrator.ts:415
// The deep Auto Orchestration module interface (5 methods):
interface AutoOrchestrationModule {
  start(sessionContext: SessionContext): Promise<void>;
  advance(): Promise<AdvanceResult>;
  resume(): Promise<void>;
  stop(reason: StopReason): Promise<void>;
  getStatus(): OrchestrationStatus;
}

// Invariants (from ADR-014):
// - Exactly one active unit at a time
// - advance() is idempotent for the same state snapshot
// - Lock ownership is validated before mutating runtime state
// - Recovery cannot skip required verification transitions
// - Every state transition is journaled
```

## State of the Art

| Old Approach (v1.0) | Current Approach (v1.2.0 / gsd-pi) | When Changed | Impact |
|---------------------|-------------------------------------|--------------|--------|
| `gsd_query` Pi tool → `sdk/dist/query/*.js` 91-route bridge | `gsd-tools.cjs` CLI + `gsd_run()` shell function (Phase 8 transition) → native State Reconciliation (Phase 10 target) | SDK retired in 1.2.0 (ADR-0174); no `sdk/` directory exists | Must delete or rewire `src/gsd-query-tool.ts` in Phase 8 — imports are broken |
| `AUTO_MODE_CHECKLIST` prompt injection (LLM-prompt compliance) | Native Auto Orchestration loop in TS (gsd-pi ADR-014 pattern) | v2.0 Phase 9 | Replace fragile prompt compliance with deterministic TS loop; remove `src/prompt-transform.ts:917` |
| `@opengsd/get-shit-done-redux` package name | `@opengsd/gsd-core` | v1.2.0 (2026-05-31) | Rename in `src/official.ts`, `package.json`, all transform/reference paths, test fixtures |
| No structured event tracing | `DispatchLogger` with `traceId` + stderr errors + opt-in `.gsd-trace.jsonl` audit | v1.2.0 (ADR-0174 P1.3) | New observability seam for Auto Orchestration (Phase 9); v2.0 can inject custom logger |
| Scattered state checks in auto-loop | `reconcileBeforeDispatch()` drift-driven with typed `DriftRecord[]` | gsd-pi ADR-017 | v2.0 State Reconciliation (Phase 10) — all pre-dispatch checks in one module |

**Deprecated/outdated in v1.2.0:**
- `sdk/dist/query/*.js` — entire directory removed. Any code importing from this path is broken.
- `@opengsd/get-shit-done-redux` package name — replaced by `@opengsd/gsd-core`. Npm still resolves the old name (it's the same package published under both names?) but the canonical name is `@opengsd/gsd-core`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@opengsd/get-shit-done-redux@1.1.0` resolves to the same package lineage as `@opengsd/gsd-core@1.2.0` (i.e., `gsd-core` is the renamed continuation, not a fork) | §Upstream 1.2.0 Impact | Low — npm metadata confirms same repo (`open-gsd/gsd-core`), overlapping description, and sequential version timeline. If wrong, Phase 8 upgrade may target the wrong package. |
| A2 | Pi's `expandPromptTemplate` is the only entry point for slash command argument substitution — there is no secondary mechanism (env vars, tool params) | §Pi Argv-Passing Mechanism | Medium — if Pi has an additional mechanism, v2.0 may need to handle both. Mitigated by thorough source inspection of `prompt-templates.js`. |
| A3 | The `_runtime-launcher.snippet.sh` resolution logic (4 fallback paths) covers all standard GSD installation locations | §Upstream 1.2.0 Impact | Low — these are the standard paths documented in the upstream README. If users have custom installs, `gsd_run` won't find `gsd-tools.cjs`. Mitigated by `require.resolve()` fallback. |
| A4 | All five gsd-pi modules (Auto Orchestration, State Reconciliation, Worktree Safety, Recovery Classification, Tool Contract) are sufficiently well-specified in their ADRs to serve as implementation blueprints for v2.0 | §gsd-pi Module Mapping | Medium — ADRs describe intent and interface, not all implementation details. pi-gsd-redux may encounter edge cases the ADRs don't cover. Mitigated by referencing the actual gsd-pi source code in the fork. |
| A5 | `DispatchLogger` is purely an optional seam — `gsd-tools.cjs` and `command-routing-hub.cjs` function correctly without a logger injected | §Upstream 1.2.0 Impact | Low — confirmed in source: `createNoOpLogger()` is the default; the hub checks `typeof logger.onEvent === 'function'` before calling. |

## Open Questions (RESOLVED)

1. **Does `@opengsd/gsd-core@1.2.0` still export the `@opengsd/get-shit-done-redux` package name as an alias?**
   - What we know: npm registry shows both names, but only `@opengsd/gsd-core` has version 1.2.0. The old name's latest is still 1.1.0.
   - What's unclear: Whether `npm install @opengsd/get-shit-done-redux` installs 1.1.0 (old) or aliases to 1.2.0 (new). This matters for the Phase 8 migration strategy.
   - Recommendation: Phase 8 should explicitly install `@opengsd/gsd-core@1.2.0` and remove the old dependency, not rely on aliases.
   - **RESOLVED: Phase 8 will explicitly install `@opengsd/gsd-core@1.2.0` and remove old dependency per recommendation. Phase 7 impact analysis notes both package names for completeness.**

2. **How does Pi handle the `_runtime-launcher.snippet.sh` shell function?**
   - What we know: Pi does not have a shell execution environment for inline bash. `gsd_run()` is a shell function, not a binary.
   - What's unclear: Whether Pi's tool system can call `node /path/to/gsd-tools.cjs` directly (bypassing the shell function), or whether the function must be pre-sourced.
   - Recommendation: For Phase 8, use `require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs')` to get the resolved path, then invoke `node <resolvedPath>` as a Pi tool or in transform output. Do not rely on `gsd_run` being available in the Pi environment.
   - **RESOLVED: Phase 8 will use `require.resolve()` for path resolution, bypassing the shell function. `gsd_run` is documented but not the migration path.**

3. **What is the exact mechanism for detecting `--chain`/`--auto` flags in substituted prompt content?**
   - What we know: After `substituteArgs()`, `--chain` and `--auto` appear as literal strings in the prompt content. The LLM sees them as text.
   - What's unclear: Whether pi-gsd-redux can intercept the prompt content before it reaches the LLM to detect these flags, or whether detection must happen at the Pi extension hook level (`session_start`, `context`).
   - Recommendation: Phase 9 should explore both approaches — extension hook interception and prompt-content scanning. The extension hook approach is cleaner (no string parsing).
   - **RESOLVED: DEFERRED to Phase 9 — both extension-hook and prompt-scanning approaches will be explored during Auto Orchestration implementation.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Reading source files, running npm pack | ✓ | v25.7.0 | — |
| npm | Package inspection (`npm view`, `npm pack`) | ✓ | v11.10.1 | — |
| Git | gsd-pi fork commit pinning | ✓ | 2.53.0 | — |
| D:\Workstation\gsd-pi-fork | gsd-pi module mapping reference | ✓ | commit `fc39cdcdd` (2026-05-25) | — (blocker if missing) |
| node_modules/@opengsd/get-shit-done-redux | v1.0 reference for impact analysis | ✓ | 1.1.0 | — |
| node_modules/@earendil-works/pi-coding-agent | Pi argv-passing source inspection | ✓ | installed (prompt-templates.js at 251 lines) | — |
| ctx7 CLI | Documentation lookups | ✗ | — | Not needed for spike (source code inspection, not library docs) |

**Missing dependencies with no fallback:**
- None — all required dependencies are available.

## Validation Architecture

### Test Framework

This phase is a research/spike with no production code changes. Testing is limited to verifying that the spike artifacts are internally consistent and the source claims are reproducible.

| Property | Value |
|----------|-------|
| Framework | Manual verification (no automated tests for research artifacts) |
| Config file | Not applicable |
| Quick run command | Not applicable |
| Full suite command | Not applicable |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RUNTIME-01 | Pi argv-passing mechanism documented with reproducer | Manual verification | Read `prompt-templates.js` → trace `expandPromptTemplate` → `parseCommandArgs` → `substituteArgs` → confirm substitution patterns | N/A (manual) |
| STATE-03 | gsd-pi State Reconciliation interface documented | Manual verification | Read `state-reconciliation/index.ts` + ADR-017 → confirm `reconcileBeforeDispatch` contract → enumerate drift catalog | N/A (manual) |
| ORCH-01 | gsd-pi Auto Orchestration API contract documented | Manual verification | Read ADR-009/014 + `auto/orchestrator.ts` → confirm `start/advance/resume/stop/getStatus` interface | N/A (manual) |
| UPSTREAM-03 | 1.2.0 gsd-tools CLI surface + gsd_run cataloged | Manual verification | `npm pack @opengsd/gsd-core@1.2.0` → inspect `gsd-tools.cjs`, `_runtime-launcher.snippet.sh` → confirm command list and shell function | N/A (manual) |
| UPSTREAM-04 | DispatchLogger seam assessment complete | Manual verification | Inspect `observability/event.cjs`, `logger.cjs`, `redaction.cjs`, `command-routing-hub.cjs` → confirm API surface, wiring, audit format | N/A (manual) |

### Sampling Rate

- Per spike artifact: Spot-check source claims by re-running the inspection commands
- Phase gate: All three spike artifacts complete and self-consistent

### Wave 0 Gaps

- [ ] No automated tests needed (research spike — artifacts are documentation, not code)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | Not applicable — research spike, no authentication surfaces |
| V3 Session Management | No | Not applicable |
| V4 Access Control | No | Not applicable |
| V5 Input Validation | Yes (spike) | Pi's `parseCommandArgs()` handles input sanitization for slash command arguments. v2.0 Auto Orchestration must not bypass this — arg values should be treated as untrusted input. |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for Pi Runtime + GSD Ecosystem

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted argv injection via `$ARGUMENTS` | Tampering | Pi's `parseCommandArgs()` performs bash-style parsing; `substituteArgs()` does literal string replacement. No eval — the LLM receives the text, not executed code. Mitigation: treat substituted values as untrusted LLM input, not as executable commands. |
| Path traversal in gsd-tools.cjs invocation | Tampering | `_runtime-launcher.snippet.sh` resolves `GSD_TOOLS` to a specific path before executing. pi-gsd-redux should use `require.resolve()` which resolves against node_modules, not user-controlled paths. |
| Audit file injection via `.gsd-trace.jsonl` | Information Disclosure | DispatchLogger audits contain command names and results, not raw args (redacted by default). v2.0 orchestration logger should follow same redaction policy. |

## Sources

### Primary (HIGH confidence)

- `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js` (251 lines) — Full `parseCommandArgs`, `substituteArgs`, `expandPromptTemplate` source code. Verified all 6 substitution patterns, argument parsing, and template resolution flow. [VERIFIED: source code inspection]
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-009-orchestration-kernel-refactor.md` — Unified Orchestration Kernel design with 6 control planes, migration waves, and acceptance criteria. [VERIFIED: git-tracked ADR in fork]
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-014-auto-orchestration-deep-module.md` — Deep Auto Orchestration module with `start/advance/resume/stop/getStatus` interface, 6 seams, invariants. [VERIFIED: git-tracked ADR in fork]
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-015-runtime-invariant-modules.md` — Four runtime invariant modules (State Reconciliation, Worktree Safety, Recovery Classification, Tool Contract) with target interfaces and call ordering. [VERIFIED: git-tracked ADR in fork]
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-016-worktree-safety-fail-closed.md` — Fail-closed worktree validation with typed failure outcomes. [VERIFIED: git-tracked ADR in fork]
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-017-state-reconciliation-drift-driven.md` — Drift-driven reconciliation with typed `DriftRecord[]`, 2-pass loop, `ReconciliationFailedError`. [VERIFIED: git-tracked ADR in fork]
- `D:\Workstation\gsd-pi-fork/src/resources/extensions/gsd/auto/orchestrator.ts` (469 lines) — Auto Orchestration implementation in gsd-pi. [VERIFIED: source code in fork]
- `D:\Workstation\gsd-pi-fork/src/resources/extensions/gsd/state-reconciliation/index.ts` (109 lines) — State Reconciliation module entry point with `reconcileBeforeDispatch` implementation. [VERIFIED: source code in fork]
- `D:\Workstation\gsd-pi-fork/src/resources/extensions/gsd/recovery-classification.ts` (139 lines) — Recovery Classification with `classifyFailure`, 8 failure kinds. [VERIFIED: source code in fork]
- `D:\Workstation\gsd-pi-fork/src/resources/extensions/gsd/tool-contract.ts` (84 lines) — Tool Contract with `compileUnitToolContract`. [VERIFIED: source code in fork]
- `D:\Workstation\gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts` (327+ lines) — Worktree Safety with `createWorktreeSafetyModule`. [VERIFIED: source code in fork]
- `/tmp/gsd120/package/get-shit-done/bin/gsd-tools.cjs` — Full CLI surface for gsd-tools in 1.2.0 (30+ atomic commands). [VERIFIED: extracted from npm tarball `@opengsd/gsd-core@1.2.0`]
- `/tmp/gsd120/package/get-shit-done/workflows/_runtime-launcher.snippet.sh` — `gsd_run()` shell function definition with 4 fallback paths. [VERIFIED: extracted from npm tarball `@opengsd/gsd-core@1.2.0`]
- `/tmp/gsd120/package/get-shit-done/bin/lib/observability/event.cjs` — `makeDispatchEvent` with `traceId`, `parentTraceId`, result shape. [VERIFIED: extracted from npm tarball `@opengsd/gsd-core@1.2.0`]
- `/tmp/gsd120/package/get-shit-done/bin/lib/observability/logger.cjs` — `createDefaultLogger`/`createNoOpLogger` with audit file and stderr behaviors. [VERIFIED: extracted from npm tarball `@opengsd/gsd-core@1.2.0`]
- `/tmp/gsd120/package/get-shit-done/bin/lib/observability/redaction.cjs` — Arg redaction policy with `GSD_AUDIT_ARGS` opt-in. [VERIFIED: extracted from npm tarball `@opengsd/gsd-core@1.2.0`]
- `/tmp/gsd120/package/get-shit-done/bin/lib/command-routing-hub.cjs` — Hub with `logger` injection seam. [VERIFIED: extracted from npm tarball `@opengsd/gsd-core@1.2.0`]
- npm registry: `npm view @opengsd/gsd-core version` → `1.2.0`, `npm view @opengsd/gsd-core dist-tags` → `latest: 1.2.0`, `npm pack` tarball listing → 503 files, confirmed no `sdk/` directory. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- `src/prompt-transform.ts` (pi-gsd-redux v1.0) — `$GSD_SDK` transform patterns and `gsd_query` tool bridge. [CITED: own codebase]
- `src/gsd-query-tool.ts` (pi-gsd-redux v1.0) — 91-route `COMMAND_ROUTE` with SDK import paths. [CITED: own codebase]
- `src/official.ts` (pi-gsd-redux v1.0) — `OFFICIAL_PACKAGE_NAME` constant and path validation. [CITED: own codebase]

### Tertiary (LOW confidence)

- None — all claims in this research were verified against source code, npm registry, or git-tracked ADRs.

## Metadata

**Confidence breakdown:**
- Pi argv-passing: **HIGH** — full source code of `prompt-templates.js` inspected; all 6 substitution patterns verified; complete call chain traced from `expandPromptTemplate` → `parseCommandArgs` → `substituteArgs`
- gsd-pi module mapping: **HIGH** — all 5 ADRs read; all 5 implementation files read; file hierarchy confirmed via `find`; commit pinned for reproducibility
- Upstream 1.2.0 impact: **HIGH** — tarball extracted and inspected; key files read in full (gsd-tools.cjs, observability/*, command-routing-hub, _runtime-launcher.snippet.sh); SDK absence confirmed via `ls /tmp/gsd120/package/sdk/` returning empty; package name change confirmed via npm registry
- Architecture patterns: **HIGH** — gsd-pi ADR-015 explicitly documents the 5-step `advance()` pipeline ordering; all module interfaces verified from source

**Research date:** 2026-05-31
**Valid until:** 2026-07-01 (30 days — stable upstream package, no expected changes to gsd-pi fork or Pi runtime in this window)
