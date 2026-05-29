# Technology Stack

**Analysis Date:** 2026-05-29

## Languages

**Primary:**
- TypeScript 5.x - All source and tests live in `src/**/*.ts`, `tests/**/*.ts`, and `vitest.config.ts`; package emits declarations via `tsup` and `tsc` settings in `tsconfig.json`.

**Secondary:**
- Markdown - Generated Pi prompts and agents in `generated/prompts/*.md` and `generated/agents/*.md`; documentation in `README.md` and `docs/PUBLISHING.md`.
- JSON - Package metadata and Pi manifest in `package.json`; TypeScript config in `tsconfig.json`; local Pi package config in `.pi/settings.json`.

## Runtime

**Environment:**
- Node.js >=22.0.0 - Required by `package.json` `engines.node`; CLI entrypoint uses ESM, top-level `await`, `node:fs`, `node:path`, `node:module`, `node:child_process`, and `node:url` in `src/cli.ts`.

**Package Manager:**
- npm - Scripts and lockfile are npm-based in `package.json` and `package-lock.json`.
- Lockfile: present (`package-lock.json`, lockfileVersion 3).

## Frameworks

**Core:**
- Pi extension API `@earendil-works/pi-coding-agent` ^0.74.0 - Provides the extension host types used by `src/extension.ts` for `session_start`, `context`, and `message_end` hooks.
- Open GSD package `@opengsd/get-shit-done-redux` latest - Canonical source package resolved by `src/official.ts`; prompts and agents are generated from its installed package contents.
- `pi-subagents` ^0.25.0 - Runtime companion for discovering synced GSD agents; resolution is checked by `src/pi-subagents.ts` and `src/doctor.ts`.

**Testing:**
- Vitest ^4.0.0 - Test runner configured in `vitest.config.ts`; tests live under `tests/**/*.test.ts`.

**Build/Dev:**
- TypeScript ^5.0.0 - Strict type checking configured in `tsconfig.json`; run with `npm run typecheck`.
- tsup ^8.5.1 - Builds ESM CLI, extension, and library entrypoints from `src/cli.ts`, `src/extension.ts`, and `src/index.ts` using the `npm run build` command in `package.json`.
- Node built-in modules - Filesystem/process operations use `node:fs`, `node:os`, `node:path`, `node:module`, `node:url`, and `node:child_process` across `src/*.ts`.

## Key Dependencies

**Critical:**
- `@opengsd/get-shit-done-redux` `latest` - Official upstream GSD resource package; `src/official.ts` requires directories `commands/gsd`, `get-shit-done/workflows`, `get-shit-done/references`, `get-shit-done/templates`, `agents`, `hooks`, and `get-shit-done/bin/gsd-tools.cjs`.
- `pi-subagents` ^0.25.0 - Supplies the subagent runtime expected by generated agents; `src/agent-sync.ts` syncs generated agents to `.pi/agents` or the user Pi agents directory.
- `@earendil-works/pi-coding-agent` ^0.74.0 - Compile-time dependency for `ExtensionAPI` in `src/extension.ts`; packaged Pi extension is registered in `package.json` under `pi.extensions`.

**Infrastructure:**
- `typescript` ^5.0.0 - Type checking and declaration generation for package consumers.
- `tsup` ^8.5.1 - Produces `dist/cli.js`, `dist/extension.js`, and `dist/index.js` plus `.d.ts` files.
- `vitest` ^4.0.0 - Unit and smoke tests for generators, CLI behavior, package resolution, and runtime rewrites.
- `@types/node` ^22.0.0 - Node API type definitions matching the supported Node 22 runtime.

## Configuration

**Environment:**
- No `.env` files detected in the repository; configuration is primarily CLI flags and package resolution.
- CLI options are parsed in `src/cli.ts`: `--cwd`, `--out`, `--prompts`, `--agents`, `--scope`, `--dry-run`, and `--check`.
- Pi package registration is in `package.json` under `pi.extensions` (`./dist/extension.js`) and `pi.prompts` (`./generated/prompts`).
- Local Pi development config is `.pi/settings.json`, which points Pi to the local package path.

**Build:**
- `package.json` scripts: `build`, `typecheck`, `test`, `check`, and `generate`.
- `tsconfig.json`: `target` ES2022, `module` NodeNext, `moduleResolution` NodeNext, `strict` true, declarations enabled, `outDir` `dist`, `rootDir` `.`.
- `vitest.config.ts`: globals enabled, tests included from `tests/**/*.test.ts`, timeout `10_000` ms.
- `package.json` exports ESM entrypoint `./dist/index.js` and CLI bin `dist/cli.js`.

## Platform Requirements

**Development:**
- Node.js 22 or newer and npm, per `package.json` `engines.node` and `package-lock.json`.
- Run `npm install`, `npm run build`, `npm test`, and `npm run check` from the repository root.
- Generated resources are materialized by `node dist/cli.js generate --cwd .` into `generated/prompts` and `generated/agents`.

**Production:**
- Published as an npm package named `pi-gsd-redux` with package files from `dist`, `generated/prompts`, `generated/agents`, `docs/PUBLISHING.md`, `README.md`, and `LICENSE` as declared in `package.json`.
- Installed into Pi via `pi install npm:pi-gsd-redux`; prompts are loaded from `generated/prompts`, and the extension is loaded from `dist/extension.js`.
- Optional/global CLI usage is via `npx pi-gsd-redux` or the installed `pi-gsd-redux` binary.

---

*Stack analysis: 2026-05-29*
