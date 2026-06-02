# Phase 12: Tool Contract + Settings Bridge - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 delivers two connected runtime surfaces for `pi-gsd-core`:

1. `src/tool-contract/` compiles a per-Unit dispatch contract before native orchestration dispatch. Each contract defines dispatch-critical prompt obligations, allowed tools, schema enum values, validation requirements, and closeout requirements for a Unit type.
2. The Pi extension bridges GSD settings into Pi prompt context by reading the same effective settings source used by the upstream `gsd:settings` workflow, summarizing workflow/model-routing settings for GSD-related contexts, and refreshing when settings change.

This phase wires the Phase 9 `validateToolContract` gate seam, respects Phase 10 typed/config/state discipline, and maps critical contract failures into Phase 11 `dispatch-contract-invalid` stop decisions. It does not redesign Unit sequencing, recovery taxonomy, worktree safety, or the upstream settings UX itself.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 12 scope and project direction
- `.planning/ROADMAP.md` §Phase 12 — phase goal, requirements IDs, success criteria, and two-plan expectation.
- `.planning/PROJECT.md` — project direction: keep upstream GSD content canonical while replacing runtime bridging with native Pi orchestration modules.
- `.planning/STATE.md` — current position, carried v2.0 module decisions, and Phase 12 focus.
- `.planning/REQUIREMENTS.md` — referenced by ROADMAP for `CONTRACT-01`, `CONTRACT-02`, `SETTINGS-01`, and `SETTINGS-02`, but this file is currently absent in the working tree; planner should confirm whether requirements are tracked elsewhere before assuming the absence is intentional.

### Prior phase handoff contracts
- `.planning/phases/11-worktree-safety-recovery-classification/11-CONTEXT.md` — Phase 11 recovery classes, `dispatch-contract-invalid` mapping to `stop`, bounded evidence constraints, and gate/recovery handoff expectations.
- `.planning/phases/10-state-reconciliation-module/10-CONTEXT.md` — typed blocker discipline, dry-run/apply boundaries, canonical artifact naming, and structured failure handoff pattern.
- `.planning/phases/09-auto-orchestration-native-module/09-CONTEXT.md` — native Unit dispatch model, settings-driven Unit inclusion, journal/status redaction, and the pre-dispatch gate order that includes Tool Contract validation.

### Settings workflow and config references
- `generated/prompts/gsd-settings.md` — user-facing settings command entrypoint.
- `generated/workflows/workflows/settings.md` — upstream settings workflow; especially workstream-aware config path resolution and safe config-set behavior.
- `generated/workflows/references/planning-config.md` — canonical config fields, workflow defaults, `model_profile`, `workflow.use_worktrees`, `workflow.auto_advance`, `response_language`, and field interactions.
- `.planning/config.json` — current project config (`model_profile: inherit`, `workflow._auto_chain_active: false`) and the local source that Phase 12 should include in settings source/freshness tests.

### Existing code integration points
- `src/orchestrator/gates.ts` — current pre-dispatch gate order and `validateToolContract` placeholder returning `phase-12-contract-seam:*`; Phase 12 replaces this seam.
- `src/orchestrator/types.ts` — `UnitType`, `OrchestrationUnit`, `GateResult`, `RecoveryDecision`, `ResolvedWorkflowSettings`, journal event fields, and redaction-compatible status shapes.
- `src/orchestrator/settings.ts` — current workflow settings resolver, upstream defaults loading, config merge, Unit queue building, and settings source tracking.
- `src/orchestrator/official-config.ts` — reads upstream config defaults/schema manifests; likely input to contract/settings source compilation.
- `src/orchestrator/dispatch.ts` — dispatch adapter integration point for contract-validated Unit dispatch inputs.
- `src/orchestrator/journal.ts` — bounded structured journal persistence pattern for gate failures and settings/contract events.
- `src/extension.ts` — Pi session/context/message hooks, current package-resolution notification, runtime context rewrite path, and native auto handoff trigger.
- `src/gsd-models.ts` — existing model profile/routing implementation that Settings Bridge should summarize instead of duplicating.
- `src/index.ts` — public exports if Tool Contract or Settings Bridge APIs are part of the stable package surface.

### Generated/upstream contract inputs
- `generated/agents/` — generated GSD agent prompts/frontmatter and tool declarations; contract compiler should treat these as upstream-derived inputs, not hand-edit them.
- `generated/prompts/` — generated user-facing prompt/workflow entrypoints; useful for prompt obligations and command-specific settings behavior.
- `generated/workflows/` — generated workflow bodies, references, and templates; useful for workflow-step obligations and closeout/validation requirements.
- `package.json` — package metadata, `@opengsd/gsd-core@1.2.0`, Pi extension registration, generated artifact publish list, and build/check scripts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/orchestrator/gates.ts::runPreDispatchGates` already orders `reconcileBeforeDispatch`, `decideDispatch`, `validateToolContract`, `prepareUnitRoot`, and `persistRuntimeState`. The Tool Contract module should plug into this seam.
- `src/orchestrator/types.ts` already defines the Unit union and failure shapes needed for contract validation and `dispatch-contract-invalid` evidence.
- `src/orchestrator/settings.ts::resolveWorkflowSettings` already resolves upstream defaults plus `.planning/config.json`, tracks sources, and handles aliases like `use_worktrees`/`worktrees`.
- `src/orchestrator/official-config.ts::loadOfficialWorkflowConfig` already reads upstream defaults/schema manifests and can inform settings/contract schema handling.
- `src/extension.ts` already has `session_start`, `context`, `message_end`, and `input` hooks. Settings Bridge should extend this without making Pi hooks throw.
- `src/gsd-models.ts` already owns Pi model routing/profile logic; Settings Bridge should summarize this existing model state rather than inventing a second router.

### Established Patterns
- Runtime/application services return structured results and bounded messages rather than printing or throwing across module boundaries.
- Local TypeScript imports require `.js` suffixes under NodeNext.
- Generated artifacts under `generated/` are upstream-derived and should not be hand-edited for runtime behavior.
- Gate failures and journal/status records should use bounded structured evidence. Phase 9/11 redaction constraints apply: record IDs, paths, event kinds, statuses, attempts, hashes, and short reasons; avoid full user text, secrets, tokens, and unbounded raw errors.
- `.planning/` mutations should use registered `gsd-tools query` handlers when available; direct markdown mutation is an anti-pattern outside explicit deterministic repair paths.

### Integration Points
- Replace the placeholder `validateToolContract` gate with a real call into `src/tool-contract/`.
- Contract validation should run before `prepareUnitRoot`; invalid dispatch should stop before any source-writing Unit root/lease work begins.
- Doctor/check should gain parity/drift tests for dispatch-critical contract fields and warning-only noncritical drift.
- Settings Bridge should extend Pi extension context injection while preserving current runtime path rewriting and best-effort notification behavior.
- Native auto dispatch should consume the same settings summary/freshness data that the Pi prompt context displays, so visible settings and runtime behavior cannot diverge silently.

</code_context>

<specifics>
## Specific Ideas

- User requested Chinese for discussion; planning artifacts remain English for downstream agents.
- The user selected all four gray areas: Contract source, Enforcement behavior, Settings context, and Settings changes.
- Generated-first means downstream agents should investigate generated prompt/agent/schema artifacts first, then design a supplement-only Pi overlay.
- Settings Bridge should avoid creating a new Pi-specific settings source; the main research item is identifying the exact upstream/workstream-aware resolution path and making Pi read the same effective settings source.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 12 scope.

</deferred>

---

*Phase: 12-Tool Contract + Settings Bridge*
*Context gathered: 2026-06-02*
