# Phase 12: Tool Contract + Settings Bridge - Research

**Researched:** 2026-06-02
**Domain:** TypeScript runtime orchestration gates, generated prompt/agent contract compilation, Pi extension settings context
**Confidence:** HIGH for codebase integration seams; MEDIUM for exact contract-field extraction heuristics until implemented against generated fixtures.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Contract Source and Drift Detection
- **D-01:** Tool Contract source is **generated-first**. Compile contracts from upstream-derived generated prompts, generated agents, and upstream schema/config manifests. This preserves the project direction that upstream GSD content remains canonical.
- **D-02:** Pi-local Tool Contract overlay is supplement-only. It may add Pi runtime metadata such as Pi tool-name mapping, runtime gate notes, or closeout adapter hints, but it must not relax upstream allowed tools or policy constraints.
- **D-03:** Contract parity/drift tests should cover dispatch-critical fields only: allowed tools, prompt obligations, schema enum values, validation requirements, and closeout requirements. Full prompt prose diffs should not block dispatch.
- **D-04:** Contracts should be compiled or verified as stable snapshots during generate/build/check. Runtime dispatch should perform lightweight validation against the verified contract rather than reparsing all generated prompt/agent content on every dispatch.

### Enforcement Behavior
- **D-05:** Pre-dispatch Tool Contract failures for dispatch-critical fields map to Phase 11 `dispatch-contract-invalid` with action `stop`. The gate should fail closed and must not dispatch the Unit.
- **D-06:** Non-dispatch-critical docs/prose drift may be warning-only in doctor/check. It must not block native runtime dispatch.
- **D-07:** Upfront invalid-input rejection covers native Unit dispatch inputs first. User-facing slash-command/CLI argument validation remains existing command parsing scope unless invalid command input is about to become a Unit dispatch contract violation.
- **D-08:** Contract failure evidence must be structured and bounded: `unitId`, `unitType`, `contractVersion` or `contractHash`, `failedField`, `expected`, `actual`, and source paths. Do not record full prompts, full user text, secrets, or unbounded diffs.

### Settings Context Bridge
- **D-09:** Pi prompt context should inject an effective workflow settings summary, not raw config JSON. Include resolved workflow toggles, model/profile summary, source metadata, and key defaults that affect orchestration or agent behavior.
- **D-10:** The extension may parse/cache settings at `session_start`, but should inject the settings context only for GSD-related sessions, prompts, workflows, or native auto context. Avoid adding settings noise to unrelated Pi conversations.
- **D-11:** Model/profile context should be a routing summary: current GSD model profile, agent tier to Pi model mapping summary, and source. Do not dump every available Pi model.
- **D-12:** Settings context should include source path, resolved hash, mtime, and official package version for freshness/debuggability without exposing full raw config.

### Settings Source, Refresh, and Failure Handling
- **D-13:** Settings Bridge must follow upstream settings/config resolution semantics. Research and reuse the same effective source used by `gsd:settings`; do not create a separate Pi-only settings file.
- **D-14:** Settings refresh should use mtime/hash lazy refresh. Check freshness before GSD context injection or native dispatch; if changed, reparse and update cache. Avoid long-lived file watchers in Phase 12.
- **D-15:** Pi should notify at most once per newly observed settings hash. The notification should summarize the changed source and effective settings change; avoid repeated notifications from repeated context-hook invocations.
- **D-16:** If settings parsing fails, conservatively block GSD context/native auto dispatch and show a warning/remediation. Ordinary non-GSD Pi chat should continue. Do not silently fall back to defaults for GSD execution after a parse failure.

