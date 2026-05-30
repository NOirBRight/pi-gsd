# pi-gsd-redux Roadmap

## Phase 1: Core Adapter

**Status:** ✅ Complete

- Agent sync with CRLF-safe frontmatter generation
- Prompt and agent generation from upstream package
- `/gsd-xxx` → `/gsd-xxx` slash reference normalization (agent bodies, descriptions, runtime messages)
- Doctor and sync CLI commands
- Runtime message rewriting via `context` and `message_end` hooks

## Phase 2: Model Routing

**Status:** ✅ Complete

- `/gsd-models` interactive slash command
  - Global vs Project scope selection
  - All 5 upstream profiles (Inherit, Quality, Balanced, Budget, Adaptive)
  - Profile-first flow: select profile → pick models per tier
  - Tabbed single-level model selector (SCOPED / ALL)
  - Clear (use Global) option for project scope
  - ✓ checkmark on current model, alphabetical order preserved
- Write upstream-compatible `.planning/config.json` and `~/.gsd/defaults.json`
- 180 tests covering pure helpers, UI helpers, command flow, and integration

## Phase 3: Subagent Stability

**Status:** ✅ Complete

**Goal:** Fix pi-subagents EPERM crash on Windows ACL-corrupted temp dirs, ensure fallback paths propagate, and eliminate shared-directory race conditions between concurrent Pi processes

**Requirements:** D-01, D-02, D-03, D-04

**Plans:** 3/3 plans complete + follow-up fixes

Plans:

- [x] 03-01-PLAN.md — Author upstream PR with EPERM catch + fallback and DIRS mutable container
- [x] 03-02-PLAN.md — Add interim EPERM guard to pi-gsd-redux extension + ACL check to doctor
- [x] 03-03-PLAN.md — Post-fix regression verification + /gsd-models manual test

Follow-up fixes (Phase 3.5):

- [x] Switch dependency to fork via npm overrides (PR #232 still open/unmerged)
- [x] WR-01: Guard only repairs on EACCES/EPERM, not all accessSync errors
- [x] WR-02: Consume `__piSubagentsTempAclBroken` flag and warn user on session_start
- [x] WR-03: Doctor reports ok:false for missing temp dirs (ENOENT)
- [x] WR-04: Escape PowerShell username in ACL repair command
- [x] Document timing gap resolution via fork EPERM fallback
- [x] Deduplicate guard tests into eperm-guard.test.ts
- [x] Session-scoped temp directories (fork: `feat/session-scoped-temp-dirs`) — eliminates cross-process race conditions

- Fix pi-subagents EPERM: fork's `ensureAccessibleDir` catches EPERM/EACCES with pid-scoped fallback
- ES module read-only binding: solved via DIRS mutable container in fork
- Shared-directory race conditions: solved via session-scoped temp directories (`updateDirsForSession`)
- 4 code review warnings (WR-01 to WR-04) fixed
- `/gsd-models` and agent sync verified working after all fixes

## Phase 4: Workflow Fidelity

**Status:** 🔲 Planning Complete

**Goal:** Ensure GSD workflow slash commands execute correctly in Pi by adapting AskUserQuestion, Skill(), and subagent dispatch to Pi runtime conventions

**Requirements:** D-01, D-02, D-03, D-04, D-05

**Plans:** 2 plans

Plans:

- [ ] 04-01-PLAN.md — Add AskUserQuestion, Skill(), and subagent_type transformations with tests
- [ ] 04-02-PLAN.md — Add rpiv-ask-user-question doctor check and peer dependency

- Diagnose and fix GSD workflow execution fidelity — `--chain`/`--auto` and plan-check/code-review revision loops don't execute fully
- Integrate `@juicesharp/rpiv-ask-user-question` dependency verification into doctor command
- Verify ask-user-question API compatibility with GSD's AskUserQuestion calling conventions

## Phase 5: Polish & Ship

**Status:** 🔲 Not Started

- Reduce TUI verbosity on workflow startup (1800-line upstream workflows injected via @execution_context)
- Single-command install: consolidate `pi install npm:pi-gsd-redux` + `pi install npm:pi-subagents` + `sync-agents` into one step
- npm publish with security-key 2FA workflow
- Pi package catalog listing
- End-to-end smoke test in fresh Pi session
- Post-publish verification checklist