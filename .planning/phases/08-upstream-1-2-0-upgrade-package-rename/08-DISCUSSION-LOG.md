# Phase 8: Upstream 1.2.0 Upgrade + Package Rename - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 08-upstream-1-2-0-upgrade-package-rename
**Areas discussed:** Bridge surface ($GSD_SDK redirect + gsd-query-tool.ts fate), gsd-tools.cjs invocation mechanism, Project rename, DispatchLogger timing, Migration commit granularity

---

## Bridge surface: $GSD_SDK redirect + gsd-query-tool.ts fate

Initial framing presented three options:

| Option | Description | Selected |
|--------|-------------|----------|
| A | Keep `gsd_query` tool name + file, swap backing to shell-out `gsd-tools.cjs` | |
| B | Rename to new Pi tool (`gsd_run` / `gsd_cli`), keep `gsd-query-tool.ts` as warn-and-shim | |
| C | Delete `gsd-query-tool.ts`; `$GSD_SDK` transform emits literal Bash | ✓ (initial) |

**User's choice:** C, justified by: "外部只有 0.20" → v1.0 was only published as 0.2.0, no real external users on the `gsd_query` Pi tool name, so a clean delete carries no migration cost.

**Notes:** Selecting C triggered a re-investigation of how the workflow then locates `gsd-tools.cjs` at user runtime (became the title-2 discussion below).

After reading upstream 1.2.0 workflow source, the framing collapsed further:
- Upstream 1.2.0 no longer emits `$GSD_SDK` tokens — it emits `gsd_run query …` (Bash shell function)
- So `prompt-transform.ts` `$GSD_SDK` regexes have **zero match targets** in 1.2.0 → dead code
- And `gsd_query` Pi tool has **zero callers** in 1.2.0 → dead infrastructure
- → Both deletions are unambiguous and merge with the launcher transform as the only real work

**Final captured decisions:** D-30 (delete `src/gsd-query-tool.ts`), D-31 (delete `transformGsdSdkCommands` + 4 regex), D-32 (net code change negative).

---

## gsd-tools.cjs invocation mechanism

Initial framing (before reading upstream 1.2.0 source):

| Option | Description | Selected |
|--------|-------------|----------|
| A | `child_process.spawn('node', [resolvedPath, ...args])` from Pi tool | |
| B | `require(resolvedPath)` in-process (if gsd-tools.cjs exports an API) | |
| C | Inline literal Bash in transform output | |

User instructed to read upstream first. Re-framing after reading `pitfall 3` (no hardcoded paths; must use `require.resolve()`):

| Option | Description | Selected |
|--------|-------------|----------|
| A' | Each workflow's initialize block runs `node -e require.resolve()` once, stores `$GSD_TOOLS` | (recommended) |
| B' | Pi extension injects `GSD_TOOLS` env at session_start via `resolveOfficialPackage()` | (deferred) |
| C' | Transform inlines `node "$(node -e ...resolve...)" <cmd>` per call | |

Final re-framing after extracting 1.2.0 tarball and reading `discuss-phase.md:112` + `_runtime-launcher.snippet.sh`:

- Upstream 1.2.0 inlines the launcher block (defining `gsd_run` shell function) into every workflow
- 4 fallbacks: project `get-shit-done/bin/`, `.claude/get-shit-done/bin/`, PATH `gsd-tools`, `$HOME/.claude/get-shit-done/bin/`
- **None of them include `node_modules/@opengsd/gsd-core/...`** — pi-gsd-core users (npm install) would always fail at "gsd-tools.cjs not found"
- → Real solution: transform that **augments** upstream's inline launcher with a `require.resolve`-based fallback-0

**User's choice:** Agreed with combined approach (titles 1+2 merged) when re-summarized: delete bridge + add launcher transform; project also renamed `pi-gsd-redux` → `pi-gsd-core`.

**Notes:** Pi extension env-injection (B') deferred to Phase 12 alongside Settings Bridge — the session_start hook there already plans GSD-state injection; adding `GSD_TOOLS` env is a natural extension.

**Final captured decisions:** D-29 (project rename), D-33 (new `transformGsdRunLauncher`), D-34 (concrete block shape), D-35 (purity + pipeline insertion), D-36 (package name hardcoded in transform output, not via constant indirection).

---

## DispatchLogger接入时机

| Option | Description | Selected |
|--------|-------------|----------|
| A | Phase 8 does not touch DispatchLogger | |
| B | Phase 8 default-injects `GSD_AUDIT=1` so all `gsd_run` invocations write trace | |
| C | Phase 8 adds doctor tip + README note; no default opt-in | ✓ |

**User's choice:** C — "ok，C"

**Notes:** Respects upstream's opt-in convention. Phase 9 Auto Orchestration can selectively enable `GSD_AUDIT=1` during `--auto`/`--chain` cycles (deferred). The Hub-level injection of a custom `DispatchLogger` is impossible from pi-gsd-core because `gsd-tools.cjs` runs in a separate subprocess — captured as a permanent constraint in CONTEXT.md deferred section.

**Final captured decisions:** D-37 (no auto-enable), D-38 (UPSTREAM-04 satisfied by Phase 7 impact.md verdict; no separate eval deliverable in Phase 8).

---

## Migration commit granularity

| Option | Description | Selected |
|--------|-------------|----------|
| A | Single atomic big-bang commit | |
| B | Fully atomic-per-file sequence, every step `npm run check` green | |
| C | 4 logical-layer commits (rename / package migration / bridge retirement / launcher transform) | ✓ |

**User's choice:** C

**Notes:** Each commit ends with `Phase: 08-upstream-1-2-0-upgrade-package-rename` (v1.0 convention). Commit 3 (bridge retirement) is the only commit whose mid-state is delicate — but because upstream 1.2.0 already removed `$GSD_SDK` from workflows, deleting the dead transform is non-regressing. Final commit ordering is the planner's call as long as each tip is `npm run check` green.

**Final captured decisions:** D-39 (4 logical-layer commits + exact split), D-40 (`npm run check` green at each tip), D-41 (phase tag in every commit message).

---

## Claude's Discretion

- Exact wording of doctor `GSD_AUDIT` tip
- Exact phrasing of `transformGsdRunLauncher` JSDoc and test names
- Verifying whether `src/gsd-models.ts:33` `sdk/shared/model-catalog.json` reference also breaks in 1.2.0 — flagged for plan-phase research
- Final placement of `transformGsdRunLauncher` within `applyPromptTransforms` if ordering constraints surface during implementation
- Whether commit 1 (rename) is precursor or folded — planner's call

---

## Deferred Ideas

- Pi extension `session_start` `GSD_TOOLS` env injection → Phase 12 (Settings Bridge)
- Auto-enable `GSD_AUDIT=1` for orchestrator runs → Phase 9 (Auto Orchestration)
- `OrchestrationLogger` module (sibling to DispatchLogger) → Phase 9
- gsd-pi-style in-process `DispatchLogger` injection → permanently not viable (subprocess boundary), not a future phase candidate
- `gsd_query` Pi tool deprecation cycle → collapses to clean delete (no external 1.0 users), MIGRATE-01 satisfied at Phase 8 close
