---
phase: 08-upstream-1-2-0-upgrade-package-rename
plan: 01
subsystem: package-identity
tags: [typescript, npm, cli, docs]

provides:
  - Project package identity renamed to pi-gsd-core
  - CLI usage and publishing docs aligned with new package name
affects: [phase-08-upstream-1-2-0-upgrade-package-rename]

key-files:
  modified:
    - package.json
    - README.md
    - docs/PUBLISHING.md
    - src/cli.ts
    - tests/cli.test.ts

key-decisions:
  - "The npm package name is pi-gsd-core; the GitHub repository slug remains pi-gsd."
---

# Summary: Plan 08-01 - Project Package Rename

## What Changed

- Renamed the package metadata and CLI-facing usage from `pi-gsd-redux` to `pi-gsd-core`.
- Updated README and publishing runbook references for install, doctor, and sync commands.
- Kept repository URL identity as `pi-gsd`, since that is a repo slug rather than the npm package name.

## Verification

- Current `package.json` contains `"name": "pi-gsd-core"` and `bin.pi-gsd-core`.
- Current CLI usage starts with `Usage: pi-gsd-core`.
- `npm run check` passed after reconciliation: typecheck, 24 Vitest files / 331 tests, build, and doctor with generated workflows.

## Result

Plan 08-01 is complete. Package identity is aligned with the upstream `@opengsd/gsd-core` family.
