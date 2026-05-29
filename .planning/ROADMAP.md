# pi-gsd-redux Roadmap

## Phase 1: Core Adapter

**Status:** ✅ Complete

- Agent sync with CRLF-safe frontmatter generation
- Prompt and agent generation from upstream package
- `/gsd:xxx` → `/gsd-xxx` slash reference normalization (agent bodies, descriptions, runtime messages)
- Doctor and sync CLI commands
- Runtime message rewriting via `context` and `message_end` hooks

## Phase 2: Model Routing

**Status:** 🔄 In Progress

- `/gsd-models` interactive slash command
  - Project vs user scope selection
  - Inherit current Pi model mode
  - Balanced tier mapping (haiku/sonnet/opus → local Pi models)
  - Per-agent override mode
- Write upstream-compatible `.planning/config.json` and `~/.gsd/defaults.json`
- README documentation for model routing

## Phase 3: Polish & Release

**Status:** 🔲 Not Started

- npm publish with security-key 2FA workflow
- Pi package catalog listing
- End-to-end smoke test in fresh Pi session
- Post-publish verification checklist