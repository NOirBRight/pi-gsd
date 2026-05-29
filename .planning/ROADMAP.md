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

**Status:** 🔲 Planning Complete

**Goal:** Fix pi-subagents EPERM crash on Windows ACL-corrupted temp dirs and ensure fallback paths propagate to all consumer modules

**Requirements:** D-01, D-02, D-03, D-04

**Plans:** 3 plans

Plans:
- [ ] 03-01-PLAN.md — Author upstream PR with EPERM catch + fallback and DIRS mutable container
- [ ] 03-02-PLAN.md — Add interim EPERM guard to pi-gsd-redux extension + ACL check to doctor
- [ ] 03-03-PLAN.md — Post-fix regression verification + /gsd-models manual test

- Fix pi-subagents EPERM: `ensureAccessibleDir` doesn't catch `mkdirSync` EPERM, crashing Pi startup on ACL-corrupted temp dirs
- Work around ES module read-only binding for `RESULTS_DIR`/`ASYNC_DIR` — fallback paths can't propagate to consumer modules
- Evaluate fork vs upstream PR for structural fix vs monkey-patch vs startup cleanup
- Verify `/gsd-models` and agent sync work correctly after subagent fix

## Phase 4: Workflow Fidelity

**Status:** 🔲 Not Started

- Diagnose and fix GSD workflow execution fidelity — `--chain`/`--auto` and plan-check/code-review revision loops don't execute fully
- Integrate `@juicesharp/rpiv-ask-user-question` to provide AskUserQuestion tool that GSD workflows depend on
- Verify ask-user-question API compatibility with GSD's AskUserQuestion calling conventions

## Phase 5: Polish & Ship

**Status:** 🔲 Not Started

- Reduce TUI verbosity on workflow startup (1800-line upstream workflows injected via @execution_context)
- Single-command install: consolidate `pi install npm:pi-gsd-redux` + `pi install npm:pi-subagents` + `sync-agents` into one step
- npm publish with security-key 2FA workflow
- Pi package catalog listing
- End-to-end smoke test in fresh Pi session
- Post-publish verification checklist