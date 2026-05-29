# pi-gsd-redux

## Summary

Pi adapter for Get Shit Done (GSD) — an upstream-compatible extension that generates, transforms, and synchronizes GSD prompts and agents for the Pi coding agent runtime. Bridges upstream GSD (designed for Claude Code) to Pi's extension API, slash commands, and subagent system.

## Goals

- Transparent upstream compatibility: re-generate from `@opengsd/get-shit-done-redux` without forking
- Runtime slash command rewriting (`/gsd:xxx` → `/gsd-xxx`)
- Agent frontmatter normalization (CRLF-safe, Pi-compatible)
- Interactive model routing: `/gsd-models` command maps upstream model tiers to local Pi models
- Doctor and sync tooling for agent lifecycle management

## Non-Goals

- Forking or modifying upstream GSD source
- Building a separate project management framework
- Supporting non-Pi runtimes

## Stack

- TypeScript, Vitest, Node.js CLI
- Pi extension API (`registerCommand`, `on`, `ctx.ui`, `ctx.modelRegistry`)
- `@opengsd/get-shit-done-redux` (upstream prompt/agent source)
- `pi-subagents` (agent discovery and frontmatter parsing)