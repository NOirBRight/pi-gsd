---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Runtime Refactor
status: Ready to plan
last_updated: "2026-06-02T04:12:53.603Z"
last_activity: 2026-06-02
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 16
  completed_plans: 16
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02 after Phase 11 verification)

**Core value:** Pi adapter for Get Shit Done (GSD) — transparent upstream compatibility on content axis; native Pi orchestration on runtime axis (v2.0 direction)
**Current focus:** Phase 12 — Tool Contract + Settings Bridge

## Current Position

Milestone: v2.0 Runtime Refactor (executing)
Phase: 12
Plan: Not started
Last activity: 2026-06-02

Progress: [██████████████░░░░░░] 71% (5/7 phases completed, 16/16 completed plans so far) — Phase 12 is next

## Accumulated Context

### Strategic Direction (carried from v1.0 close)

**Path B (selected over A and C):** Keep gsd-core as canonical prompts source; replace runtime SDK/CJS bridging with native TS orchestration modules modeled after `open-gsd/gsd-pi`'s deep-module architecture.

**Anchor modules to design (gsd-pi-inspired):**

- Auto Orchestration — own `--chain`/`--auto` loop in TS
- State Reconciliation — `.planning/` drift detection + idempotent repair
- Worktree Safety — fail closed on invalid roots
- Recovery Classification — typed failure → action
- Tool Contract — per-unit prompt/policy/schema parity
- Settings Bridge — GSD settings.json → Pi prompt context

### Key Decisions

| ID | Decision | Outcome | Status |
|---|---|---|---|
| D-12 | Pin upstream to 1.1.0 | v1.0 stable surface; lifted in Phase 8 to `@opengsd/gsd-core@1.2.0` | ✓ Superseded |
| D-25 | 1.2.0 upgrade placed as Phase 8 (before core modules) | Phase 8 completed; v2.0 modules now target real 1.2.0 interface | ✓ Done |
| D-26 | Settings bridge as standalone module, not lumped into State Reconciliation | P1 (LLM doesn't see settings) is independent of orchestration; parallelizable | → Phase 12 |
| D-27 | Phase 7 spike includes upstream 1.2.0 impact analysis as 3rd artifact | Phase 8 executed from known changeset — no re-investigation | ✓ Done |
| D-28 | gsd-pi module mapping anchored on ADR surface + file-level references to packages/daemon/src (not extensions/gsd/) | v1.0.2 actual layout differs from ROADMAP draft paths | ✓ Done |
| D-29 | Rename project `pi-gsd-redux` → `pi-gsd-core` alongside upstream package rename | Adapter name aligns with upstream `@opengsd/gsd-core` family | ✓ Done |
| D-30 | Delete `src/gsd-query-tool.ts` entirely in Phase 8 | Upstream 1.2.0 emits `gsd_run`, not `$GSD_SDK`; Pi tool bridge had zero callers | ✓ Done |
| D-31 | Delete `transformGsdSdkCommands` + 4 `$GSD_SDK` regex in Phase 8 | 1.2.0 source workflows do not contain `$GSD_SDK` tokens; transform had zero match targets | ✓ Done |
| D-33 | New `transformGsdRunLauncher` prepends `require.resolve`-based fallback-0 to upstream's inline 4-fallback launcher block | Pi npm-install users can locate `gsd-tools.cjs` under `node_modules/` | ✓ Done |
| D-37 | DispatchLogger not auto-enabled in Phase 8; add doctor `GSD_AUDIT=1` tip only | Respects upstream opt-in default; orchestrator-scoped audit is Phase 9's job | ✓ Done |
| D-39 | Phase 8 split into 4 logical-layer commits: rename → package migration → bridge retirement → launcher transform | Logical wave summaries exist; final integration includes review fixes | ✓ Done |

### Carried Tech Debt from v1.0

- `AUTO_MODE_CHECKLIST` prompt injection (`src/prompt-transform.ts`) was retired in Phase 9; native orchestration now owns `--auto`/`--chain` control flow.
- `--chain`/`--auto` argv passing from Pi slash command to workflow prompt was diagnosed in Phase 7 and closed in Phase 9 by registering native Pi command handoff seams.
- Remaining `gsd-tools.cjs` usage is a Phase 8 stopgap launcher for workflow compatibility, not the v2.0 target architecture.

### Resolved at Phase 8 Close

- D-12 pin lifted: `@opengsd/get-shit-done-redux@1.1.0` → `@opengsd/gsd-core@1.2.0`
- D-30: `gsd_query` Pi-tool bridge deleted
- D-31: `transformGsdSdkCommands` + `$GSD_SDK` regex patterns deleted
- D-33: `transformGsdRunLauncher` added for Pi runtime `node_modules/` path resolution
- D-37: DispatchLogger surfaced via `doctor` `GSD_AUDIT=1` tip only (not auto-enabled)
- CR-01: code-fenced `general-purpose` Agent dispatch normalized to Pi `general`
- CR-02: doctor can validate generated workflows via `--workflows`
- WR-01: mixed already-transformed `ask_user_question` + raw `AskUserQuestion(...)` documents are handled
- WR-02: publishing docs no longer recommend passing npm tokens directly on the command line

## Next Steps

1. **Plan Phase 12: Tool Contract + Settings Bridge**
   - Compile per-Unit tool / prompt / policy / schema contracts before dispatch.
   - Gate native auto orchestration through the compiled contract.
   - Bridge GSD `settings.json` into Pi prompt context and notify on changes.
2. Keep Phase 11 closeout artifacts as evidence:
   - `.planning/phases/11-worktree-safety-recovery-classification/11-VERIFICATION.md`
   - `.planning/phases/11-worktree-safety-recovery-classification/11-REVIEW.md`
   - `.planning/phases/11-worktree-safety-recovery-classification/11-UAT.md`
   - `.planning/phases/11-worktree-safety-recovery-classification/11-SECURITY.md`
3. Before release, run ship/preflight and ensure generated artifacts remain synced after any final version bump.
