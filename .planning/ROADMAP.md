# pi-gsd-redux Roadmap

## Milestones

- ✅ **v1.0 Pi Adapter** — Phases 1-6 (shipped 2026-05-31) → [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v2.0 Runtime Refactor** — Phases 7-12 (planning) → native TS orchestration inspired by `open-gsd/gsd-pi`

## Phases

<details>
<summary>✅ v1.0 Pi Adapter (Phases 1-6) — SHIPPED 2026-05-31</summary>

- [x] Phase 1: Core Adapter (1/1 plan) — generation pipeline + runtime rewrites
- [x] Phase 2: Model Routing (1/1 plan) — `/gsd-models` interactive command, 180 tests
- [x] Phase 3: Subagent Stability (3/3 plans) — EPERM fallback + session-scoped temp dirs
- [x] Phase 4: Workflow Fidelity (2/2 plans) — AskUserQuestion / Skill() / subagent_type transforms
- [x] Phase 5: Polish & Ship (3/3 plans) — lazy-load, install consolidation, CI + provenance publish, E2E smokes
- [x] Phase 6: Workflow Runtime Fidelity (3/3 plans) — path rewriting, code-fence Skill() transform, `gsd_query` SDK bridge

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) · Phase artifacts: [milestones/v1.0-phases/](milestones/v1.0-phases/)

</details>

### 🚧 v2.0 Runtime Refactor (Phases 7-13)

**Direction:** Path B — keep gsd-core as canonical prompts source; replace SDK bridging with native TypeScript deep modules modeled after `open-gsd/gsd-pi`'s deep-module architecture.

