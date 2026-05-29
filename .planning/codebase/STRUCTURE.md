# Codebase Structure

**Analysis Date:** 2026-05-29

## Directory Layout

```
pi-gsd-redux/
├── src/                  # TypeScript source for CLI, Pi extension, services, transforms, and resolvers
├── tests/                # Vitest test suite and official package fixtures
├── generated/            # Committed generated Pi prompts and generated Pi-compatible GSD agents
│   ├── prompts/          # Generated `/gsd-*` prompt markdown files
│   └── agents/           # Generated `gsd-*.md` agent definitions
├── dist/                 # Built ESM JavaScript and declaration files from `npm run build`
├── docs/                 # Maintainer documentation and planning/spec artifacts
├── scripts/              # PowerShell diagnostic/repair scripts for pi-subagents temp/lock issues
├── .pi/                  # Project-local Pi configuration and synced agents target
├── .gsd/                 # Local GSD runtime metadata/state
├── .planning/codebase/   # Codebase mapping documents
├── package.json          # Package metadata, scripts, dependencies, bin, exports, Pi config
├── package-lock.json     # npm lockfile
├── tsconfig.json         # TypeScript NodeNext strict compiler settings
├── vitest.config.ts      # Vitest configuration
├── README.md             # User-facing installation/generation/sync/doctor guide
└── LICENSE               # MIT license
```

## Directory Purposes

**`src/`:**
- Purpose: Source of truth for package behavior.
- Contains: Entry points, generation services, synchronization services, doctor checks, markdown transforms, package resolvers, runtime rewrites, and safety guards.
- Key files: `src/cli.ts`, `src/extension.ts`, `src/index.ts`, `src/generator.ts`, `src/agent-generator.ts`, `src/agent-sync.ts`, `src/doctor.ts`, `src/official.ts`, `src/safe-output.ts`.

**`tests/`:**
- Purpose: Vitest coverage for source modules and real official-package smoke behavior.
- Contains: `*.test.ts` files co-located by feature name plus shared fixture creation helpers.
- Key files: `tests/fixtures.ts`, `tests/cli.test.ts`, `tests/generator.test.ts`, `tests/agent-generator.test.ts`, `tests/agent-sync.test.ts`, `tests/doctor.test.ts`, `tests/smoke-real-official.test.ts`.

**`generated/prompts/`:**
- Purpose: Committed Pi prompt templates generated from official Open GSD command markdown.
- Contains: Markdown files named `gsd-<command>.md`, for example `generated/prompts/gsd-plan-phase.md` and `generated/prompts/gsd-execute-phase.md`.
- Key files: Generated artifacts only; modify generation code in `src/generator.ts` or `src/prompt-transform.ts`, then regenerate.

**`generated/agents/`:**
- Purpose: Committed Pi-compatible GSD agent definitions generated from the official package.
- Contains: Markdown files named `gsd-<agent>.md`, for example `generated/agents/gsd-planner.md`, `generated/agents/gsd-executor.md`, and `generated/agents/gsd-codebase-mapper.md`.
- Key files: Generated artifacts only; modify generation code in `src/agent-generator.ts` or `src/agent-transform.ts`, then regenerate/sync.

**`dist/`:**
- Purpose: Build output published by npm and loaded by Pi/runtime consumers.
- Contains: ESM `.js` chunks plus `.d.ts` declarations for `cli`, `extension`, and `index`.
- Key files: `dist/cli.js`, `dist/extension.js`, `dist/index.js`, `dist/cli.d.ts`, `dist/extension.d.ts`, `dist/index.d.ts`.

**`docs/`:**
- Purpose: Project documentation beyond README.
- Contains: Publishing/update runbook and nested superpowers planning/spec documents.
- Key files: `docs/PUBLISHING.md`, `docs/superpowers/plans`, `docs/superpowers/specs`.

**`scripts/`:**
- Purpose: Operational helper scripts.
- Contains: PowerShell scripts for diagnosing and repairing Pi subagents temporary/lock state.
- Key files: `scripts/diagnose-pi-subagents-locks.ps1`, `scripts/repair-pi-subagents-temp.ps1`.

**`.pi/`:**
- Purpose: Project-local Pi configuration and agent sync destination.
- Contains: `settings.json` and, when synced, `.pi/agents` files created by `syncAgents`.
- Key files: `.pi/settings.json`. Do not overwrite `.pi/agents/*.md` unless `src/agent-sync.ts` generated-marker rules allow it.

