# pi-gsd-core

## Summary

Pi adapter for Get Shit Done (GSD) — an upstream-compatible extension that generates, transforms, and synchronizes GSD prompts and agents for the Pi coding agent runtime. Bridges upstream GSD (designed for Claude Code) to Pi's extension API, slash commands, and subagent system.

## Goals

- Transparent upstream compatibility: re-generate from `@opengsd/gsd-core` without forking
- Runtime slash command rewriting (`/gsd:xxx` → `/gsd-xxx`)
- Agent frontmatter normalization (CRLF-safe, Pi-compatible)
- Interactive model routing: `/gsd-models` command maps upstream model tiers to local Pi models
- Doctor and sync tooling for agent lifecycle management
- AskUserQuestion, Skill(), and subagent_type runtime transformations for Pi compatibility
- rpiv-ask-user-question peer dependency verification in doctor
- Native v2.0 orchestration safety: generated-first Tool Contracts plus upstream-compatible Settings Bridge context injection

---
*Last updated: 2026-06-02 after Phase 12 closeout*

## Non-Goals

- Forking or modifying upstream GSD source
- Building a separate project management framework
- Supporting non-Pi runtimes

## Stack

- TypeScript, Vitest, Node.js CLI
- Pi extension API (`registerCommand`, `on`, `ctx.ui`, `ctx.modelRegistry`)
- `@opengsd/gsd-core` (upstream prompt/agent source)
- `pi-subagents` (agent discovery and frontmatter parsing)
