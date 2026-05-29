<!-- refreshed: 2026-05-29 -->
# Architecture

**Analysis Date:** 2026-05-29

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│              Public entry points and Pi runtime              │
├──────────────────┬──────────────────┬───────────────────────┤
│ CLI commands     │ Package exports  │ Pi extension hooks     │
│ `src/cli.ts`     │ `src/index.ts`   │ `src/extension.ts`     │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application services                      │
│ `src/generator.ts`, `src/doctor.ts`, `src/agent-sync.ts`     │
└────────┬──────────────────────┬─────────────────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 Pure transforms and resolvers                │
│ `src/prompt-transform.ts`, `src/agent-transform.ts`,         │
│ `src/frontmatter.ts`, `src/runtime-rewrites.ts`,             │
│ `src/official.ts`, `src/pi-subagents.ts`, `src/safe-output.ts`│
└────────┬──────────────────────┬─────────────────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Official package inputs and generated outputs               │
│  `node_modules/@opengsd/get-shit-done-redux`,                │
│  `generated/prompts`, `generated/agents`, `.pi/agents`,       │
│  `dist`                                                       │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI dispatcher | Parse commands/options, route to generators, doctor, agent sync, or official CLI passthrough | `src/cli.ts` |
| Pi extension | Register Pi hooks and rewrite runtime messages so official GSD paths/slash commands work in Pi | `src/extension.ts` |
| Public library surface | Re-export supported modules for package consumers | `src/index.ts` |
| Prompt generator | Read official command markdown, transform it, and write Pi prompt files | `src/generator.ts` |
| Agent generator | Read official agent markdown, transform tool/frontmatter/body syntax, and write Pi agent files | `src/agent-generator.ts` |
| Agent sync | Copy generated agents into project or user `.pi/agents` destinations without overwriting unowned files | `src/agent-sync.ts` |
| Doctor | Validate official package resolution, pi-subagents resolution, generated prompt/agent drift, and sync state | `src/doctor.ts` |
| Official resolver | Locate and validate required directories/files in `@opengsd/get-shit-done-redux` | `src/official.ts` |
| pi-subagents resolver | Locate installed `pi-subagents` package and read its version | `src/pi-subagents.ts` |
| Prompt transforms | Convert `/gsd:name` references, prompt file names, and add Pi subagent guidance where needed | `src/prompt-transform.ts` |
| Agent transforms | Convert official agent frontmatter/tools/body references to Pi-compatible markdown | `src/agent-transform.ts` |
| Frontmatter parser/writer | Parse minimal YAML-like markdown frontmatter and emit supported prompt keys | `src/frontmatter.ts` |
| Runtime rewrites | Rewrite official Claude paths and GSD slash command references in live messages | `src/runtime-rewrites.ts` |
| Safe output guard | Prevent destructive generation into unsafe output directories | `src/safe-output.ts` |

## Pattern Overview

**Overall:** Functional TypeScript adapter with CLI and Pi extension façades over deterministic transformation services.

**Key Characteristics:**
- Keep official GSD canonical: resolve `@opengsd/get-shit-done-redux` through `src/official.ts` and transform its files into `generated/prompts` and `generated/agents`.
- Prefer stateless pure transforms in `src/prompt-transform.ts`, `src/agent-transform.ts`, `src/frontmatter.ts`, and `src/runtime-rewrites.ts`; keep filesystem writes in generator/sync/doctor modules.
- Use explicit synchronous Node filesystem APIs for CLI-oriented workflows in `src/generator.ts`, `src/agent-generator.ts`, `src/agent-sync.ts`, and `src/doctor.ts`.
- Use ESM/NodeNext imports with `.js` specifiers in TypeScript source, for example `import { generatePrompts } from "./generator.js"` in `src/cli.ts`.

## Layers

**Entry layer:**
- Purpose: Expose the package to users and Pi runtime.
- Location: `src/cli.ts`, `src/extension.ts`, `src/index.ts`
- Contains: CLI command dispatcher, Pi event hook registration, public exports.
- Depends on: Application services in `src/generator.ts`, `src/doctor.ts`, `src/agent-sync.ts`, and resolvers in `src/official.ts`.
- Used by: Package bin `pi-gsd-redux` from `package.json`, package import consumers via `src/index.ts`, and Pi extension loading via `package.json` `pi.extensions`.