**Why now:** Upstream SDK retirement (ADR-0174 / issue #504) + `bin/lib/*.cjs` collapse (issue #457) make `gsd_query`'s 91-route bridge unmaintainable. `--chain`/`--auto` execution requires runtime orchestration the LLM cannot reliably perform from prompts alone. gsd-pi proves the architectural pattern is viable.

#### Phase 7: Pi Runtime Spike + gsd-pi Module Mapping

**Goal:** Establish technical foundation — confirm how Pi delivers slash command arguments to workflow prompts, map gsd-pi's deep-module architecture to v2.0 surfaces, and surface upstream 1.2.0 changes that affect v2.0 design decisions.

**Requirements:** RUNTIME-01 (argv spike); supports STATE-03 / ORCH-01 architecture design; UPSTREAM-03 / UPSTREAM-04 (pre-assessment)

**Success criteria:**

- `.planning/phases/07-*/spike/pi-argv.md` documents the verified Pi argv-passing mechanism with reproducer
- `.planning/phases/07-*/spike/gsd-pi-module-map.md` enumerates which gsd-pi modules (ADR surface + file-level references) map to which v2.0 deep modules, with mirror / defer / N/A decisions
- `.planning/phases/07-*/spike/upstream-1.2.0-impact.md` catalogs 1.2.0 changes relevant to v2.0: `gsd-tools` CLI surface, `gsd_run` launcher, `DispatchLogger` seam, package rename impact lines — so Phase 8 upgrade can proceed without re-investigation
- Decision recorded: which gsd-pi modules to mirror in v2.0 vs defer to v2.1
- No production code changes — research/spike only

**Plans:** 1 plan

Plans:

- [ ] 07-01-PLAN.md — Three spike artifacts: pi-argv.md (verified $ARGUMENTS contract), gsd-pi-module-map.md (5-module mapping with mirror decisions), upstream-1.2.0-impact.md (API surface catalog for Phase 8 migration)

#### Phase 8: Upstream 1.2.0 Upgrade + Package Rename

**Goal:** Execute the migration identified by Phase 7's upstream impact analysis — rename package references and decouple from retired SDK artifacts before any v2.0 module work begins.

**Requirements:** UPSTREAM-01, UPSTREAM-02, UPSTREAM-03, MIGRATE-02

**Success criteria:**

- `src/official.ts` `OFFICIAL_PACKAGE_NAME` changed to `@opengsd/gsd-core`; all callers (`src/generator.ts`, `src/rewrite-workflow-paths.ts`, `src/gsd-query-tool.ts`, comments, test fixtures) updated
- `package.json` dependency updated to `@opengsd/gsd-core@1.2.0`; `npm install` succeeds
- `$GSD_SDK` transforms in `src/prompt-transform.ts` updated to new bridge surface (gsd-tools CLI or gsd_run launcher)
- `src/gsd-query-tool.ts` SDK `sdk/dist/query` import path removed or whole file deleted
- `npm run check` green (typecheck + test + build + doctor)

**Plans:** 4 plans

Plans:

- [ ] 08-01-PLAN.md — Rename project `pi-gsd-redux` → `pi-gsd-core` across package.json, README, CLAUDE.md, CLI usage, CI workflow
- [ ] 08-02-PLAN.md — Migrate upstream dependency `@opengsd/get-shit-done-redux@1.1.0` → `@opengsd/gsd-core@1.2.0`, update all fixtures, comments, and constants
- [ ] 08-03-PLAN.md — Retire `$GSD_SDK` Pi-tool bridge: delete `src/gsd-query-tool.ts`, remove `transformGsdSdkCommands` + tests, update CLAUDE.md
- [ ] 08-04-PLAN.md — Add `transformGsdRunLauncher` pure transform for Pi runtime, regenerate 1.2.0 artifacts, add doctor `GSD_AUDIT=1` tip and release notes

#### Phase 9: Auto Orchestration Native Module

**Goal:** Own the `--auto` and `--chain` execution loop in native TypeScript. Replace LLM-prompt-driven orchestration with explicit Unit dispatch + lifecycle journaling.

**Requirements:** ORCH-01, ORCH-02, ORCH-03, RUNTIME-03

**Success criteria:**

- `src/orchestrator/` module exposes `start(sessionContext)`, `advance()`, `resume()`, `stop(reason)`, `getStatus()` (per gsd-pi ADR-014 surface)
- `--auto` and `--chain` execute Plan → Execute → Verify → Closeout cycle without per-step LLM prompt reminders
- STATE.md (or sibling) records lifecycle transitions enabling cross-session resume
- `AUTO_MODE_CHECKLIST` injection at `src/prompt-transform.ts:917` removed
- Integration test: full `--chain` cycle succeeds on a fixture project without LLM-side orchestration prompts

**Plans:** 3/3 plans complete

#### Phase 10: State Reconciliation Module

**Goal:** Replace `gsd_query` SDK bridge for all `.planning/` state operations with a native idempotent reconciliation module.

**Requirements:** STATE-01, STATE-02, STATE-03

**Success criteria:**

- `src/state-reconciliation/` exposes `reconcileBeforeDispatch(basePath)` returning reconciled state or typed `blockers: string[]`
- Drift catalog covers known cases: sketch flag, completion timestamps, roadmap divergence, stale worker, unregistered milestone
- Each drift kind has an idempotent repair tested via fixtures (DB+disk state in, reconciled state out)
- `ReconciliationFailedError` flows to Recovery Classification (Phase 11)
- Auto Orchestration (Phase 9) calls `reconcileBeforeDispatch` before every dispatch — no more direct `gsd_query` from orchestration code

**Plans:** 2

#### Phase 11: Worktree Safety + Recovery Classification

**Goal:** Two paired modules — fail-closed worktree validation for source-writing Units + typed failure taxonomy for recovery decisions.

**Requirements:** WTREE-01, WTREE-02, RECOV-01, RECOV-02

**Success criteria:**

- `src/worktree-safety/prepareUnitRoot(unitType, unitId)` returns valid root or typed `worktree-invalid` Recovery decision (no silent degradation)
- Validation covers: `.git` exists, branch matches expected, lease ownership current, `GSD_PROJECT_ROOT` match
- `src/recovery/classifyFailure(input)` returns one of 8 explicit classes (no `other`)
- Each class maps to exactly one action: `retry` / `pause-with-remediation` / `self-heal` / `stop`
- Telemetry exit reasons use the same taxonomy
- Table-driven tests cover every known v1.0 triage failure family

**Plans:** 2

#### Phase 12: Tool Contract + Settings Bridge

**Goal:** Compile per-Unit tool / prompt / policy / schema contract before dispatch + bridge GSD settings.json into Pi prompt context.

**Requirements:** CONTRACT-01, CONTRACT-02, SETTINGS-01, SETTINGS-02

**Success criteria:**

- `src/tool-contract/` compiles a contract per Unit type with: prompt obligations, allowed tools, schema enum values, validation requirements, closeout tools
- Auto Orchestration (Phase 9) gates dispatch through the contract
- Planner tools (where applicable) reject invalid inputs upfront
- Parity tests cover prompt / policy / schema drift detection
- Pi extension surfaces current GSD settings.json (workflow toggles, model profile) in prompt context at session start
- `gsd:settings` workflow writes to the same location extension reads from; Pi notifies on change

**Plans:** 2

#### Phase 13: SDK Bridge Retirement + v2.0 Release

**Goal:** Fully decouple from upstream binary interfaces. Ship v2.0 with all SDK imports retired and migration guide complete.

**Requirements:** RUNTIME-02, MIGRATE-01, MIGRATE-03, MIGRATE-04

**Success criteria:**

- Zero imports of `@opengsd/get-shit-done-redux/sdk/dist/query/*.js` in `src/`
- Build succeeds with the upstream `sdk/` directory absent
- `gsd_query` Pi tool either deleted or kept as warn-and-shim with deprecation message (final decision in plan-phase)
- `doctor` verifies v2.0 modules wired; SDK presence check removed
- Migration guide in `docs/MIGRATION-v2.md` covers external `gsd_query` callers
- `package.json` bumped to 2.0.0; CHANGELOG updated; publish workflow tested

**Plans:** 2 (deprecation cycle, then deletion + release)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|---|---|---|---|---|
| 1. Core Adapter | v1.0 | 1/1 | Complete | 2026-05-29 |
| 2. Model Routing | v1.0 | 1/1 | Complete | 2026-05-29 |
| 3. Subagent Stability | v1.0 | 3/3 | Complete | 2026-05-29 |
| 4. Workflow Fidelity | v1.0 | 2/2 | Complete | 2026-05-30 |
| 5. Polish & Ship | v1.0 | 3/3 | Complete | 2026-05-30 |
| 6. Workflow Runtime Fidelity | v1.0 | 3/3 | Complete | 2026-05-30 |
| 7. Pi Runtime Spike + Module Mapping | v2.0 | 0/1 | Planned | — |
| 8. Upstream 1.2.0 Upgrade + Package Rename | v2.0 | 0/4 | Not started | — |
| 9. Auto Orchestration Module | v2.0 | 3/3 | Complete   | 2026-06-01 |
| 10. State Reconciliation Module | v2.0 | 0/2 | Not started | — |
| 11. Worktree Safety + Recovery Classification | v2.0 | 0/2 | Not started | — |
| 12. Tool Contract + Settings Bridge | v2.0 | 0/2 | Not started | — |
| 13. SDK Retirement + v2.0 Release | v2.0 | 0/2 | Not started | — |
