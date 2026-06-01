# Phase 7: Pi Runtime Spike + gsd-pi Module Mapping - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

## Phase Boundary

Phase 7 is a pure research spike — no production code changes. It delivers 3 artifacts that feed directly into v2.0 phases 8-13: verify how Pi passes slash command arguments to workflow prompts (RUNTIME-01), map gsd-pi's deep-module architecture to the v2.0 modules we must build, and catalog upstream 1.2.0 changes that affect v2.0 design decisions.

## Implementation Decisions

### Spike Deliverables
- **D-01:** Three artifacts to produce:
  1. `pi-argv.md` — verified Pi argv-passing mechanism with reproducer
  2. `gsd-pi-module-map.md` — gsd-pi ADR surface + file-level references mapped to v2.0 modules
  3. `upstream-1.2.0-impact.md` — gsd-tools CLI surface, gsd_run launcher, DispatchLogger seam catalog
- **D-02:** One plan covering all three (they are independent, small, and sequential execution is fine)

### Upstream 1.2.0 Analysis
- **D-03:** Code-level inspection, not release-notes aggregation. Read gsd-tools CLI surface + gsd_run launcher + DispatchLogger seam from actual 1.2.0 source, producing an API surface catalog (format, exit codes, event types, hook points)
- **D-04:** Does NOT do a full v1.1.0→v1.2.0 diff — that's Phase 8's job

### Argv Spike (RUNTIME-01)
- **D-05:** Scope is Pi side only — verify how Pi slash command arguments reach workflow prompt content via `$ARGUMENTS` substitution (starting point: `pi-coding-agent/dist/core/prompt-templates.js:78`)
- **D-06:** gsd-tools/gsd_run calling conventions covered by upstream-1.2.0-impact.md, not pi-argv.md

### gsd-pi Module Mapping
- **D-07:** gsd-pi reference source: local fork `D:\Workstation\gsd-pi-fork` (v1.0.2), commit-hash pinned for reproducibility
- **D-08:** Mapping anchored on ADR surface (ADR-009 orchestration kernel, ADR-014 auto-orchestration deep module, ADR-017 state reconciliation drift-driven) + file-level references to `packages/daemon/src/` — NOT the non-existent `extensions/gsd/{auto,state-reconciliation,safety}/` path referenced in the original ROADMAP draft
- **D-09:** All five v2.0 anchor modules mirror in v2.0 (none deferred to v2.1):
  - Auto Orchestration (Phase 9) — gated by ADR-014 surface
  - State Reconciliation (Phase 10) — replaces gsd_query SDK bridge
  - Worktree Safety (Phase 11) — fail-closed guard
  - Recovery Classification (Phase 11) — paired with Worktree Safety
  - Tool Contract (Phase 12) — per-unit dispatch validation

### Phase Ordering
- **D-10:** Phase 8 runs upgrade before any v2.0 module work — Phase 7 analyzes 1.2.0 surface first so Phase 8 starts with a known changeset
- **D-11:** SETTINGS-01/02 (GSD settings.json → Pi prompt context) deferred to Phase 12 alongside Tool Contract

### Claude's Discretion
- Spike artifact location: phase directory `.planning/phases/07-*/spike/`
- All form-level decisions (directory naming, file naming, markdown structure)
- Exact reproducer approach for argv spike

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Roadmap
- `.planning/PROJECT.md` — v2.0 strategic direction (Path B), module anchor list, D-12 pin status
- `.planning/ROADMAP.md` §Phase 7 — deliverables and success criteria
- `.planning/ROADMAP.md` §Phase 8 — upstream upgrade prerequisite
- `.planning/REQUIREMENTS.md` §RUNTIME-01 — argv spike requirement
- `.planning/REQUIREMENTS.md` §SETTINGS — settings bridge requirements (Phase 12)
- `.planning/REQUIREMENTS.md` §UPSTREAM — upgrade requirements (Phase 8)
- `.planning/STATE.md` — D-12 (pin status), D-25 through D-28 (v2.0 structure decisions)

### gsd-pi Reference Implementation
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-009-orchestration-kernel-refactor.md` — orchestration kernel design
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-014-auto-orchestration-deep-module.md` — auto orchestration surface
- `D:\Workstation\gsd-pi-fork/docs/dev/ADR-017-state-reconciliation-drift-driven.md` — state reconciliation design
- `D:\Workstation\gsd-pi-fork/packages/daemon/src/orchestrator.ts` — orchestrator implementation

### Pi Runtime Surface
- `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js` — $ARGUMENTS substitution mechanism (entry point for RUNTIME-01)

### Current Codebase (v1.0)
- `src/prompt-transform.ts:917` — AUTO_MODE_CHECKLIST injection (to be removed in v2.0)
- `src/gsd-query-tool.ts:76` — SDK_PACKAGE import path (to be migrated in Phase 8)
- `src/official.ts:5` — OFFICIAL_PACKAGE_NAME constant (to be renamed in Phase 8)

## Existing Code Insights

### Reusable Assets
- `src/prompt-transform.ts` transform pipeline — argv injection will likely extend this layer
- `src/extension.ts` Pi extension hooks — settings bridge (Phase 12) plugs into these

### Established Patterns
- Pure transform functions, stateless, no filesystem access — new modules follow this
- Generator→transform→resolver layering — v2.0 modules add orchestration layer between application services and transforms

### Integration Points
- Pi extension `session_start` / `context` hooks — settings injection point
- `$ARGUMENTS` in prompt template — argv entry point
- `gsd-tools.cjs` / `gsd_run` launcher — new bridge surface replacing `sdk/dist/query/*.js`

## Specific Ideas

- User referenced upstream 1.2.0 release notes and identified that SDK retirement has already happened, not a future event
- User wants Phase 7 to analyze 1.2.0 code to inform v2.0 design decisions before any module work starts

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 7-Pi Runtime Spike + gsd-pi Module Mapping*
*Context gathered: 2026-05-31*