### Claude's Discretion
- Exact TypeScript type names and file layout inside `src/tool-contract/`.
- Exact stable snapshot filename/format, as long as generate/build/check can verify it and runtime dispatch can validate against it cheaply.
- Exact warning format for non-critical drift.
- Exact settings context markdown shape, as long as it stays concise, structured, and redacted.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 12 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONTRACT-01 | Compile per-Unit contracts with prompt, tool, policy, schema, validation, and closeout fields. | `src/orchestrator/dispatch.ts` maps Unit types to generated prompts/agents; generated agent frontmatter exposes `tools`; upstream config manifests expose schema enum/default fields. [VERIFIED: src/orchestrator/dispatch.ts, generated/agents/gsd-planner.md, node_modules/@opengsd/gsd-core/.../config-schema.manifest.json] |
| CONTRACT-02 | Gate auto orchestration dispatch through those contracts and reject invalid Unit inputs before dispatch. | `runPreDispatchGates` already calls `validateToolContract` before `prepareUnitRoot`; Phase 11 recovery taxonomy includes `dispatch-contract-invalid -> stop`. [VERIFIED: src/orchestrator/gates.ts, .planning/phases/11-worktree-safety-recovery-classification/11-CONTEXT.md] |
| SETTINGS-01 | Bridge effective GSD settings into Pi prompt context. | `src/extension.ts` has `session_start`, `context`, and `input` hooks; `resolveWorkflowSettings` already returns workflow values, sources, rawWorkflow, and official metadata. [VERIFIED: src/extension.ts, src/orchestrator/settings.ts] |
| SETTINGS-02 | Read the same location written by `gsd:settings` and notify on changes. | Upstream settings workflow resolves `.planning/workstreams/<active>/config.json` when `.planning/active-workstream` exists; current resolver only prefers `.planning/config.json` then root `config.json`, so Phase 12 must close this gap. [VERIFIED: generated/workflows/workflows/settings.md, src/orchestrator/settings.ts] |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No project-level `CLAUDE.md` exists at repository root; no CLAUDE-specific directives were found. [VERIFIED: file read `CLAUDE.md` returned ENOENT]

Global agent preferences still apply operationally: keep output concise, do not commit without explicit user request, use TDD for behavior changes, avoid new dependencies unless existing tools are insufficient, never commit secrets, and report verification commands/results. [CITED: C:\Users\noirb\.pi\agent\AGENTS.md]

## Summary

Phase 12 should add two runtime modules without changing upstream-generated content: a generated-first `src/tool-contract/` compiler/validator and a settings bridge used by both Pi prompt context injection and native auto dispatch. [VERIFIED: .planning/phases/12-tool-contract-settings-bridge/12-CONTEXT.md] The primary integration seam is already present: `runPreDispatchGates` calls `validateToolContract` after reconciliation/dispatch decision and before worktree preparation/persistence. [VERIFIED: src/orchestrator/gates.ts]

The most important implementation correction is settings source resolution. The generated `gsd:settings` workflow explicitly resolves `.planning/workstreams/<active-workstream>/config.json` when `.planning/active-workstream` exists, while current native `resolveWorkflowSettings` does not. [VERIFIED: generated/workflows/workflows/settings.md, src/orchestrator/settings.ts] The settings bridge should therefore factor source resolution into a shared helper used by `resolveWorkflowSettings`, native dispatch preflight, and Pi context injection. [ASSUMED]

