---
phase: 07-pi-runtime-spike-gsd-pi-module-mapping
plan: 01
subsystem: research
tags: [spike, pi-runtime, upstream-1-2-0, gsd-pi]

requires:
  - phase: 07-pi-runtime-spike-gsd-pi-module-mapping
    provides: phase context and validation strategy
provides:
  - Verified Pi slash-command argv substitution contract
  - gsd-pi module mapping for v2.0 runtime surfaces
  - Upstream 1.2.0 impact catalog for Phase 8 migration
affects: [phase-08-upstream-1-2-0-upgrade-package-rename, phase-09-auto-orchestration-native-module, phase-10-state-reconciliation, phase-11-worktree-safety, phase-12-tool-contract]

tech-stack:
  added: []
  patterns: [source-cited spike artifacts, ADR-to-module mapping, upstream surface catalog]

key-files:
  created:
    - .planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/pi-argv.md
    - .planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/gsd-pi-module-map.md
    - .planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/upstream-1.2.0-impact.md
  modified: []

key-decisions:
  - "Pi argv delivery is handled by the prompt-template substitution chain, including $1, $2, ${@:N}, ${@:N:L}, $ARGUMENTS, and $@ forms."
  - "All five gsd-pi anchor modules mirror into the v2.0 roadmap as native TypeScript runtime surfaces."
  - "Upstream 1.2.0 replaces SDK query bridge assumptions with gsd-tools.cjs / gsd_run launcher semantics."
---

# Summary: Plan 07-01 - Pi Runtime Spike + gsd-pi Module Mapping

## What Changed

- Created `spike/pi-argv.md` documenting verified Pi slash-command argument substitution behavior.
- Created `spike/gsd-pi-module-map.md` mapping gsd-pi architecture and ADR references to v2.0 module surfaces.
- Created `spike/upstream-1.2.0-impact.md` cataloging the upstream 1.2.0 `gsd-tools.cjs`, `gsd_run`, package rename, and DispatchLogger surfaces.

## Verification

- `07-VALIDATION.md` records this as a documentation-only spike with 100% manual source inspection.
- The three expected spike deliverables exist under `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/`.
- Phase 8 and Phase 9 consumed these findings: the package migration targets `@opengsd/gsd-core@1.2.0`, and native orchestration owns `--auto` / `--chain` runtime flow.

## Result

Phase 07 is complete. It produced the technical foundation for Phase 8 migration and Phase 9-12 runtime module planning without production code changes.
