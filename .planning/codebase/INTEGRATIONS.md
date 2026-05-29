# External Integrations

**Analysis Date:** 2026-05-29

## APIs & External Services

**Package registries:**
- npm registry - Distribution channel for `pi-gsd-redux` and source for package dependencies.
  - SDK/Client: npm CLI through `package.json`, `package-lock.json`, and commands documented in `docs/PUBLISHING.md`.
  - Auth: npm publish token only during release; no token file is committed. `docs/PUBLISHING.md` documents passing a short-lived token on the `npm publish` command line.

**Pi package ecosystem:**
- Pi package catalog - Installs and indexes `pi-gsd-redux` as a Pi package based on `package.json` keywords and `pi` manifest fields.
  - SDK/Client: Pi CLI commands documented in `README.md` and `docs/PUBLISHING.md` (`pi install npm:pi-gsd-redux`, `pi install npm:pi-subagents`).
  - Auth: Not applicable for local package runtime; Pi installation uses the user's Pi environment.
- Pi extension host - Loads `dist/extension.js` and invokes extension hooks implemented in `src/extension.ts`.
  - SDK/Client: `@earendil-works/pi-coding-agent` type package and `ExtensionAPI` in `src/extension.ts`.
  - Auth: Not detected.

**Open GSD upstream package:**
- `@opengsd/get-shit-done-redux` - Canonical provider of GSD commands, references, templates, agents, hooks, and official `gsd-tools.cjs`.
  - SDK/Client: Node `createRequire` package resolution in `src/official.ts`; CLI passthrough executes `officialPackage.paths.gsdTools` with `spawnSync` in `src/cli.ts`.
  - Auth: Not applicable at runtime beyond npm package installation.

**Subagent runtime:**
- `pi-subagents` - Companion package that discovers synced generated agent files.
  - SDK/Client: Node `createRequire` package resolution in `src/pi-subagents.ts`; file sync target selection in `src/agent-sync.ts`.
  - Auth: Not detected.

## Data Storage

**Databases:**
- Not detected.
  - Connection: Not applicable.
  - Client: Not applicable.

**File Storage:**
- Local filesystem only.
  - Generated prompts are written to `generated/prompts` by `src/generator.ts`.
  - Generated agents are written to `generated/agents` by `src/agent-generator.ts`.
  - Project-scoped synced agents are written to `.pi/agents` by `src/agent-sync.ts`.
  - User-scoped synced agents are written to `<homedir>/.pi/agent/agents` by `src/agent-sync.ts`.
  - Temporary doctor outputs are written under the OS temp directory by `src/doctor.ts` and removed after comparison.

**Caching:**
- None detected; package resolution uses Node's normal module resolver in `src/official.ts` and `src/pi-subagents.ts`.

## Authentication & Identity

**Auth Provider:**
- Not detected for application runtime.
  - Implementation: CLI and extension operate on local files and installed npm packages.
- npm account authentication is release-only.
  - Implementation: `docs/PUBLISHING.md` recommends a short-lived granular npm access token with bypass 2FA for `npm publish`; secrets are not stored in the repository.

## Monitoring & Observability

**Error Tracking:**
- None detected.

**Logs:**
- CLI output is written through `CliIO` to stdout/stderr in `src/cli.ts`.
- Doctor diagnostics are accumulated in `DoctorResult.messages` in `src/doctor.ts`.
- Pi runtime notifications are best-effort `ctx.ui.notify(...)` calls from `src/extension.ts` during package resolution success or failure.

## CI/CD & Deployment

**Hosting:**
- npm package registry for the published package `pi-gsd-redux`, configured in `package.json` and documented in `docs/PUBLISHING.md`.
- Pi package catalog indexes the npm package automatically because `package.json` includes the `pi-package` keyword.

**CI Pipeline:**
- None detected in the repository; no `.github/workflows` directory was found.
- Release verification is manual through `npm publish --dry-run --access public`, `npm view`, and Pi install commands documented in `docs/PUBLISHING.md`.

## Environment Configuration

**Required env vars:**
- None detected for runtime.
- `npm_execpath` is required by some CLI tests in `tests/cli.test.ts` when building through npm, but it is not an application runtime configuration variable.

**Secrets location:**
- No repository `.env` files detected.
- npm publish tokens are intentionally external and command-scoped per `docs/PUBLISHING.md`; do not store tokens in `.npmrc` or committed files.

## Webhooks & Callbacks

**Incoming:**
- Pi extension callbacks handled in `src/extension.ts`:
  - `session_start` resolves the official GSD package and notifies the Pi UI.
  - `context` rewrites runtime message references to the installed official package root.
  - `message_end` rewrites assistant message references after generation.
- No HTTP webhook endpoints detected.

**Outgoing:**
- CLI passthrough to official GSD tooling in `src/cli.ts` executes Node with `officialPackage.paths.gsdTools` for the `official` command.
- No outbound HTTP API calls detected in `src/**/*.ts`.

---

*Integration audit: 2026-05-29*
