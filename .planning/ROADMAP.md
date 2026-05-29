# pi-gsd-redux Roadmap

## Phase 1: Core Adapter

**Status:** ✅ Complete

- Agent sync with CRLF-safe frontmatter generation
- Prompt and agent generation from upstream package
- `/gsd:xxx` → `/gsd-xxx` slash reference normalization (agent bodies, descriptions, runtime messages)
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

## Phase 3: Polish & Release

**Status:** 🔲 Not Started

- npm publish with security-key 2FA workflow
- Pi package catalog listing
- End-to-end smoke test in fresh Pi session
- Post-publish verification checklist