**Primary recommendation:** Build a deterministic contract snapshot generated from `generated/agents`, `generated/prompts`, `generated/workflows`, and official manifests, then use a cheap hash/contract lookup in `validateToolContract`; separately add a lazy mtime/hash-cached effective settings summary module and consume it in `src/extension.ts` and native auto handoff. [VERIFIED: src/orchestrator/gates.ts, src/extension.ts, src/orchestrator/settings.ts]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Contract compilation and parity checks | Build/check CLI | Runtime gate | Contract extraction should occur during generate/build/check; runtime dispatch should only validate cheap snapshot/hash fields. [VERIFIED: D-04 in CONTEXT.md] |
| Pre-dispatch contract enforcement | API / Backend runtime service | Recovery classifier | `validateToolContract` is an orchestrator gate and failures must map to `dispatch-contract-invalid`. [VERIFIED: src/orchestrator/gates.ts, 11-CONTEXT.md] |
| Settings source resolution | API / Backend runtime service | Pi extension | Existing resolver is in `src/orchestrator/settings.ts`; Pi extension should call the same helper, not duplicate semantics. [VERIFIED: src/orchestrator/settings.ts, src/extension.ts] |
| Pi prompt context injection | Browser / Client-equivalent Pi extension hook | API / Backend settings bridge | Pi `context` hook mutates message context; settings bridge supplies pre-redacted content. [VERIFIED: src/extension.ts] |
| Model routing summary | API / Backend model module | Pi extension | `src/gsd-models.ts` owns profiles/catalog/overrides; bridge should summarize it instead of duplicating router logic. [VERIFIED: src/gsd-models.ts] |

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| TypeScript / NodeNext | TS 5.9.3 local; Node v25.7.0 local, package requires Node >=22 | Implement pure compiler, runtime validator, and extension bridge. | Project is TypeScript ESM with NodeNext-style `.js` local imports. [VERIFIED: package.json, local version probe] |
| Vitest | 4.1.7 local | Drift, gate, extension, and settings cache tests. | Existing test suite uses Vitest; `npm test` runs `vitest run`. [VERIFIED: package.json, local version probe] |
| `@opengsd/gsd-core` | 1.2.0 installed; npm registry version 1.2.0 published 2026-05-31 | Canonical upstream prompt/agent/workflow/config source. | Project direction is upstream content canonical; current dependency is pinned to 1.2.0. [VERIFIED: package.json + npm registry] |
| Existing local modules: `orchestrator`, `recovery`, `gsd-models`, `doctor`, `generator` | repo-local | Integration seams for contracts, settings source, model summaries, checks, and generated artifacts. | Existing code already exposes required boundaries; no new runtime dependency is needed. [VERIFIED: src/* reads] |

### Supporting
| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| Node `fs`, `path`, `crypto` | built-in | File reads, mtime, hash, and snapshot generation. | Use for lazy refresh and deterministic contract hash. [ASSUMED] |
| `pi-subagents` | GitHub override in package.json | Existing generated-agent runtime dependency. | Contract compiler validates generated agent names/tool frontmatter; do not add parser dependency unless current frontmatter helpers are insufficient. [VERIFIED: package.json, generated/agents/gsd-planner.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Generated-first local compiler | Hand-authored contract table | Hand-authored table would drift from upstream and violates D-01/D-02. [VERIFIED: 12-CONTEXT.md] |
| Stable snapshot + cheap runtime validation | Reparse all generated prompts/agents at every dispatch | Reparsing increases dispatch cost and violates D-04. [VERIFIED: 12-CONTEXT.md] |
| Shared settings resolver | Pi-only settings file | Pi-only settings source violates D-13 and can diverge from `gsd:settings`. [VERIFIED: 12-CONTEXT.md, generated/workflows/workflows/settings.md] |
| Long-lived file watcher | Lazy mtime/hash refresh | Watchers are explicitly out of Phase 12 by D-14. [VERIFIED: 12-CONTEXT.md] |

**Installation:**

No new external package installation is recommended. [VERIFIED: package.json and phase scope]

## Package Legitimacy Audit

This phase should not install new external packages. Existing dependencies remain as currently declared in `package.json`. [VERIFIED: package.json]

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| None new | — | — | — | — | not run | No install planned |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```text
Generate/check time
  @opengsd/gsd-core manifests + generated/agents + generated/prompts + generated/workflows
        |
        v
  src/tool-contract compiler
        |
        v
  stable contract snapshot + contractHash
        |
        +--> doctor/check parity tests: dispatch-critical mismatch -> fail; prose drift -> warn

Runtime dispatch
  Pi input / CLI orchestrate --auto|--chain
        |
        v
  resolve effective settings + lazy refresh cache
        |
        v
  buildUnitQueue -> runPreDispatchGates
        |
        v
  validateToolContract(contractHash, unit, dispatchTarget, settings/schema)
        |-- mismatch --> recoveryDecision class=dispatch-contract-invalid action=stop; no dispatch
        v
  prepareUnitRoot -> persistRuntimeState -> dispatchUnit

Pi prompt context
  session_start/context/input hook
        |
        v
  is GSD-related? -> refresh settings cache by mtime/hash
        |-- parse error --> warn once; block GSD context/native auto only
        v
  inject concise redacted settings/model/source summary
```

### Recommended Project Structure

```text
src/
├── tool-contract/
│   ├── index.ts              # public API: compile/verify/validate contract
│   ├── types.ts              # ToolContract, ContractFailure, ContractSnapshot
│   ├── compile.ts            # generated-first extraction from agents/prompts/workflows/manifests
│   ├── snapshot.ts           # stable stringify/hash/load verified snapshot
│   └── validate.ts           # cheap per-Unit runtime validation
├── settings-bridge/
│   ├── index.ts              # public API for effective summary/cache
│   ├── source.ts             # shared config source resolution, including active-workstream
│   ├── cache.ts              # lazy mtime/hash refresh and notify-once bookkeeping
│   └── format.ts             # concise redacted prompt-context markdown
└── orchestrator/
    ├── gates.ts              # replace validateToolContract placeholder
    └── settings.ts           # reuse settings-bridge source resolution
```

### Pattern 1: Generated-First Contract Snapshot

**What:** Compile Unit contracts from generated artifacts and official manifests, then serialize a deterministic snapshot with a stable hash. [VERIFIED: 12-CONTEXT.md, src/orchestrator/dispatch.ts]

**When to use:** During `generate`, `doctor/check`, and tests; runtime should load/validate the snapshot instead of reparsing full prompts. [VERIFIED: D-04 in 12-CONTEXT.md]

**Example:**

```typescript
// Source: existing project patterns in src/doctor.ts and src/orchestrator/official-config.ts
const official = resolveOfficialPackage({ startDir: cwd });
const config = loadOfficialWorkflowConfig({ officialRoot: official.packageRoot });
const contract = compileToolContracts({
  generatedRoot: join(cwd, "generated"),
  officialConfig: config,
  dispatchTargets,
});
const snapshot = writeContractSnapshot(contract);
```

### Pattern 2: Fail-Closed Gate Adapter

**What:** Convert contract failures into a `GateResult` failure with `recoveryDecision: { class: "dispatch-contract-invalid", action: "stop" }`. [VERIFIED: 11-CONTEXT.md, src/orchestrator/types.ts]

**When to use:** In `src/orchestrator/gates.ts::validateToolContract`, before any dispatch or source-writing root preparation. [VERIFIED: src/orchestrator/gates.ts]

**Example:**

```typescript
// Source: src/orchestrator/gates.ts + Phase 11 recovery handoff shape
return {
  ok: false,
  gate: "validateToolContract",
  reason: "dispatch-contract-invalid",
  retryable: false,
  resumeHint: "Dispatch contract mismatch; regenerate or update the contract snapshot.",
  evidence: [
    `unitId:${unit.id}`,
    `unitType:${unit.type}`,
    `contractHash:${failure.contractHash}`,
    `failedField:${failure.field}`,
  ],
  recoveryDecision: {
    class: "dispatch-contract-invalid",
    action: "stop",
    message: failure.message,
    remediation: "Run generate/check and inspect dispatch-critical contract drift.",
    evidence: failure.evidence,
  },
  exitReason: "dispatch-contract-invalid",
};
```

### Pattern 3: Shared Settings Source Resolution

**What:** Resolve config path using upstream `gsd:settings` semantics: explicit `GSD_CONFIG_PATH`/configPath first, then `.planning/active-workstream` to `.planning/workstreams/<slug>/config.json`, otherwise `.planning/config.json` and legacy root `config.json` fallback. [VERIFIED: generated/workflows/workflows/settings.md, src/orchestrator/settings.ts]

**When to use:** In `resolveWorkflowSettings`, settings context bridge, and native auto dispatch freshness preflight. [VERIFIED: src/orchestrator/settings.ts, src/extension.ts]

**Example:**

```typescript
// Source: generated/workflows/workflows/settings.md step ensure_and_load_config
function resolveGsdConfigSource(cwd: string, explicit?: string): SettingsSource {
  if (explicit) return { path: explicit, source: "explicit" };
  const active = join(cwd, ".planning", "active-workstream");
  if (existsSync(active)) {
    const slug = readFileSync(active, "utf8").trim();
    return { path: join(cwd, ".planning", "workstreams", slug, "config.json"), source: "active-workstream" };
  }
  const project = join(cwd, ".planning", "config.json");
  if (existsSync(project)) return { path: project, source: "project" };
  return { path: join(cwd, "config.json"), source: "legacy-root" };
}
```

### Anti-Patterns to Avoid

- **Hand-editing generated artifacts:** Generated prompts/agents/workflows are upstream-derived and should not be modified for runtime behavior. [VERIFIED: PROJECT.md, 12-CONTEXT.md]
- **Full prompt prose diffs as dispatch blockers:** D-03 says only dispatch-critical fields block; prose drift should be warning-only. [VERIFIED: 12-CONTEXT.md]
- **Silent settings fallback after parse failure:** D-16 requires blocking GSD context/native auto dispatch and warning/remediation. [VERIFIED: 12-CONTEXT.md]
- **Raw config or full prompt injection:** Settings context must be summarized and redacted; evidence must avoid full prompts/user text/secrets. [VERIFIED: 12-CONTEXT.md, src/orchestrator/journal.ts]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent tool parsing | Custom YAML parser if existing frontmatter helper suffices | Existing `frontmatter.ts`/agent generation patterns | Generated agent frontmatter already stores `tools`; reuse current parser style. [VERIFIED: generated/agents/gsd-planner.md, src/frontmatter.ts exists] |
| Recovery action mapping | Ad hoc string reason handling | Phase 11 `classifyFailure` / `RecoveryDecision` taxonomy | `dispatch-contract-invalid -> stop` is locked. [VERIFIED: 11-CONTEXT.md] |
| Settings routing | New Pi-only config path | Shared source resolver aligned to `gsd:settings` | Prevents visible context/runtime behavior divergence. [VERIFIED: generated/workflows/workflows/settings.md, 12-CONTEXT.md] |
| Model routing | Duplicate model catalog logic | `src/gsd-models.ts` summary helpers or small additions there | Existing module loads model catalog and maps profile/tier overrides. [VERIFIED: src/gsd-models.ts] |
| Redaction | Bespoke unbounded logs | Existing journal redaction conventions | Journal truncates and drops unsafe keys; contract/settings evidence should follow same constraints. [VERIFIED: src/orchestrator/journal.ts] |

**Key insight:** The difficult parts are drift boundaries and source-of-truth alignment, not parsing JSON/YAML; use existing generated artifacts, official manifests, and local runtime seams rather than introducing new frameworks. [VERIFIED: 12-CONTEXT.md, code refs]

## Common Pitfalls

### Pitfall 1: Settings Source Split-Brain
**What goes wrong:** Pi context reads `.planning/config.json` while `gsd:settings` writes an active workstream config. [VERIFIED: generated/workflows/workflows/settings.md, src/orchestrator/settings.ts]
**Why it happens:** Current native resolver does not implement `.planning/active-workstream`. [VERIFIED: src/orchestrator/settings.ts]
**How to avoid:** Factor `resolveGsdConfigSource()` and make `resolveWorkflowSettings`, settings bridge, and native dispatch use it. [ASSUMED]
**Warning signs:** Settings UI reports one path but Pi context source metadata reports another. [ASSUMED]

### Pitfall 2: Contract Snapshot Becomes a Second Source of Truth
**What goes wrong:** Developers hand-edit snapshot/overlay to relax tool or policy constraints. [VERIFIED: 12-CONTEXT.md]
**Why it happens:** Overlay is tempting for quick Pi compatibility fixes. [ASSUMED]
**How to avoid:** Snapshot generated from upstream-derived artifacts; overlay schema should only allow additive Pi metadata and tests should assert it cannot remove allowed tools/policy obligations. [VERIFIED: D-01/D-02]
**Warning signs:** Overlay contains fields named `allowedTools`, `promptObligations`, or `schemaEnums` that replace generated values. [ASSUMED]

### Pitfall 3: Runtime Reparse on Every Dispatch
**What goes wrong:** Dispatch latency and failure surface increase because every Unit parses long generated markdown. [VERIFIED: D-04]
**Why it happens:** Compiler and runtime validator boundaries are not separated. [ASSUMED]
**How to avoid:** Runtime reads a stable snapshot/hash and validates only current Unit target, tools, args/settings, and schema enum membership. [VERIFIED: D-04]
**Warning signs:** `validateToolContract` reads multiple large `.md` files per dispatch. [ASSUMED]

### Pitfall 4: Unbounded Evidence Leaks Prompt/User Text
**What goes wrong:** Contract mismatch evidence stores full prompt snippets, user args, or raw config. [VERIFIED: D-08, src/orchestrator/journal.ts]
**Why it happens:** Diff output is passed directly into gate evidence. [ASSUMED]
**How to avoid:** Evidence fields should be IDs, hashes, field names, expected/actual scalar summaries, and source paths only. [VERIFIED: D-08]
**Warning signs:** Journal event contains `prompt`, `args`, `rawArgs`, `userText`, or long diffs. [VERIFIED: src/orchestrator/journal.ts unsafe keys]

## Code Examples

### Dispatch Target Contract Inputs

```typescript
// Source: src/orchestrator/dispatch.ts
const dispatchTargets = {
  plan: { agent: "gsd-planner", prompt: "generated/prompts/gsd-plan-phase.md" },
  execute: { agent: "gsd-executor", prompt: "generated/prompts/gsd-execute-phase.md" },
  verify: { agent: "gsd-verifier", prompt: "generated/prompts/gsd-verify-work.md" },
  closeout: { agent: undefined, prompt: "generated/prompts/gsd-ship.md" },
};
```

### Existing Gate Order to Preserve

```typescript
// Source: src/orchestrator/gates.ts
const orderedGates = [
  ["reconcileBeforeDispatch", reconcileBeforeDispatch],
  ["decideDispatch", decideDispatch],
  ["validateToolContract", validateToolContract],
  ["prepareUnitRoot", prepareUnitRoot],
  ["persistRuntimeState", persistRuntimeState],
];
```

### Settings Summary Fields

```typescript
// Source: src/orchestrator/types.ts + 12-CONTEXT.md D-09/D-12
type SettingsContextSummary = {
  sourcePath: string;
  sourceKind: "explicit" | "active-workstream" | "project" | "legacy-root" | "default";
  hash: string;
  mtimeMs: number | null;
  officialPackage: string;
  officialVersion: string;
  workflow: Pick<ResolvedWorkflowSettings["workflow"],
    "research" | "plan_check" | "verifier" | "code_review" | "ui_review" |
    "security_enforcement" | "nyquist_validation" | "auto_advance" | "worktrees">;
  modelProfile: string;
  modelRoutingSummary: string[];
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt-driven `--auto`/`--chain` reminders | Native TypeScript Unit orchestration with gates and journal | Phase 9 completed 2026-06-01 | Contract validation belongs in code gate, not prompt prose. [VERIFIED: ROADMAP.md, 09-CONTEXT.md, src/orchestrator/gates.ts] |
| Minimal settings queue resolver | Settings-driven Unit inclusion using official defaults/manifests plus config | Phase 9/10 code exists | Phase 12 must extend resolver for active-workstream and source freshness. [VERIFIED: src/orchestrator/settings.ts, generated/workflows/workflows/settings.md] |
| Placeholder `validateToolContract` | Real contract validation before worktree prep | Phase 12 target | Invalid contract must stop dispatch. [VERIFIED: src/orchestrator/gates.ts, 12-CONTEXT.md] |
| Full generated-file parity only in doctor | Dispatch-critical contract drift tests plus warning-only prose drift | Phase 12 target | Doctor/check should distinguish blocking contract drift from nonblocking prose drift. [VERIFIED: 12-CONTEXT.md, src/doctor.ts] |

**Deprecated/outdated:**
- Treating root `config.json` as equivalent primary settings source is legacy fallback only; upstream settings workflow now resolves active workstream before `.planning/config.json`. [VERIFIED: generated/workflows/workflows/settings.md, src/orchestrator/settings.ts]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Use Node built-in `crypto` for hashing snapshots/settings. | Standard Stack | Low; any stable hash implementation can replace it. |
| A2 | `resolveGsdConfigSource()` should be factored into a new `settings-bridge/source.ts`. | Architecture Patterns | Low; file layout is discretion, but shared semantics are required. |
| A3 | Warning signs listed for pitfalls are predictive implementation heuristics. | Common Pitfalls | Low; tests may use different signals. |
| A4 | Contract extraction can use existing `frontmatter.ts` parser patterns without new dependencies. | Don't Hand-Roll | Medium; planner should inspect `frontmatter.ts` before locking exact parser reuse. |

## Open Questions (RESOLVED)

1. **Where should the stable contract snapshot live?**
   - Resolution: Use `generated/tool-contracts.json` as the stable generated snapshot path.
   - Rationale: The snapshot is generated output, not hand-authored source; `package.json` should include it in published files; doctor/check can verify it against current generated prompts/agents/workflows; runtime can load it cheaply per D-04.
   - Planner impact: Plan 12-01 should keep `generated/tool-contracts.json` in `files_modified`, update generator/doctor/package file wiring, and avoid `src/tool-contract/snapshot.generated.json`.

2. **Which Unit types need prompt-obligation extraction beyond agent tools?**
   - Resolution: Cover every dispatchable `UnitType` that has a dispatch target in `src/orchestrator/dispatch.ts`. For agent-backed Units, extract allowed tools from generated agent frontmatter. For prompt-only Units, validate dispatch target existence plus dispatch-critical obligations discoverable from generated prompt/workflow output requirements and existing post-dispatch policies.
   - Rationale: Prompt-only Units such as `discuss`, `plan-check`, `ai-integration`, and `closeout` still cross the dispatch boundary; they need target/obligation checks even when no agent tool list exists.
   - Planner impact: Start with target existence, required output artifacts/closeout checks from `POST_DISPATCH_POLICIES`, schema enum/default fields from official manifests, and fixture-based prompt-obligation extraction. Expand only through tests tied to dispatch-critical fields.

3. **Should contract APIs be exported from `src/index.ts`?**
   - Resolution: Export public, stable entrypoints from `src/index.ts` only for APIs used by CLI/doctor/generator or useful to package consumers: `compileToolContracts`, `verifyToolContractSnapshot`, `validateUnitToolContract`, and Settings Bridge summary/source APIs if they are consumed outside their modules. Keep internal helpers unexported.
   - Rationale: Existing stable modules are exported from `src/index.ts`; Phase 12 surfaces support doctor/generate/runtime integration and may be useful for downstream package consumers, but helper internals should remain private.
   - Planner impact: Include `src/index.ts` only if implementation needs public package exports; otherwise note why the APIs remain internal in the summary.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | TypeScript runtime/build/test | ✓ | v25.7.0 | Package requires >=22. [VERIFIED: package.json + local probe] |
| npm | scripts and registry verification | ✓ | 11.10.1 | — [VERIFIED: local probe] |
| TypeScript | typecheck | ✓ | 5.9.3 local | `npm run typecheck` [VERIFIED: local probe] |
| Vitest | tests | ✓ | 4.1.7 local | `npm test` [VERIFIED: local probe] |
| Git | worktree/repo safety tests | ✓ | 2.53.0.windows.2 | — [VERIFIED: local probe] |
| ctx7 | optional docs lookup | ✗ | — | Not needed; phase is codebase/upstream-generated artifact research. [VERIFIED: local probe] |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** ctx7 missing; official generated docs/manifests and codebase reads were sufficient for this phase. [VERIFIED: local probe + generated docs]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 local [VERIFIED: local probe] |
| Config file | none found in root file search; package script uses `vitest run`. [VERIFIED: package.json, tests find] |
| Quick run command | `npm test -- tests/orchestrator.test.ts tests/orchestrator-settings.test.ts tests/extension.test.ts` [VERIFIED: package.json + tests present] |
| Full suite command | `npm run check` [VERIFIED: package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONTRACT-01 | Compiles contracts from generated prompts/agents/workflows/manifests and stable snapshot detects dispatch-critical drift. | unit/fixture | `npm test -- tests/tool-contract.test.ts` | ❌ Wave 0 |
| CONTRACT-02 | `validateToolContract` fails closed with `dispatch-contract-invalid` and no dispatch occurs. | unit/integration | `npm test -- tests/orchestrator.test.ts` | ✅ extend existing |
| SETTINGS-01 | Pi context hook injects concise settings/model/source summary only for GSD-related context. | unit | `npm test -- tests/extension.test.ts tests/settings-bridge.test.ts` | ✅ extend + ❌ new |
| SETTINGS-02 | Active-workstream source resolution, lazy mtime/hash refresh, notify-once, parse-error block for GSD native auto. | unit/integration | `npm test -- tests/orchestrator-settings.test.ts tests/settings-bridge.test.ts tests/extension.test.ts` | ✅ extend + ❌ new |

### Sampling Rate
- **Per task commit:** `npm test -- tests/tool-contract.test.ts tests/orchestrator-settings.test.ts tests/extension.test.ts` [ASSUMED]
- **Per wave merge:** `npm run typecheck && npm test` [VERIFIED: package.json]
- **Phase gate:** `npm run check` green before `/gsd-verify-work`. [VERIFIED: package.json]

### Wave 0 Gaps
- [ ] `tests/tool-contract.test.ts` — covers CONTRACT-01 snapshot compile/parity/overlay constraints.
- [ ] `tests/settings-bridge.test.ts` — covers SETTINGS-01/02 source resolution, hash refresh, parse failure, and formatting.
- [ ] Extend `tests/orchestrator.test.ts` — covers CONTRACT-02 fail-closed gate/no dispatch.
- [ ] Extend `tests/orchestrator-settings.test.ts` — covers active-workstream config source semantics.
- [ ] Extend `tests/extension.test.ts` — covers GSD-only context injection and notify-once behavior.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth/session feature in scope. [VERIFIED: phase goal] |
| V3 Session Management | no | No web session management in scope. [VERIFIED: phase goal] |
| V4 Access Control | yes | Fail-closed dispatch gate and worktree safety boundaries prevent unauthorized/invalid Unit execution. [VERIFIED: gates.ts + 11/12 CONTEXT] |
| V5 Input Validation | yes | Validate Unit type, dispatch target, schema enum values, config JSON shape, and source path boundaries before dispatch/context injection. [VERIFIED: types.ts, settings.ts, official-config.ts] |
| V6 Cryptography | yes | Use standard hashing only for integrity/freshness identifiers; do not hand-roll crypto. [ASSUMED] |

### Known Threat Patterns for TypeScript Pi Extension Runtime

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt/config leakage through context injection | Information Disclosure | Inject summarized/redacted settings only; do not dump raw config or full model list. [VERIFIED: D-09/D-11/D-12] |
| Invalid contract dispatch | Tampering/Elevation of Privilege | Fail closed before dispatch with `dispatch-contract-invalid -> stop`. [VERIFIED: D-05, 11-CONTEXT.md] |
| Path traversal / wrong config source | Tampering | Resolve source under project `.planning`/active-workstream or explicit trusted path; include source metadata/hash. [VERIFIED: generated settings workflow, D-12/D-13] |
| Notification spam / alert fatigue | Denial of Service | Notify at most once per newly observed settings hash. [VERIFIED: D-15] |
| Secret exposure in evidence/journal | Information Disclosure | Use bounded evidence fields and existing journal redaction conventions. [VERIFIED: D-08, src/orchestrator/journal.ts] |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/12-tool-contract-settings-bridge/12-CONTEXT.md` — locked Phase 12 decisions and integration refs.
- `.planning/ROADMAP.md` Phase 12 — goal, requirements, success criteria.
- `.planning/PROJECT.md` and `.planning/STATE.md` — project direction and current focus.
- `.planning/phases/09-*`, `10-*`, `11-*` CONTEXT.md — orchestrator, reconciliation, recovery/worktree handoff contracts.
- `src/orchestrator/gates.ts`, `types.ts`, `settings.ts`, `official-config.ts`, `dispatch.ts`, `journal.ts` — current integration seams and types.
- `src/extension.ts`, `src/gsd-models.ts` — Pi hooks and model routing module.
- `generated/workflows/workflows/settings.md`, `generated/workflows/references/planning-config.md`, `generated/prompts/gsd-settings.md` — upstream settings semantics.
- `generated/agents/gsd-planner.md`, `generated/agents/gsd-executor.md` — agent frontmatter/tool declarations examples.
- `node_modules/@opengsd/gsd-core/get-shit-done/bin/shared/config-defaults.manifest.json`, `config-schema.manifest.json`, `model-catalog.json` — official installed manifests.

### Secondary (MEDIUM confidence)
- `npm view @opengsd/gsd-core version time --json` — registry version/publish time verification for currently declared package.
- Local environment probes for Node/npm/TypeScript/Vitest/Git availability.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; versions and scripts verified locally/package registry.
- Architecture: HIGH — seams are explicit in current code and locked decisions.
- Pitfalls: MEDIUM — source split-brain is verified; extraction-specific warning signs are implementation heuristics.

**Research date:** 2026-06-02
**Valid until:** 2026-06-09 for upstream `@opengsd/gsd-core` fast-moving manifests; 2026-07-02 for local integration seams if code does not change.
