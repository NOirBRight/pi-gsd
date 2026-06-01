---
phase: 08-upstream-1-2-0-upgrade-package-rename
plan: 02
subsystem: upstream-package
tags: [typescript, npm, upstream-1-2-0]

provides:
  - Canonical upstream package migrated to @opengsd/gsd-core
  - Model catalog loading verified against 1.2.0 package layout
affects: [phase-09-auto-orchestration-native-module, phase-12-tool-contract]

key-files:
  modified:
    - package.json
    - package-lock.json
    - src/official.ts
    - src/gsd-models.ts
    - tests/gsd-models.test.ts
    - tests/official-resolver.test.ts

key-decisions:
  - "The installed upstream source of truth is @opengsd/gsd-core@1.2.0."
  - "Model catalog loading reads the 1.2.0 get-shit-done/bin/shared layout."
---

# Summary: Plan 08-02 - Upstream 1.2.0 Package Migration

## What Changed

- Migrated the canonical upstream dependency to `@opengsd/gsd-core@1.2.0`.
- Updated model-catalog tests to use `node_modules/@opengsd/gsd-core`.
- Removed remaining `@opengsd/get-shit-done-redux` references from current source/tests/README during reconciliation.

## Verification

- `package.json` declares `"@opengsd/gsd-core": "1.2.0"`.
- `node_modules/@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs` exists locally.
- `npx vitest run tests/prompt-transform.test.ts tests/gsd-models.test.ts tests/gsd-models-command.test.ts tests/gsd-models-integration.test.ts tests/gsd-models-ui.test.ts` passed: 5 files / 128 tests.
- `npm run check` passed after reconciliation: typecheck, 24 Vitest files / 331 tests, build, and doctor with generated workflows.

## Result

Plan 08-02 is complete. Runtime and tests now target the upstream 1.2.0 package family.
