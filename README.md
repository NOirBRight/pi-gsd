# pi-gsd-redux

Pi adapter for official Open GSD (`@opengsd/get-shit-done-redux`).

This package keeps official GSD as canonical. It generates Pi prompt templates and Pi-compatible GSD agent definitions from the installed official package.

## Install

Install this package as a Pi package, then install `pi-subagents` as a Pi package so the `subagent` tool is available:

```bash
pi install npm:pi-gsd-redux
pi install npm:pi-subagents
npx pi-gsd-redux sync-agents --scope user
```

If you want the helper CLI available without `npx`, install it globally too:

```bash
npm install -g pi-gsd-redux
pi-gsd-redux sync-agents --scope user
```

For local development from this repository:

```bash
npm install
npm run build
node dist/cli.js generate --cwd .
node dist/cli.js sync-agents --scope user
pi install -l .
pi install npm:pi-subagents
```

## Generate Official Resources

```bash
npm run build
node dist/cli.js generate --cwd .
```

This writes:

- `generated/prompts/` for Pi prompt templates such as `/gsd-plan-phase`
- `generated/agents/` for Pi-compatible GSD agent definitions

## Sync GSD Agents For pi-subagents

Project-local sync is recommended:

```bash
npx pi-gsd-redux sync-agents --scope project
```

This writes generated GSD agents into `.pi/agents/`, where `pi-subagents` can discover them.

User-level sync is also supported when you want the same GSD agents available across projects:

```bash
npx pi-gsd-redux sync-agents --scope user
```

Safety behavior:

- `pi-gsd-redux` only writes official `gsd-*.md` agent files.
- Existing files without the `pi-gsd generated agent` marker are not overwritten.
- Extra user files are not deleted.

## Doctor

```bash
npx pi-gsd-redux doctor
```

Doctor checks official package resolution, `pi-subagents` dependency resolution, and generated prompt drift.

To also check generated agents and project `.pi/agents` sync status:

```bash
npx pi-gsd-redux doctor --agents
```

For user-level synced agents:

```bash
npx pi-gsd-redux doctor --agents --scope user
```

If project agents have not been synced yet, this check reports missing synced agents. Run `npx pi-gsd-redux sync-agents --scope project` when you want the project-local `.pi/agents` files materialized.

## Configure GSD Subagent Model Routing

Use `/gsd-models` inside Pi to configure how upstream GSD model profiles map to local Pi models.

The command shows your current profile and lets you choose:

1. **Inherit** — all GSD agents use your current Pi model. Best for non-Anthropic providers. No further selection needed.
2. **Quality** — map the `heavy` tier to a strong model, `standard` and `light` follow automatically.
3. **Balanced** — pick separate Pi models for `heavy`, `standard`, and `light` tiers.
4. **Budget** — same tier picker, optimized for cost.
5. **Adaptive** — same tier picker, role-based optimization.

Scoped models (from your `enabledModels` list) appear first in the model selector. Scope flags:

- `--project` or no argument: write `.planning/config.json` (default, project-level)
- `--user`: write `~/.gsd/defaults.json` (user-level, applies across projects)

Upstream tier mapping:

| Tier | Agents | Example |
|------|--------|---------|
| heavy | gsd-planner, gsd-roadmapper, gsd-debugger | Planning & architecture |
| standard | gsd-executor, gsd-verifier, gsd-doc-writer | Execution & research |
| light | gsd-codebase-mapper, gsd-plan-checker | Mapping, scanning, audits |

## Update Official GSD

Maintainers should follow the full publishing runbook in [Publishing and Update Runbook](docs/PUBLISHING.md).

```bash
npm update @opengsd/get-shit-done-redux
npm run build
node dist/cli.js generate --cwd .
node dist/cli.js sync-agents --scope project
npm run check
```
