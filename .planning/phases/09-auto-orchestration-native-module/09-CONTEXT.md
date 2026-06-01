# Phase 9: Auto Orchestration Native Module - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers a native TypeScript auto-orchestration module for pi-gsd-core. It owns the `--auto` and `--chain` execution loop in code instead of relying on LLM prompt compliance. The module dispatches workflow-step Units, records lifecycle state for resumability, enforces code gates between Units, and removes the `AUTO_MODE_CHECKLIST` injection from `src/prompt-transform.ts`.

The phase should build the orchestration kernel and its seams, not the full v2.0 runtime stack. Full State Reconciliation drift repair remains Phase 10. Worktree Safety and Recovery Classification remain Phase 11. Tool Contract and Settings Bridge remain Phase 12.

</domain>

<decisions>
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 9 scope and requirements
- `.planning/ROADMAP.md` §Phase 9 — Phase goal, success criteria, required public surface, and 2-3 plan expectation.
- `.planning/REQUIREMENTS.md` §ORCH — ORCH-01/02/03 native loop, Unit dispatch, lifecycle journaling requirements.
- `.planning/REQUIREMENTS.md` §RUNTIME — RUNTIME-03 removal of `AUTO_MODE_CHECKLIST`.
- `.planning/PROJECT.md` — v2.0 strategic direction: native Pi orchestration while keeping gsd-core prompt content canonical.
- `.planning/STATE.md` — carried decisions D-25 through D-39 and current milestone position.

### Prior phase evidence
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/07-CONTEXT.md` — Phase 7 locked spike deliverables and v2.0 module mapping.
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/pi-argv.md` — Verified Pi `$ARGUMENTS` substitution contract; flags arrive as literal prompt text, not env vars/tool inputs.
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/gsd-pi-module-map.md` — gsd-pi ADR/module mapping; public interface and invariants for Auto Orchestration.
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/upstream-1.2.0-impact.md` — `gsd-tools.cjs`, `gsd_run`, and `DispatchLogger` surface catalog.
- `.planning/phases/08-upstream-1-2-0-upgrade-package-rename/08-CONTEXT.md` — Phase 8 decisions: `gsd-tools.cjs` is a stopgap, DispatchLogger auto-enable deferred to Phase 9, launcher transform details.

### Settings and autonomous behavior
- `generated/prompts/gsd-settings.md` — User-facing settings command entrypoint.
- `generated/workflows/workflows/settings.md` — Full settings workflow; parse every relevant config key before designing Unit inclusion.
- `generated/workflows/references/planning-config.md` — Canonical config fields and defaults, especially `workflow.*` toggles.
- `generated/workflows/workflows/autonomous.md` — Current prompt-driven autonomous workflow behavior to replace with native TS orchestration.
- `generated/workflows/references/checkpoints.md` — Existing checkpoint semantics, auto-mode bypass rules, and resume-signal patterns.
- `generated/workflows/references/artifact-types.md` — Artifact lifecycle and consumers, including `STATE.md`, `CONTEXT.md`, `PLAN.md`, `SUMMARY.md`, and handoff artifacts.
- `generated/workflows/templates/state.md` — Upstream `STATE.md` purpose, lifecycle, sections, and under-100-lines digest constraint.

### Current codebase integration points
- `src/prompt-transform.ts` — `AUTO_MODE_CHECKLIST` injection to remove and transform pipeline to keep pure.
- `src/extension.ts` — Pi extension hooks; possible future display/integration point for orchestrator status.
- `src/cli.ts` — CLI entrypoint pattern; likely home for exposing orchestrator commands or passthroughs.
- `src/index.ts` — Public exports; orchestrator module should be exported if it is part of stable package API.
- `src/official.ts` — Resolver for `@opengsd/gsd-core`; use instead of hardcoded package paths.
- `src/pi-subagents.ts` and `src/agent-sync.ts` — Existing Pi subagent integration and generated-agent ownership patterns.
- `tests/prompt-transform.test.ts` — Existing transform tests around auto-mode checklist and launcher transform.

