# Coding Conventions

**Analysis Date:** 2026-05-29

## Naming Patterns

**Files:**
- Use lowercase kebab-case for source and test modules: `src/agent-generator.ts`, `src/prompt-transform.ts`, `tests/agent-generator.test.ts`.
- Test files mirror source module names with `.test.ts`: `src/generator.ts` → `tests/generator.test.ts`.
- Type declaration output is generated under `dist/*.d.ts`; do not edit `dist/cli.d.ts` or other `dist` files directly.

**Functions:**
- Use camelCase for functions and helpers: `generatePrompts` in `src/generator.ts`, `assertSafeOutDir` in `src/safe-output.ts`, `splitFrontmatter` in `src/frontmatter.ts`.
- Export public functions from implementation modules with descriptive verb phrases: `generateAgents` in `src/agent-generator.ts`, `runDoctor` in `src/doctor.ts`, `resolveOfficialPackage` in `src/official.ts`.
- Keep private helpers unexported below the public API in the same file: `parseOptions`, `parseSyncScope`, and `isCliEntrypoint` in `src/cli.ts`.

**Variables:**
- Use camelCase for local variables and parameters: `officialRoot`, `outDir`, `safeRoot` in `src/generator.ts` and `src/safe-output.ts`.
- Use `const` by default; use `let` only for accumulators or mutable loop state, as in `ok` in `src/doctor.ts` and `index` in `src/cli.ts`.
- Use explicit names for paths and file collections: `commandsDir`, `fileNames`, `targetPath` in `src/generator.ts`.

**Types:**
- Use PascalCase exported type aliases and interfaces: `GeneratePromptsOptions`, `GeneratePromptsResult`, `CliIO`, `DoctorResult`.
- Pair option/result types with the function they support: `GenerateAgentsOptions` and `GenerateAgentsResult` in `src/agent-generator.ts`.
- Use string literal unions for constrained modes: `AgentSyncScope` in `src/agent-sync.ts` and `OptionMode` in `src/cli.ts`.

## Code Style

**Formatting:**
- No Prettier, ESLint, or Biome configuration detected (`.prettierrc*`, `.eslintrc*`, `eslint.config.*`, and `biome.json` are not present).
- Match existing TypeScript formatting: two-space indentation, double quotes for imports/strings, semicolons, and trailing commas in multiline calls/objects.
- Keep imports at the top of each file; use ESM imports with `.js` extensions for local TypeScript modules because `tsconfig.json` uses `module: NodeNext`.
- Prefer compact but readable pipelines for file operations, as in `readdirSync(...).filter(...).sort(...)` in `src/generator.ts`.

**Linting:**
- No lint command is configured in `package.json`.
- `npm run typecheck` (`tsc --noEmit`) is the main static quality gate.
- Strict TypeScript is enabled in `tsconfig.json`; avoid `any` and model data with explicit exported types.

## Import Organization

**Order:**
1. Node built-in modules with `node:` prefixes: `node:fs`, `node:path`, `node:child_process`.
2. External package imports: `vitest/config` in `vitest.config.ts`.
3. Local source imports with `.js` extensions: `./frontmatter.js`, `../src/generator.js`.
4. Type-only imports are grouped with related runtime imports using `type`: `generateAgents, type GenerateAgentsResult` in `src/generator.ts`.

**Path Aliases:**
- No path aliases are configured in `tsconfig.json`.
- Use relative imports between source files: `./agent-generator.js` in `src/generator.ts`.
- Use relative imports from tests into source: `../src/cli.js` in `tests/cli.test.ts`.

## Error Handling

**Patterns:**
- Throw `Error` with actionable messages for invalid input and unsafe operations: `src/safe-output.ts`, `src/agent-transform.ts`, `src/cli.ts`.
- CLI entry points catch exceptions and write only the error message to stderr, returning non-zero status in `runCli` in `src/cli.ts`.
- Use typed custom errors where the caller benefits from classification: `OfficialPackageError` in `src/official.ts`.
- For filesystem existence checks, inspect Node error codes rather than string-matching messages: `isMissingFileError` in `src/doctor.ts`.

## Logging

**Framework:** console/process IO wrappers

**Patterns:**
- Avoid direct `console.log` in library code. CLI output goes through `CliIO` in `src/cli.ts` to make tests deterministic.
- Write user-facing success/status lines to `io.stdout` and errors/usage to `io.stderr` in `src/cli.ts`.
- Return structured messages from internal operations rather than printing directly: `DoctorResult.messages` in `src/doctor.ts`.

## Comments

**When to Comment:**
- Comments are sparse; prefer self-explanatory function and variable names.
- Add comments only for non-obvious platform or safety behavior, especially around path handling in `src/safe-output.ts` or CLI entrypoint detection in `src/cli.ts`.

**JSDoc/TSDoc:**
- No consistent JSDoc/TSDoc pattern detected.
- Prefer exported TypeScript types over documentation comments for function contracts, as used by `GenerateAllOptions` in `src/generator.ts`.

## Function Design

**Size:** Keep functions focused on one operation. Public functions such as `generatePrompts` in `src/generator.ts` and `transformOfficialAgentMarkdown` in `src/agent-transform.ts` orchestrate small private helpers.

**Parameters:** Use a single options object for exported functions that accept multiple inputs: `generatePrompts(options)`, `generateAgents(options)`, `runDoctor(options)`. This keeps call sites extensible.

**Return Values:** Return plain typed objects for results: `{ written }` from `src/generator.ts`, `{ ok, messages }` from `src/doctor.ts`. Avoid implicit output via logging in non-CLI modules.

## Module Design

**Exports:**
- Export public API functions and associated types from implementation modules.
- Re-export package API from `src/index.ts` rather than importing deep modules from consumers.
- Keep helper functions private unless tests or consumers need them.

**Barrel Files:**
- `src/index.ts` is the package barrel for public imports.
- Do not create additional barrel files unless a directory contains multiple public modules that need a stable external API.

---

*Convention analysis: 2026-05-29*