**Application service layer:**
- Purpose: Coordinate filesystem operations, package resolution, generation, validation, and sync.
- Location: `src/generator.ts`, `src/agent-generator.ts`, `src/agent-sync.ts`, `src/doctor.ts`
- Contains: `generatePrompts`, `generateAll`, `generateAgents`, `syncAgents`, `runDoctor`.
- Depends on: Pure transforms, safe output guard, package resolvers, Node `fs`/`path`/`os` APIs.
- Used by: `src/cli.ts`, tests in `tests/*.test.ts`, and public re-exports from `src/index.ts`.

**Transform layer:**
- Purpose: Convert official GSD markdown/message content into Pi-compatible content.
- Location: `src/prompt-transform.ts`, `src/agent-transform.ts`, `src/frontmatter.ts`, `src/runtime-rewrites.ts`
- Contains: regex-based slash command/path rewrites, frontmatter parsing/writing, official agent tool mapping.
- Depends on: Only other transform helpers such as `src/frontmatter.ts` and `src/prompt-transform.ts`.
- Used by: Generators and Pi extension runtime rewrites.

**Resolver and safety layer:**
- Purpose: Locate external packages and protect generation outputs.
- Location: `src/official.ts`, `src/pi-subagents.ts`, `src/safe-output.ts`
- Contains: `resolveOfficialPackage`, `resolvePiSubagentsPackage`, `assertSafeOutDir`.
- Depends on: Node module resolution and filesystem metadata.
- Used by: CLI, doctor, generators, and extension.

**Generated artifact layer:**
- Purpose: Store committed artifacts consumed by Pi and package publishing.
- Location: `generated/prompts`, `generated/agents`, `dist`
- Contains: Generated prompt markdown, generated agent markdown, built JavaScript/declaration files.
- Depends on: Generated from source plus installed official package.
- Used by: Package `files` in `package.json`, Pi prompt discovery in `package.json` `pi.prompts`, and `sync-agents` target `.pi/agents`.

## Data Flow

### Generate Resources Path

1. CLI receives `pi-gsd-redux generate` and parses `--out`, `--prompts`, `--agents`, and `--cwd` in `src/cli.ts`.
2. CLI resolves the official package with `resolveOfficialPackage({ startDir: cwd })` in `src/official.ts`.
3. `generatePrompts` in `src/generator.ts` validates output with `assertSafeOutDir` from `src/safe-output.ts`, reads official files from `commands/gsd`, transforms frontmatter/body with `src/frontmatter.ts` and `src/prompt-transform.ts`, then writes `generated/prompts`.
4. `generateAll` in `src/generator.ts` also calls `generateAgents` in `src/agent-generator.ts`, which transforms files from the official `agents` directory through `src/agent-transform.ts` and writes `generated/agents`.
5. CLI reports counts to stdout from `src/cli.ts`.

### Doctor Validation Path

1. CLI receives `pi-gsd-redux doctor` in `src/cli.ts` and builds `DoctorOptions` with generated prompt/agent paths.
2. `runDoctor` in `src/doctor.ts` resolves `@opengsd/get-shit-done-redux` with `src/official.ts` and `pi-subagents` with `src/pi-subagents.ts`.
3. `runDoctor` creates a temporary expected output directory, regenerates prompts through `src/generator.ts`, and compares normalized contents against `generated/prompts`.
4. When `--agents` is present, `runDoctor` regenerates expected agents through `src/agent-generator.ts`, compares `generated/agents`, then calls `syncAgents` from `src/agent-sync.ts` in check mode.
5. CLI prints all doctor messages and returns status `0` or `1` from `src/cli.ts`.

### Agent Sync Path

1. CLI receives `pi-gsd-redux sync-agents` in `src/cli.ts` and parses `--scope project|user`, `--agents`, `--dry-run`, and `--check`.
2. `resolveAgentTargetDir` in `src/agent-sync.ts` maps project scope to `.pi/agents` under the current working directory and user scope to the user home `.pi/agent/agents` directory.
3. `syncAgents` reads `gsd-*.md` files from `generated/agents`, materializes official root placeholders using `materializeOfficialAgentPaths` from `src/agent-transform.ts`, and adds the generated marker.
4. `syncAgents` refuses to overwrite target files that lack `<!-- pi-gsd generated agent -->`, writes changed files unless `--dry-run` or `--check` is active, and reports stale/missing/updated files.

