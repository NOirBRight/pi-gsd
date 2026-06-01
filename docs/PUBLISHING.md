# Publishing and Update Runbook

This document is for maintainers publishing `pi-gsd-core` to npm and the Pi package catalog. After reading it, you should be able to update the package, publish a new version safely, and confirm that Pi can install it.

## What Gets Published

`pi-gsd-core` is an npm package with a Pi manifest. Pi loads the packaged extension and generated prompt templates through `pi install npm:pi-gsd-core`.

The package also ships a helper CLI named `pi-gsd-core`. Use that CLI to sync generated GSD agents for `pi-subagents`:

```bash
npx pi-gsd-core sync-agents --scope user
```

The Pi package catalog indexes npm packages that include the `pi-package` keyword. There is no separate marketplace submission step.

## Normal Update Flow

Use this flow when updating generated resources, dependencies, or docs.

```bash
npm install
npm update @opengsd/gsd-core
npm run build
node dist/cli.js generate --cwd .
npm run check
```

Before publishing, bump the package version with the appropriate semver level:

```bash
npm version patch
```

Use `minor` or `major` instead of `patch` when the user-facing behavior warrants it.

Review what npm will publish:

```bash
npm publish --dry-run --access public
```

The dry run should show:

- package name `pi-gsd-core`
- the built `dist` files
- `generated/prompts`
- `generated/agents`
- `README.md`
- `LICENSE`

If npm prints package metadata warnings, fix them before publishing.

## Publishing With npm Security Key 2FA

The `noirbright` npm account uses security-key 2FA. In this mode, `npm publish` may reject a normal login session with this error:

```text
Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

For manual publishing, use a short-lived granular access token with bypass 2FA enabled.

Recommended token settings:

- token type: granular access token
- expiration: 1 day
- bypass two-factor authentication: enabled
- packages and scopes: all packages, or only `pi-gsd-core` after it exists
- permissions: read and write

Publish with the token locally, without sharing it in chat or committing it anywhere:

```bash
npm publish --access public --registry https://registry.npmjs.org/ --//registry.npmjs.org/:_authToken=YOUR_TOKEN
```

Revoke the token immediately after the publish succeeds.

### Do Future Updates Need a New Token?

Every manual publish needs a valid publish-capable credential. You do not strictly need a brand-new token every time if you keep a long-lived granular token, but the safer practice is to create a short-lived token for each release and revoke it after publishing.

If you later configure npm trusted publishing from GitHub Actions, future releases can publish without creating manual tokens.

## Post-Publish Verification

Confirm npm sees the new version:

```bash
npm view pi-gsd-core version
npm view pi-gsd-core keywords --json
```

Confirm the Pi package page is available:

```text
https://pi.dev/packages/pi-gsd-core
```

Confirm a fresh install path works:

```bash
pi install npm:pi-gsd-core
pi install npm:pi-subagents
npx pi-gsd-core sync-agents --scope user
npx pi-gsd-core doctor --agents --scope user
```

Pi catalog indexing is automatic. The detail page may appear before the package is visible in all catalog search and sorting views.

## Upstream Coordination

The upstream integration discussion lives at:

```text
https://github.com/open-gsd/gsd-pi/issues/224
```

Keep this package aligned with upstream GSD by continuing to generate prompts and agents from `@opengsd/gsd-core` instead of hand-editing generated resources.
