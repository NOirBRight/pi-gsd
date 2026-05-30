# Phase 3: Subagent Stability - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Source:** Issue analysis + systematic verification

<domain>
## Phase Boundary

This phase ensures pi-subagents operates reliably on Windows (especially Azure AD/Entra ID machines) so that Pi can start and use subagents without EPERM crashes. It also validates that existing /gsd-models and agent sync features remain functional after the fix.

**In scope:**
- Root cause fix for EPERM in `ensureAccessibleDir`
- ES module read-only binding workaround for `RESULTS_DIR`/`ASYNC_DIR`
- Choosing between upstream PR, fork, monkey-patch, or startup cleanup
- Regression testing of /gsd-models and agent sync after fix

**Out of scope:**
- Workflow execution fidelity (Phase 4)
- ask-user-question integration (Phase 4)
- TUI verbosity or install simplification (Phase 5)
- npm publish (Phase 5)
</domain>

<decisions>
## Implementation Decisions

### D-01: EPERM Root Cause — ensureAccessibleDir Must Not Crash Pi
- `pi-subagents/src/extension/index.ts:89-90` calls `fs.mkdirSync(dirPath, { recursive: true })` without catching EPERM/EACCES
- When NTFS ACL is corrupted (wake-from-sleep on Azure AD machines), this throws, extension fails to load, Pi cannot start
- **Decision:** Catch EPERM/EACCES in `ensureAccessibleDir`, attempt recovery, and if recovery fails use a pid-scoped fallback path
- This is a structural upstream fix — not a local workaround

### D-02: ES Module Read-Only Binding Workaround
- `RESULTS_DIR` and `ASYNC_DIR` are `export const` in `src/shared/types.ts:679-680`
- Consumer modules (`async-job-tracker.ts`, `result-watcher.ts`) import these as read-only ES module bindings
- A fallback path set by `ensureAccessibleDir` cannot propagate to these consumers
- **Decision:** Change the binding approach. Options evaluated:
  - A: Upstream PR to change exports to getter functions or a config object
  - B: Monkey-patch at pi-gsd-redux extension load time (replace module before subagents loads)
  - C: Accept the limitation and use env-based or side-channel propagation
  - Chosen approach depends on upstream responsiveness (see D-03)

### D-03: Fork vs Upstream PR Decision
- Upstream repo: https://github.com/nicobailon/pi-subagents
- The fix requires changes in both `src/extension/index.ts` and `src/shared/types.ts` plus all consumer modules
- **Decision:** Start with upstream PR (option A from issue doc). If upstream is unresponsive within 2 weeks, consider maintaining a fork at NOirBRight/pi-subagents with the fixes applied. Monkey-patch (option B) is viable as an interim measure but fragile.

### D-04: Verify /gsd-models After Fix
- Current tests: 180 pass, typecheck clean, build clean, doctor clean
- After modifying pi-subagents (fork or monkey-patch), must re-verify that agent sync, doctor, and /gsd-models still work
- **Decision:** Run full `npm run check` plus manual /gsd-models invocation in a fresh Pi session
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Subagent EPERM Issue
- `docs/issue-pi-subagents-eperm.md` — Full root cause analysis, fix options, and workarounds

### Source Code (pi-subagents upstream)
- `node_modules/pi-subagents/src/extension/index.ts` — `ensureAccessibleDir` (line 89), extension registration (line 226-227)
- `node_modules/pi-subagents/src/shared/types.ts` — `RESULTS_DIR`/`ASYNC_DIR` constants (line 679-680)

### Source Code (pi-gsd-redux)
- `src/extension.ts` — Pi extension entry point, registers /gsd-models command
- `src/pi-subagents.ts` — pi-subagents package resolver
- `src/gsd-models.ts` — /gsd-models command implementation (22KB)
- `src/agent-sync.ts` — Agent sync logic with generated-marker ownership
- `src/doctor.ts` — Doctor validation logic
- `src/official.ts` — Official package resolver

### Repair Script
- `scripts/repair-pi-subagents-temp.ps1` — PowerShell script for elevated ACL repair

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — System architecture and data flow
- `.planning/codebase/CONCERNS.md` — Known tech debt and fragile areas
- `.planning/codebase/STRUCTURE.md` — Directory layout and file responsibilities
</canonical_refs>

<specifics>
## Specific Ideas

1. The `ensureAccessibleDir` fix pattern should be: try mkdir → catch EPERM → try rm+mkdir → catch EPERM on rm → try pid-scoped fallback dir → if fallback works, propagate new dir path
2. For ES module binding: consider changing `RESULTS_DIR`/`ASYNC_DIR` from `export const` to `export let` with a `setResultsDir()` setter, or use a config object pattern like `export const DIRS = { results: '...', async: '...' }` where properties are mutable
3. The repair script (`scripts/repair-pi-subagents-temp.ps1`) is already 300+ lines — it should NOT grow further. Instead, the fix should be upstream so the script becomes unnecessary
4. Current temp dir scope resolution (`resolveTempScopeId`) can produce `shared` scope, which means multiple Pi processes share the same temp dir — a concurrent-process risk even without ACL corruption
</specifics>

<deferred>
## Deferred Ideas

- Project-local async result storage (like @tintinweb/pi-subagents uses `.pi/output/`) — this is option D from the issue doc, a long-term architectural fix that requires upstream restructuring. Not in this phase.
- Concurrent-process safety for the shared temp dir — ACL is the P0, concurrency is a separate concern
- Switching from pi-subagents (nicobailon) to @tintinweb/pi-subagents — these are fundamentally incompatible (different tool names, no chain/parallel, no intercom)
</deferred>

---

*Phase: 03-subagent-stability*
*Context gathered: 2026-05-30*