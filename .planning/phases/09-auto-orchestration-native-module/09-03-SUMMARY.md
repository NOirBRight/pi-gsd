---
phase: 09-auto-orchestration-native-module
plan: 03
subsystem: orchestration
tags: [typescript, vitest, auto-orchestration, cli, dispatch]

requires:
  - phase: 09-auto-orchestration-native-module
    provides: 09-01 orchestration kernel and 09-02 journaling/resume seams
provides:
  - Native dispatch adapter seam with scoped GSD_AUDIT=1
  - CLI `orchestrate` command surface for auto/chain/resume/status/stop operations
  - Public package export for orchestrator API
  - RUNTIME-03 removal evidence for obsolete auto-mode checklist markers
  - Fixture/unit coverage for native chain orchestration seams

affects: [phase-10-state-reconciliation, phase-11-worktree-safety, phase-12-tool-contract]

tech-stack:
  added: []
  patterns: [typed Unit dispatch payloads, injectable runner seam, CLI service facade]

key-files:
  created:
    - src/orchestrator/dispatch.ts
    - src/orchestrator/trigger.ts
  modified:
    - src/orchestrator/index.ts
    - src/cli.ts
    - src/index.ts
    - src/prompt-transform.ts
    - src/generator.ts
    - tests/orchestrator.test.ts
    - tests/cli.test.ts
    - tests/prompt-transform.test.ts
    - tests/e2e/workflow-fidelity.test.ts
    - tests/e2e/orchestrator-chain.test.ts

key-decisions:
  - "Dispatch remains behind an injectable runner seam; Phase 9 does not hard-code a Pi subagent process bridge."
  - "Orchestrator-owned child dispatch scopes audit with `GSD_AUDIT=1` and deliberately does not set `GSD_AUDIT_ARGS`."
  - "The obsolete `AUTO_MODE_CHECKLIST` / `pi_auto_mode_fidelity` prompt workaround is removed; native gates now provide the auditable control."
  - "Recovery work was performed in `D:/Workstation/pi-gsd-replay-20260601-083715` after the original checkout was lost; verification evidence is from the recovered tree."

patterns-established:
  - "CLI `orchestrate` is a thin service facade that parses explicit flags instead of relying on prompt `$ARGUMENTS`."
  - "Dispatch payloads carry typed `OrchestrationUnit` metadata and avoid passing raw workflow prompt text."
  - "Fixture chain coverage validates Plan → Execute → Verify → Closeout through native seams without LLM-side auto-mode reminders."
---

# Summary: Plan 09-03 — Dispatch/CLI Integration + Checklist Retirement

## What Changed

- Added/finished `src/orchestrator/dispatch.ts` with:
  - `resolveUnitDispatchTarget()` for Plan/Execute/Verify/Closeout Unit targets.
  - `dispatchUnit()` and `createDispatchAdapter()` injectable seams.
  - Scoped child environment `{ GSD_AUDIT: "1" }` for orchestrator-owned dispatch.
  - No `GSD_AUDIT_ARGS` assignment.
- Added/finished `src/orchestrator/trigger.ts` for native auto/chain trigger detection and handoff creation.
- Added CLI `orchestrate` command surface in `src/cli.ts` with:
  - `--auto`, `--chain`, `--resume`, `--status`, `--stop <reason>`, `--phase <phase>`, `--cwd <path>`.
  - Production loop calls `advance()` until settled and persists journal/digest state.
  - Dispatch fails closed unless `PI_GSD_DISPATCH_COMMAND` is supplied, then sends typed Unit/snapshot/target JSON to that command with scoped `GSD_AUDIT=1`.
  - Invalid `--stop` without a reason returns exit code 2.
- Exported orchestrator API from `src/index.ts` via `export * from "./orchestrator/index.js";`.
- Removed retired SDK/checklist assumptions in recovered code paths and updated tests for gsd-core 1.2.0 surfaces.
- Updated workflow fidelity test expectations so generated workflows do not require retired `gsd_query` calls.

## Verification Run

- `npx vitest run tests/e2e/orchestrator-chain.test.ts tests/orchestrator.test.ts tests/orchestrator-settings.test.ts tests/orchestrator-journal.test.ts tests/cli.test.ts tests/prompt-transform.test.ts` — passed: 5 files, 90 tests.
- `npm run typecheck` — passed.
- `npm test` — passed: 24 files, 309 tests.
- `npm run build` — passed.

## Source Assertions Checked

- `src/index.ts` contains `export * from "./orchestrator/index.js";`.
- `src/cli.ts` usage contains `orchestrate (--auto|--chain|--resume|--status|--stop <reason>) --phase <phase> [--cwd <dir>]`.
- `src/orchestrator/dispatch.ts` exports `dispatchUnit` and sets `GSD_AUDIT: "1"`.
- `src/cli.ts` wires journal, state digest, dispatch adapter, and `runUntilSettled()` for `orchestrate --auto/--chain`.
- `tests/e2e/orchestrator-chain.test.ts` exists and passes with dispatch producing artifacts during execution.
- `09-REVIEW.md` status is `passed` with zero findings; `09-VERIFICATION.md` status is `passed` with score `5/5`.
- `grep -R "pi_auto_mode_fidelity\|AUTO_MODE_CHECKLIST\|injectAutoModeChecklist" src tests generated | grep -v "RUNTIME-03" | grep -v "does not contain"` produced no matches.
- `grep -n "from \"node:fs\"\|from \"node:path\"\|from \"node:os\"" src/prompt-transform.ts` produced no matches.

## Deviations / Recovery Notes

- The original `D:/Workstation/pi-gsd` checkout became unusable after the 09-03 subagent returned; it contained only `node_modules/` and no `.git`.
- Recovery was performed by cloning `https://github.com/NOirBRight/pi-gsd.git` into `D:/Workstation/pi-gsd-replay-20260601-083715`, replaying recoverable session edits, then repairing compile/test failures.
- Because this is a recovered dirty tree, no new git commits were created during this recovery continuation. Commit sequencing should be reviewed before preserving the recovered work.

## Self-Check: PASSED

- Phase 09 Plan 03 observable behavior is present in source and tests.
- Targeted and full available test suites pass in the recovered tree.
- Build and typecheck pass.
- Remaining risk is repository-history fidelity, not current source/test validity.
