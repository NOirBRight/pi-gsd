---
phase: 12-tool-contract-settings-bridge
verified: 2026-06-02T07:21:29Z
status: passed
score: 7/7 success criteria verified
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 7/7
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 12: Tool Contract + Settings Bridge Verification Report

**Phase Goal:** Compile per-Unit tool / prompt / policy / schema contract before dispatch + bridge GSD settings.json into Pi prompt context.
**Verified:** 2026-06-02T07:21:29Z
**Status:** passed
**Re-verification:** Yes — post-review fix verification after prior passed verification

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `src/tool-contract/` compiles a contract per Unit type with prompt obligations, allowed tools, schema enum values, validation requirements, closeout tools | ✓ VERIFIED | `src/tool-contract/{compile,snapshot,validate,types,index}.ts` are substantive. `compileToolContracts` reads generated prompts/agents plus official workflow config, extracts agent tools and schema-backed validation requirements, sets closeout requirements for `closeout`, and computes a stable SHA-256 `contractHash`. `generated/tool-contracts.json` contains 14 contracts, no path backslashes, and no `code-review-fix` runtime Unit. |
| 2 | Auto Orchestration gates dispatch through the contract | ✓ VERIFIED | `src/orchestrator/gates.ts` orders `validateToolContract` before `prepareUnitRoot`; it loads `generated/tool-contracts.json` (or compiles fallback), validates snapshot hash integrity, validates Unit type and prompt/agent paths, and maps failures to `dispatch-contract-invalid` stop. |
| 3 | Planner tools reject invalid inputs upfront where applicable | ✓ VERIFIED | Native orchestration's upfront dispatch path rejects invalid Unit dispatch inputs before source-writing worktree prep. `tests/tool-contract.test.ts` covers bounded invalid Unit evidence; `tests/orchestrator.test.ts` covers no dispatch on invalid contract. No separate planner tool layer exists for Phase 12. |
| 4 | Parity tests cover prompt / policy / schema drift detection | ✓ VERIFIED | `verifyToolContractSnapshot` checks snapshot hash integrity, prompt/agent resource presence, removed allowed tools as dispatch-critical failures, and prompt prose drift as warnings. `src/doctor.ts` wires this into doctor/check (`tool contracts: ok|warning|invalid|skipped`). |
| 5 | Pi extension surfaces current GSD settings.json in prompt context at session start/context | ✓ VERIFIED | `src/extension.ts` creates Settings Bridge instances per cwd, refreshes on `session_start`, and uses `bridge.formatContext()` for GSD-related context only. `SettingsBridgeCache.formatContext()` refreshes immediately before formatting, so changed settings are visible. |
| 6 | `gsd:settings` workflow writes to same location extension reads; Pi notifies on change | ✓ VERIFIED | `resolveGsdConfigSource` implements explicit path → safe `.planning/active-workstream` → `.planning/config.json` → root `config.json`. `inferGsdConfigWritePath` mirrors write-side path. `SettingsBridgeCache` notifies at most once per newly observed hash. |
| 7 | Malformed settings fail closed for GSD callers while non-GSD chat continues | ✓ VERIFIED | `resolveWorkflowSettings` throws `OrchestratorSettingsError` on malformed selected config instead of falling back. Extension input hook refreshes before native handoff and returns `{ action: "handled" }` when parse error is present; unrelated input continues. |

**Score:** 7/7 success criteria verified

## Post-Review Fix Coverage