**`.planning/codebase/`:**
- Purpose: Current codebase maps consumed by planning/execution workflows.
- Contains: Architecture, structure, stack, integrations, conventions, testing, and concerns docs.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `src/cli.ts`: CLI binary implementation for `generate`, `doctor`, `sync-agents`, and `official` commands.
- `src/extension.ts`: Pi extension default export and runtime message rewrite helpers.
- `src/index.ts`: Public package export barrel.
- `package.json`: Declares `bin.pi-gsd-redux`, package `exports`, `main`, `types`, and Pi integration metadata.

**Configuration:**
- `package.json`: npm scripts, dependencies, package files, engines, bin, exports, and Pi extension/prompt paths.
- `tsconfig.json`: Strict TypeScript settings with `NodeNext` module/moduleResolution and source/test includes.
- `vitest.config.ts`: Test runner config with globals and `tests/**/*.test.ts` include pattern.
- `.gitignore`: Ignored local/dependency/build-adjacent files.
- `.pi/settings.json`: Project-local Pi settings.

**Core Logic:**
- `src/generator.ts`: Prompt and full resource generation orchestration.
- `src/agent-generator.ts`: Agent generation orchestration.
- `src/agent-sync.ts`: Generated agent synchronization and ownership checks.
- `src/doctor.ts`: Generated drift and dependency/sync health checks.
- `src/official.ts`: Official GSD package resolution and required path validation.
- `src/pi-subagents.ts`: `pi-subagents` package resolution.
- `src/prompt-transform.ts`: Prompt file naming, slash reference normalization, and subagent guidance injection.
- `src/agent-transform.ts`: Agent frontmatter/tool/body transformation and official root placeholder materialization.
- `src/frontmatter.ts`: Minimal frontmatter parser/writer used by prompt/agent transforms.
- `src/runtime-rewrites.ts`: Runtime path and slash-command rewrites for Pi messages.
- `src/safe-output.ts`: Guard against unsafe output directories before destructive generation.

**Testing:**
- `tests/*.test.ts`: Feature-aligned Vitest test files.
- `tests/fixtures.ts`: Creates temporary official package fixtures for resolver/generator/doctor tests.
- `tests/smoke-real-official.test.ts`: Smoke tests against the actual installed official package.
- `vitest.config.ts`: Test include pattern and timeout.

**Generated and Published Artifacts:**
- `generated/prompts`: Published prompt templates listed in `package.json` `files` and `pi.prompts`.
- `generated/agents`: Published generated agent definitions listed in `package.json` `files` and consumed by `sync-agents`.
- `dist`: Published build output listed in `package.json` `files`, `main`, `types`, `exports`, `bin`, and `pi.extensions`.

## Naming Conventions

**Files:**
- Source modules use kebab-case for multiword feature files: `src/agent-generator.ts`, `src/agent-sync.ts`, `src/prompt-transform.ts`, `src/runtime-rewrites.ts`, `src/safe-output.ts`.
- Single-concept source modules use lowercase nouns: `src/cli.ts`, `src/doctor.ts`, `src/extension.ts`, `src/frontmatter.ts`, `src/generator.ts`, `src/index.ts`, `src/official.ts`.
- Tests mirror source feature names with `.test.ts`: `tests/agent-sync.test.ts`, `tests/prompt-transform.test.ts`, `tests/runtime-rewrites.test.ts`.
- Generated prompt files use `gsd-<command>.md`: `generated/prompts/gsd-map-codebase.md`.
- Generated agent files use `gsd-<agent>.md`: `generated/agents/gsd-code-reviewer.md`.
- Built declaration and JavaScript entry files mirror entry source names in `dist`: `dist/cli.js`, `dist/extension.d.ts`, `dist/index.js`.

**Directories:**
- Runtime/source directories are short lowercase nouns: `src`, `tests`, `generated`, `dist`, `docs`, `scripts`.
- Generated resource subdirectories are plural nouns by resource type: `generated/prompts`, `generated/agents`.
- Hidden tool-state directories use dot prefixes and should not be treated as source: `.pi`, `.gsd`, `.planning`.

## Where to Add New Code

**New CLI command:**
- Primary code: Add parsing/dispatch in `src/cli.ts` and keep command-specific logic in a new or existing service module under `src/`.
- Tests: Add or extend `tests/cli.test.ts`; add a feature-specific test file such as `tests/<feature>.test.ts` when logic is substantial.
- Guidance: Keep `runCli` IO-testable through `CliIO`; return exit codes instead of calling `process.exit` except at the bottom-level entrypoint in `src/cli.ts`.

