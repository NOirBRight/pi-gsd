---
phase: 08-upstream-1-2-0-upgrade-package-rename
plan: 04
subsystem: launcher-transform
tags: [typescript, prompt-transform, generated-workflows, doctor]

provides:
  - Pure gsd_run launcher transform with node_modules fallback
  - Regenerated workflows with @opengsd/gsd-core gsd-tools.cjs resolution
  - npm check gate covering generated workflows
affects: [phase-09-auto-orchestration-native-module, phase-12-tool-contract]

key-files:
  created: []
  modified:
    - src/prompt-transform.ts
    - src/generator.ts
    - tests/prompt-transform.test.ts
    - package.json
    - README.md
    - generated/workflows/

key-decisions:
  - "Launcher augmentation is a pure string transform; it does not import fs/path/os."
  - "Generated workflow freshness is checked by doctor through --workflows."
---

# Summary: Plan 08-04 - gsd_run Launcher Transform + Workflow Freshness

## What Changed

- Added `transformGsdRunLauncher()` to prepend a `require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs')` fallback before upstream's launcher chain.
- Wired the transform into `applyPromptTransforms()` so generated workflows can find `gsd-tools.cjs` from npm-installed `node_modules`.
- Regenerated `generated/workflows/`; `generated/workflows/workflows/discuss-phase.md` now contains the new fallback.
- Added `generated/workflows` to package files and made `npm run check` run doctor with `--workflows generated/workflows`.
- Updated README upstream package references to `@opengsd/gsd-core`.

## Verification

- `npx vitest run tests/prompt-transform.test.ts tests/gsd-models.test.ts tests/gsd-models-command.test.ts tests/gsd-models-integration.test.ts tests/gsd-models-ui.test.ts` passed: 5 files / 128 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run generate` wrote 67 prompts, 33 agents, and 215 workflow files.
- `npm run check` passed: typecheck, 24 Vitest files / 331 tests, build, and doctor with `generated workflows: ok`.

## Result

Plan 08-04 is complete. Phase 8 now has code-level evidence for the launcher transform and workflow freshness gate.
