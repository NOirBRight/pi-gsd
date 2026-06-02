# pi-gsd-core

Pi adapter for official Open GSD (`@opengsd/gsd-core`).

This package keeps official GSD as canonical. It generates Pi prompt templates and Pi-compatible GSD agent definitions from the installed official package.

## Install

Install this package as a Pi package, then install `pi-subagents` as a Pi package so the `subagent` tool is available:

```bash
pi install npm:pi-gsd-core
pi install npm:pi-subagents
npx pi-gsd-core sync-agents --scope user
```

If you want the helper CLI available without `npx`, install it globally too:

```bash
npm install -g pi-gsd-core
pi-gsd-core sync-agents --scope user
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
npx pi-gsd-core sync-agents --scope project
```

This writes generated GSD agents into `.pi/agents/`, where `pi-subagents` can discover them.

User-level sync is also supported when you want the same GSD agents available across projects:

```bash
npx pi-gsd-core sync-agents --scope user
```

Safety behavior:

- `pi-gsd-core` only writes official `gsd-*.md` agent files.
- Existing files without the `pi-gsd generated agent` marker are not overwritten.
- Extra user files are not deleted.

## Doctor

```bash
npx pi-gsd-core doctor
```

Doctor checks official package resolution, `pi-subagents` dependency resolution, and generated prompt drift.

To also check generated agents and project `.pi/agents` sync status:

```bash
npx pi-gsd-core doctor --agents
```

For user-level synced agents:

```bash
npx pi-gsd-core doctor --agents --scope user
```

If project agents have not been synced yet, this check reports missing synced agents. Run `npx pi-gsd-core sync-agents --scope project` when you want the project-local `.pi/agents` files materialized.

## Configure GSD Subagent Model Routing

Use `/gsd-models` inside Pi to configure how upstream GSD model profiles map to local Pi models.

### Flow

1. **Select scope** — `Global` (all projects) or `Project` (this project only)
2. **Select profile** — choose a GSD model routing strategy
3. **Pick models** — for each tier the profile requires, choose a Pi model

### Profiles

| Profile | Tiers to configure | Description |
|---------|--------------------|-------------|
| Inherit | None | All agents use Pi's current session model. No further selection needed. |
| Quality | Heavy + Standard | Strong model for most agents, lighter for verification |
| Balanced | Heavy + Standard + Light | Separate models for planning, execution, and scanning |
| Budget | Standard + Light | Cost-optimized — critical agents get standard, rest get light |
| Adaptive | Heavy + Standard + Light | Role-based routing — heavy for planning/debug, standard for execution, light for audits |

When scope is **Project**, an additional **Clear (use Global)** option removes the project config and falls back to global defaults.

### Model Selector

The model selector displays a flat alphabetical list with **Tab** switching:

- **SCOPED** — models from your `enabledModels` list
- **ALL** — all models with configured auth

The currently assigned model is marked with `✓`. Press **Esc** at any step to keep the current value.

### Scope Flags

Pass a flag to skip the scope selector:

- `--project` or no argument: write `.planning/config.json` (default)
- `--global`: write `~/.gsd/defaults.json` (all projects)

### What Gets Written

The command writes an upstream-compatible config:

- **Project**: `.planning/config.json` in the current project
- **Global**: `~/.gsd/defaults.json` in your home directory

Example `.planning/config.json` for balanced profile:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-planner": "openai-codex/gpt-5.5",
    "gsd-eval-planner": "openai-codex/gpt-5.5",
    "gsd-executor": "ollama-cloud/glm-5.1",
    "gsd-codebase-mapper": "openai-codex/gpt-5.3-codex-spark"
  }
}
```

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
npm update @opengsd/gsd-core
npm run build
node dist/cli.js generate --cwd .
node dist/cli.js sync-agents --scope project
npm run check
```