### Runtime Rewrite Flow

1. Pi loads the extension from `dist/extension.js` as configured by `package.json` `pi.extensions`.
2. `piGsdExtension` in `src/extension.ts` registers `session_start`, `context`, and `message_end` handlers.
3. Each handler resolves the official package with `src/official.ts` from the current Pi context directory.
4. Message content is passed through `rewriteMessageForRuntime` in `src/extension.ts`, which calls `rewriteRuntimeMessageText` from `src/runtime-rewrites.ts` for text blocks.
5. Runtime rewrites normalize `/gsd:name` slash references and replace official Claude home paths with the resolved package root.

**State Management:**
- Application state is passed as typed options/return values across functions; no central store exists.
- `src/extension.ts` keeps one module-local boolean `warnedResolveFailure` to avoid repeated Pi notifications in a session.
- Generated artifacts are filesystem state in `generated/prompts`, `generated/agents`, `dist`, and sync targets `.pi/agents` or user `.pi/agent/agents`.

## Key Abstractions

**OfficialPackage:**
- Purpose: Represents a validated official GSD package installation and required paths.
- Examples: `OfficialPackage`, `OfficialPaths`, `resolveOfficialPackage` in `src/official.ts`.
- Pattern: Resolver returns a fully validated object or throws `OfficialPackageError`.

**Generator result objects:**
- Purpose: Return deterministic written file path lists for generation workflows.
- Examples: `GeneratePromptsResult` in `src/generator.ts`, `GenerateAgentsResult` in `src/agent-generator.ts`, `GenerateAllResult` in `src/generator.ts`.
- Pattern: Service functions return `{ written: string[] }` style records that tests can assert.

**Sync result objects:**
- Purpose: Report whether agent sync/check succeeded, user-facing messages, and actual writes.
- Examples: `SyncAgentsResult` in `src/agent-sync.ts`, `DoctorResult` in `src/doctor.ts`.
- Pattern: Return `{ ok, messages, written }` or `{ ok, messages }` instead of printing directly outside the CLI.

**Markdown transform functions:**
- Purpose: Keep content rewriting deterministic and independently testable.
- Examples: `normalizeGsdSlashReferences` in `src/prompt-transform.ts`, `transformOfficialAgentMarkdown` in `src/agent-transform.ts`, `splitFrontmatter` in `src/frontmatter.ts`.
- Pattern: Pure string/object functions with no filesystem access.

**Safe output guard:**
- Purpose: Protect users from destructive recursive output deletion during generation.
- Examples: `assertSafeOutDir` in `src/safe-output.ts` is called by `generatePrompts` in `src/generator.ts` and `generateAgents` in `src/agent-generator.ts`.
- Pattern: Validate before `rmSync(outDir, { recursive: true, force: true })`.

## Entry Points

**CLI binary:**
- Location: `src/cli.ts`
- Triggers: `pi-gsd-redux` bin from `package.json`, direct `node dist/cli.js ...`, or tests invoking `runCli`.
- Responsibilities: Parse options, call package resolvers, call generation/doctor/sync services, spawn the official GSD tool for `official -- ...`, and convert exceptions into exit code `1`.

**Library exports:**
- Location: `src/index.ts`
- Triggers: Importing the package root export from `package.json`.
- Responsibilities: Re-export official resolver, frontmatter helpers, transforms, generators, doctor, sync, pi-subagents resolver, and runtime rewrites.

**Pi extension:**
- Location: `src/extension.ts`
- Triggers: Pi loading `./dist/extension.js` through `package.json` `pi.extensions`.
- Responsibilities: Notify which official package version is used, rewrite context/message content, and fail softly when official package resolution is unavailable.

**Build pipeline:**
- Location: `package.json`
- Triggers: `npm run build`.
- Responsibilities: Use `tsup` to build `src/cli.ts`, `src/extension.ts`, and `src/index.ts` to `dist` as ESM with declarations.

## Architectural Constraints

