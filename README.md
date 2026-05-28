# pi-gsd

Pi adapter for official Open GSD (`@opengsd/get-shit-done-redux`).

This package keeps official GSD as canonical. It generates Pi prompt templates and Pi-compatible GSD agent definitions from the installed official package.

## Install

Install this package as a Pi package, then install `pi-subagents` as a Pi package so the `subagent` tool is available:

```bash
pi install npm:pi-gsd
pi install npm:pi-subagents
```

For local development from this repository:

```bash
npm install
npm run build
node dist/cli.js generate --cwd .
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
pi-gsd sync-agents --scope project
```

This writes generated GSD agents into `.pi/agents/`, where `pi-subagents` can discover them.

Safety behavior:

- `pi-gsd` only writes official `gsd-*.md` agent files.
- Existing files without the `pi-gsd generated agent` marker are not overwritten.
- Extra user files are not deleted.

## Doctor

```bash
pi-gsd doctor
```

Doctor checks official package resolution, `pi-subagents` dependency resolution, and generated prompt drift.

To also check generated agents and project `.pi/agents` sync status:

```bash
pi-gsd doctor --agents generated/agents
```

If project agents have not been synced yet, this check reports missing synced agents. Run `pi-gsd sync-agents --scope project` when you want the project-local `.pi/agents` files materialized.

## Update Official GSD

```bash
npm update @opengsd/get-shit-done-redux
npm run build
node dist/cli.js generate --cwd .
pi-gsd sync-agents --scope project
npm run check
```
