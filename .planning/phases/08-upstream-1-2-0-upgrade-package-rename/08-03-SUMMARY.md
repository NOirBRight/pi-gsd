---
phase: 08-upstream-1-2-0-upgrade-package-rename
plan: 03
subsystem: sdk-bridge-retirement
tags: [typescript, prompt-transform, bridge-retirement]

provides:
  - Retired gsd_query Pi tool bridge
  - Removed dead $GSD_SDK transform assumptions from production code
affects: [phase-09-auto-orchestration-native-module, phase-13-sdk-bridge-retirement-v2-0-release]

key-files:
  deleted:
    - src/gsd-query-tool.ts
  modified:
    - src/prompt-transform.ts
    - src/generator.ts
    - src/extension.ts
    - tests/e2e/workflow-fidelity.test.ts

key-decisions:
  - "Upstream 1.2.0 workflows use gsd_run / gsd-tools.cjs, not $GSD_SDK query calls."
  - "Bridge retirement is a clean delete because no external users depended on the old pi-gsd gsd_query tool."
---

# Summary: Plan 08-03 - Retire SDK Query Bridge

## What Changed

- Removed the obsolete `gsd_query` bridge surface from production code.
- Removed production `$GSD_SDK` transform wiring that targeted the retired upstream SDK query layout.
- Kept regression assertions that generated workflows do not emit active retired `gsd_query` calls.

## Verification

- `src/gsd-query-tool.ts` is absent in the current repository.
- Production `src/` contains no `GSD_SDK` or `gsd_query` bridge implementation.
- `tests/e2e/workflow-fidelity.test.ts` retains regression checks for zero residual retired workflow calls.
- `npm run check` passed after reconciliation: typecheck, 24 Vitest files / 331 tests, build, and doctor with generated workflows.

## Result

Plan 08-03 is complete. The runtime no longer carries the old SDK query bridge as production behavior.