- **Threading:** Single-process, synchronous Node CLI design. Filesystem-heavy operations in `src/generator.ts`, `src/agent-generator.ts`, `src/agent-sync.ts`, and `src/doctor.ts` use blocking APIs intentionally for simple command execution.
- **Global state:** `src/extension.ts` has module-local `warnedResolveFailure`; `src/cli.ts` computes module-local `packageRoot` from `import.meta.url`. Other modules are stateless apart from filesystem side effects.
- **Circular imports:** No circular import chain is evident in `src`; transforms depend downward on helpers, services depend on transforms/resolvers, and entry points depend on services.
- **Module format:** Use TypeScript `moduleResolution: NodeNext` from `tsconfig.json`; source imports between local modules must include `.js` suffixes, as in `src/index.ts`.
- **Output safety:** Any new generator that deletes/recreates output directories must call `assertSafeOutDir` from `src/safe-output.ts` before `rmSync`.
- **Generated ownership:** Any write to `.pi/agents` must respect the generated marker from `src/agent-sync.ts` and refuse unowned files.

## Anti-Patterns

### Writing generation output without safety validation

**What happens:** A generator deletes and recreates an output directory.
**Why it's wrong:** `rmSync(outDir, { recursive: true, force: true })` can destroy arbitrary user files if the output path is unsafe.
**Do this instead:** Call `assertSafeOutDir` from `src/safe-output.ts` before removing directories, following `generatePrompts` in `src/generator.ts` and `generateAgents` in `src/agent-generator.ts`.

### Mixing filesystem side effects into transform helpers

**What happens:** Pure transform modules start reading/writing files directly.
**Why it's wrong:** Transform functions such as `normalizeGsdSlashReferences` in `src/prompt-transform.ts` and `transformOfficialAgentMarkdown` in `src/agent-transform.ts` are independently testable and reusable by CLI/runtime paths.
**Do this instead:** Keep filesystem orchestration in `src/generator.ts`, `src/agent-generator.ts`, `src/agent-sync.ts`, or `src/doctor.ts`; keep transform modules pure.

### Overwriting user-authored agent files

**What happens:** Sync logic writes to `.pi/agents` without checking ownership.
**Why it's wrong:** Project/user Pi agent directories can contain manually authored agents unrelated to this package.
**Do this instead:** Use `syncAgents` in `src/agent-sync.ts`, which checks for `<!-- pi-gsd generated agent -->` before overwriting existing targets.

### Adding local imports without `.js` extensions

**What happens:** TypeScript source imports `./module` instead of `./module.js`.
**Why it's wrong:** The project uses `NodeNext` module resolution in `tsconfig.json` and builds ESM for Node; extensionless local imports can break runtime resolution.
**Do this instead:** Follow imports like `import { resolveOfficialPackage } from "./official.js"` in `src/cli.ts` and `src/extension.ts`.

## Error Handling

**Strategy:** Throw typed or standard errors in lower-level functions, catch at process/runtime boundaries, and return structured `{ ok, messages }` results for validation workflows.

**Patterns:**
- `src/official.ts` throws `OfficialPackageError` when the official package or required internal paths are missing.
- `src/cli.ts` catches all command errors in `runCli`, writes the message to stderr, and returns exit code `1`.
- `src/doctor.ts` accumulates human-readable messages and boolean status instead of throwing for drift or missing generated files.
- `src/extension.ts` catches resolution/rewrite failures inside Pi hooks and either notifies once or returns `undefined` so Pi runtime flow continues.
- `src/agent-sync.ts` reports refusal to overwrite unowned files through `messages` and `ok: false` instead of throwing.

## Cross-Cutting Concerns

**Logging:** CLI output is abstracted through `CliIO` in `src/cli.ts`; doctor/sync return message arrays; Pi notifications go through `ctx.ui.notify` in `src/extension.ts`.
**Validation:** Package shape is validated in `src/official.ts`; `pi-subagents` version shape is validated in `src/pi-subagents.ts`; output paths are validated in `src/safe-output.ts`; CLI options are validated in `parseOptions` and `parseSyncScope` in `src/cli.ts`.
**Authentication:** Not applicable. The codebase does not implement user authentication; it resolves local npm packages and writes local files.

---

*Architecture analysis: 2026-05-29*