| Fix | Status | Evidence |
|-----|--------|----------|
| Settings Bridge refreshes before formatting GSD context | ✓ VERIFIED | `SettingsBridgeCache.formatContext()` calls `this.refresh()` before `formatSettingsContext`; regression `tests/settings-bridge.test.ts:228` changes `.planning/config.json` and expects `verifier: false` on the second format. |
| Tool Contract snapshot paths normalized to POSIX `/`; 14 contracts; no backslashes; no code-review-fix Unit | ✓ VERIFIED | Node spot-check reported `{ contracts: 14, backslash: 0, hasCodeReviewFix: false, pathsAllPosix: true }`. `compile.ts` builds agent paths with `posix.join`. |
| Settings formatter filters safe workflow keys, redacts command/script/secret scalar values, omits nested workflow objects | ✓ VERIFIED | `cache.ts` uses `SAFE_WORKFLOW_KEYS` and scalar-only filtering; `format.ts` redacts keys/values matching token/secret/password/api key/command/script patterns and formats non-scalars as redacted. Tests cover `code_review_command: [redacted]` and nested object omission. |
| `resolveWorkflowSettings` throws on malformed selected config | ✓ VERIFIED | `src/orchestrator/settings.ts:39-40` throws `OrchestratorSettingsError` when shared resolver returns `parseError`; regression `tests/orchestrator-settings.test.ts:347` covers this. |
| Extension caches Settings Bridge per cwd | ✓ VERIFIED | `src/extension.ts` uses `settingsBridgeByCwd = new Map<string, SettingsBridge>()`; regression `tests/extension.test.ts:157` verifies different cwd values retain different model profiles. |
| code-review-fix runtime Unit scope creep removed | ✓ VERIFIED | `buildUnitQueue` has no `code-review-fix` Unit; `tests/orchestrator-settings.test.ts:57` asserts it is not enqueued. Grep shows `code-review-fix` remains only as generated workflow delegation/test content, not as native Unit type. |
| Tool contract hash normalized with `contractHash` blanked; runtime validator and doctor/check validate integrity | ✓ VERIFIED | `calculateToolContractHash(snapshot)` hashes `stableStringify({ ...snapshot, contractHash: "" })`; independent Node hash check matched stored hash `b64c30a0...`. `validateUnitToolContract` and `verifyToolContractSnapshot` both fail when stored hash differs. |
| active-workstream slug rejects traversal/dot segments | ✓ VERIFIED | `isSafeWorkstreamSlug` rejects `.`/`..` and slash traversal. Tests cover `../../../outside` fallback and `..` fallback in `tests/settings-bridge.test.ts`. |
| Generated code-review-fix workflow passes `FIX_REPORT_PATH` to Node parsers | ✓ VERIFIED | `src/generator.ts:90` transform adds `FIX_REPORT_PATH`; generated workflow has Node parser invocations with `REVIEW_PATH="${REVIEW_PATH}" FIX_REPORT_PATH="${FIX_REPORT_PATH}" node -e`; regression `tests/generator.test.ts:255` covers it. |

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/tool-contract/index.ts` | Public contract API | ✓ VERIFIED | Re-exports compile, snapshot, verify, and runtime validate APIs. |
| `src/tool-contract/compile.ts` | Generated-first compiler and parity verifier | ✓ VERIFIED | Compiles contracts from generated prompts/agents and official workflow config; supplement-only overlays cannot relax upstream fields. |
| `src/tool-contract/snapshot.ts` | Stable snapshot/hash writer | ✓ VERIFIED | Stable key ordering and SHA-256 hash with `contractHash` blanked before hashing. |
| `src/tool-contract/validate.ts` | Runtime validator | ✓ VERIFIED | Cheap snapshot validation plus disk-backed prompt/agent path validation with bounded evidence. |
| `generated/tool-contracts.json` | Published runtime snapshot | ✓ VERIFIED | 14 contracts, valid hash, POSIX paths, included in `package.json` `files`. |
| `src/orchestrator/gates.ts` | Pre-dispatch gate | ✓ VERIFIED | `validateToolContract` runs before `prepareUnitRoot`, fails closed to `dispatch-contract-invalid`. |
| `src/settings-bridge/source.ts` | Shared source resolver | ✓ VERIFIED | Upstream-compatible source precedence with safe active-workstream slug validation. |
| `src/settings-bridge/cache.ts` | Lazy refresh/cache/notify | ✓ VERIFIED | Refreshes by mtime/hash, notify-once per hash, structured parse-error state. |
| `src/settings-bridge/format.ts` | Concise redacted context | ✓ VERIFIED | Emits source/hash/mtime/package/profile/workflow scalar summary; redacts sensitive scalar keys/values and omits nested objects. |
| `src/orchestrator/settings.ts` | Native settings resolver | ✓ VERIFIED | Uses shared resolver and throws on malformed selected config. |
| `src/extension.ts` | Pi integration | ✓ VERIFIED | Per-cwd package/settings caches; session refresh; GSD-only context injection; parse-error native dispatch block. |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/generator.ts` | `generated/tool-contracts.json` | `compileToolContracts` + `writeToolContractSnapshot` | ✓ WIRED | Lines 202-203 compile and write snapshot after generated prompts/agents/workflows. |
| `src/doctor.ts` | `src/tool-contract/index.ts` | `verifyToolContractSnapshot` | ✓ WIRED | Doctor reports invalid/warning/ok/skipped contract status. |
| `src/orchestrator/gates.ts` | `src/tool-contract/index.ts` | `validateUnitToolContract` and disk validation | ✓ WIRED | Contract gate runs before worktree prep and emits typed recovery on failure. |
| `src/orchestrator/settings.ts` | `src/settings-bridge/source.ts` | `resolveGsdConfigSource` | ✓ WIRED | Same resolver supplies workflow settings and source metadata. |
| `src/extension.ts` | `src/settings-bridge/index.ts` | `createSettingsBridge`, `refresh`, `formatContext`, `isParseError` | ✓ WIRED | Session/context/input hooks all use the bridge. |
| `src/generator.ts` | `generated/workflows/workflows/code-review-fix.md` | workflow transform | ✓ WIRED | Adds `FIX_REPORT_PATH` env var to Node parser invocations. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/extension.ts` context injection | `settingsContext` | `bridge.formatContext()` → `refresh()` → `resolveGsdConfigSource()` → actual `.planning/config.json`/active-workstream config | Yes | ✓ FLOWING |
| `src/orchestrator/gates.ts` contract gate | `contractSnapshot` | `readSnapshot(cwd)` → `generated/tool-contracts.json`; fallback `compileToolContracts` from generated artifacts | Yes | ✓ FLOWING |
| `src/orchestrator/settings.ts` workflow settings | `configSource` | Shared resolver reads selected config and parses JSON | Yes; malformed selected source throws | ✓ FLOWING |
| `src/settings-bridge/format.ts` workflow summary | `resolved.workflow` | `filterSafeWorkflowSettings(source.config.workflow)` scalar whitelist | Yes; sensitive/nested values are excluded or redacted | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted post-review regression suite | `npx vitest run tests/settings-bridge.test.ts tests/tool-contract.test.ts --reporter=dot` | 2 files, 25 tests passed | ✓ PASS |
| Tool Contract snapshot shape | Node JSON spot-check of `generated/tool-contracts.json` | 14 contracts; 0 backslash paths; no `code-review-fix`; all paths POSIX | ✓ PASS |
| Tool Contract hash integrity | Node stable hash recomputation with `contractHash` blanked | Stored hash equals recomputed hash | ✓ PASS |
| Full project check | Parent-provided: `npm run check` | typecheck clean, 30 test files / 482 tests passed, build success, generated workflows ok, dispatch syntax ok, tool contracts ok | ✓ PASS |

## Probe Execution

No phase-specific `scripts/**/tests/probe-*.sh` probes were declared or required for this phase.

## Requirements Coverage

`.planning/REQUIREMENTS.md` is absent in this working tree, so coverage is mapped from ROADMAP requirement IDs and PLAN frontmatter.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CONTRACT-01 | `12-01-PLAN.md` | Compile per-Unit tool/prompt/policy/schema contracts | ✓ SATISFIED | Tool contract compiler/snapshot produce 14 stable generated-first contracts with prompt, tools, schema/validation, closeout fields. |
| CONTRACT-02 | `12-01-PLAN.md` | Gate native dispatch through contract | ✓ SATISFIED | `runPreDispatchGates` invokes `validateToolContract` before `prepareUnitRoot`; failures are `dispatch-contract-invalid` stop. |
| SETTINGS-01 | `12-02-PLAN.md` | Surface concise GSD settings in Pi prompt context | ✓ SATISFIED | Extension GSD-only context hook injects bridge-formatted source/hash/mtime/package/profile/workflow summary. |
| SETTINGS-02 | `12-02-PLAN.md` | Same settings source as `gsd:settings`, refresh/notify/block semantics | ✓ SATISFIED | Shared resolver, lazy refresh, notify-once, parse-error blocking, and malformed config throw behavior are implemented and tested. |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | Scanned `src/tool-contract/**`, `src/settings-bridge/**`, `src/orchestrator/gates.ts`, and `src/extension.ts` for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/coming soon/not yet implemented markers; no matches. |

## Human Verification Required

None. The phase goal is code/runtime behavior with deterministic artifacts and automated test coverage. No visual or external-service behavior is required for pass/fail.

## Gaps Summary

No gaps. All ROADMAP success criteria and PLAN must-haves are implemented with substantive artifacts, runtime wiring, data flow, and post-review regression coverage. The post-review fixes specifically close the identified concerns around settings refresh timing, redaction/safe filtering, malformed config fail-closed behavior, per-cwd extension caches, contract snapshot normalization/hash validation, active-workstream path safety, code-review-fix Unit scope, and FIX_REPORT_PATH workflow transformation.

---

_Verified: 2026-06-02T07:21:29Z_
_Verifier: Claude (gsd-verifier)_