### Architectural constraints
- `CLAUDE.md` §Architecture — Keep entry, application services, pure transforms, and resolver/safety layers separate.
- `CLAUDE.md` §Conventions — Local imports need `.js`; pure transforms stay pure; services return structured results; Pi hooks must never throw.
- `generated/workflows/references/universal-anti-patterns.md` — Do not directly edit `STATE.md` / `ROADMAP.md`; use `gsd-tools query` handlers for mutations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/prompt-transform.ts::AUTO_MODE_CHECKLIST` and related tests identify the exact prompt-compliance workaround Phase 9 retires.
- `src/official.ts::resolveOfficialPackage()` provides package-root resolution for `@opengsd/gsd-core`; do not duplicate path resolution.
- `src/cli.ts` already centralizes command parsing and structured error reporting; new orchestrator CLI surfaces should follow this pattern.
- `src/doctor.ts` and service modules return `{ ok, messages }`-style results; orchestrator APIs should similarly avoid printing/throwing across service boundaries.
- `src/pi-subagents.ts` / `src/agent-sync.ts` already validate Pi subagent availability and generated-agent ownership.
- `generated/workflows/workflows/autonomous.md` is the prompt-driven behavior being replaced; it is the best map of current gates/settings to preserve.

### Established Patterns
- Four-layer architecture: entry → application services → pure transforms → resolvers/safety. `src/orchestrator/` should be an application/runtime service layer, not a transform.
- `.planning/` mutations should use registered `gsd-tools query` handlers where they exist; direct `STATE.md` edits are an anti-pattern.
- Generated artifacts under `generated/` are regenerated from upstream; do not hand-edit generated workflow behavior to implement orchestration.
- TypeScript uses NodeNext; local imports require `.js` suffixes.
- Tests are Vitest with globals enabled.

### Integration Points
- `src/orchestrator/` should expose the ROADMAP-required surface: `start(sessionContext)`, `advance()`, `resume()`, `stop(reason)`, `getStatus()`.
- The orchestrator should read/resolve settings before dispatch and include settings decisions in its journal.
- Unit dispatch should use Pi subagent/agent APIs with GSD agents, rather than slash prompt self-orchestration.
- Artifact gates should validate outputs such as CONTEXT, PLAN, SUMMARY, REVIEW/VERIFICATION artifacts as applicable to configured Units.
- State journal should integrate with `STATE.md` by writing a digest/resume pointer through safe handlers after verifying upstream semantics.
- `GSD_AUDIT=1` should be scoped to orchestrator-run child processes/subprocesses only.

</code_context>

<specifics>
## Specific Ideas

- User explicitly requested Chinese communication for the discussion; planning artifacts remain in English for downstream agents.
- User emphasized that Phase 9 must thoroughly inspect `/gsd-settings` behavior and all related parameters, not just phase-level toggles.
- User wants ambiguous settings/gate choices to ask the user via AskUserQuestion rather than silently choosing.
- User questioned whether the proposed `STATE.md` role conforms to upstream. This should be treated as a planning research item: validate upstream handler/resume semantics before final schema design.

</specifics>

<deferred>
## Deferred Ideas

- Full drift catalog and idempotent repairs are deferred to Phase 10 State Reconciliation.
- Worktree root validation and fail-closed behavior are deferred to Phase 11 Worktree Safety.
- Full typed recovery taxonomy is deferred to Phase 11 Recovery Classification. Phase 9 only uses existing retry/repair settings and pauses with typed reason/resume hint.
- Full Tool Contract validation is deferred to Phase 12, though Phase 9 should expose a seam/gate order compatible with it.
- Parallel slice orchestration remains deferred to v2.1 per Phase 7.

</deferred>

---

*Phase: 9-Auto Orchestration Native Module*
*Context gathered: 2026-06-01*