**New generation behavior:**
- Primary code: Add orchestration in `src/generator.ts` for prompts or `src/agent-generator.ts` for agents.
- Transform logic: Add pure string/object transforms in `src/prompt-transform.ts`, `src/agent-transform.ts`, or `src/frontmatter.ts`.
- Safety: Call `assertSafeOutDir` from `src/safe-output.ts` before any destructive output directory write.
- Tests: Add assertions in `tests/generator.test.ts`, `tests/agent-generator.test.ts`, and targeted transform tests.

**New agent sync behavior:**
- Primary code: `src/agent-sync.ts`.
- Tests: `tests/agent-sync.test.ts` and `tests/doctor.test.ts` if doctor checks are affected.
- Guidance: Preserve generated marker ownership semantics; never overwrite unmarked `.pi/agents/*.md` files.

**New doctor/health check:**
- Primary code: `src/doctor.ts`.
- Tests: `tests/doctor.test.ts`.
- Guidance: Return `{ ok, messages }`; let `src/cli.ts` handle stdout and exit code conversion.

**New Pi runtime behavior:**
- Primary code: `src/extension.ts` for hook integration, `src/runtime-rewrites.ts` for pure message text rewrites.
- Tests: `tests/extension.test.ts` and `tests/runtime-rewrites.test.ts`.
- Guidance: Hooks must fail softly and avoid breaking Pi runtime flow; keep notifications best-effort.

**New external package resolver:**
- Primary code: A new `src/<package>.ts` resolver or extension of `src/official.ts` / `src/pi-subagents.ts`.
- Tests: Add feature-specific resolver tests under `tests/` using temporary package fixtures from `tests/fixtures.ts` where applicable.
- Guidance: Validate expected package metadata shape and required paths before returning resolver results.

**New public API:**
- Implementation: Add code under `src/` in the feature module.
- Export: Re-export from `src/index.ts`.
- Tests: Add direct module tests under `tests/` and, if public packaging changes, ensure `package.json` exports/build still expose `dist/index.js` and `dist/index.d.ts`.

**Utilities:**
- Shared helpers: Put source helpers in a focused `src/<concern>.ts` file, not inside `src/cli.ts` unless they are CLI-only.
- Test helpers: Put reusable test setup in `tests/fixtures.ts`.
- Avoid: Do not place source helpers in `generated/`, `dist/`, `.pi/`, or `.gsd`.

## Special Directories

**`generated/`:**
- Purpose: Committed generated resources consumed by package users and Pi.
- Generated: Yes, by `node dist/cli.js generate --cwd .` or `npm run generate`.
- Committed: Yes.

**`dist/`:**
- Purpose: Build output for npm package entry points, bin, and Pi extension.
- Generated: Yes, by `npm run build` using `tsup`.
- Committed: Present in this working tree and included in npm package `files`.

**`.pi/`:**
- Purpose: Project-local Pi settings and optional synced generated agents for `pi-subagents` discovery.
- Generated: Partly; `.pi/agents` is generated/synced by `sync-agents`, while `.pi/settings.json` is project configuration.
- Committed: Present in this working tree; treat generated agents as owned only when they include `<!-- pi-gsd generated agent -->`.

**`.gsd/`:**
- Purpose: Local Open GSD runtime metadata/state.
- Generated: Yes, by GSD tooling.
- Committed: Present in this working tree; avoid adding application source here.

**`.planning/codebase/`:**
- Purpose: Generated codebase analysis documents for GSD planning/execution workflows.
- Generated: Yes, by codebase mapping tasks.
- Committed: Intended to be committed when codebase maps are updated.

**`.worktrees/`:**
- Purpose: Local Git worktree storage for feature work.
- Generated: Yes, by Git/workflow operations.
- Committed: No; do not add source references that depend on paths under `.worktrees/`.

**`.tmp-cli-smoke/`:**
- Purpose: Temporary CLI smoke output containing generated prompt markdown.
- Generated: Yes.
- Committed: No; do not edit as source.

**`node_modules/`:**
- Purpose: Installed npm dependencies, including `@opengsd/get-shit-done-redux` and `pi-subagents`.
- Generated: Yes, by `npm install`.
- Committed: No; resolve packages through `src/official.ts` and `src/pi-subagents.ts` instead of hardcoding paths.

---

*Structure analysis: 2026-05-29*
