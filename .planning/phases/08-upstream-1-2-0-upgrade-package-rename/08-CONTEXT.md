# Phase 8: Upstream 1.2.0 Upgrade + Package Rename - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 is a stopgap-scoped upgrade phase. It executes the migration identified by Phase 7's upstream impact analysis: rename the upstream package reference (`@opengsd/get-shit-done-redux@1.1.0` → `@opengsd/gsd-core@1.2.0`), retire all SDK-bridge code that targets the removed `sdk/dist/query/*.js` surface, and add a new launcher transform that lets Pi's Bash tool locate `gsd-tools.cjs` inside `node_modules/`. Additionally, the pi-gsd-redux project itself is renamed to **pi-gsd-core** to align with the new upstream package family.

No v2.0 module implementation belongs in this phase — Auto Orchestration (Phase 9), State Reconciliation (Phase 10), Worktree Safety + Recovery Classification (Phase 11), Tool Contract + Settings Bridge (Phase 12), and SDK retirement closeout (Phase 13) all stand on Phase 8's stable 1.2.0 foundation.

Per Phase 7 spike pitfall 2: `gsd-tools.cjs` is a CLI transition bridge, **not** a programmatic API. Phase 8 treats it as stopgap, not target architecture.

</domain>

<decisions>
## Implementation Decisions

### Project Rename
- **D-29:** Rename the project itself: `pi-gsd-redux` → `pi-gsd-core`. Affects `package.json` `name` field, `bin` entry, `description`, README/CLAUDE.md/docs prose, CLI self-references in `src/cli.ts`, and test fixtures that reference the old name. The GitHub repo URL (`pi-gsd`) stays — that's a repo slug, not a package identifier.
- **Why:** Aligns with the upstream rename family (`@opengsd/gsd-core`); avoids confusion where the adapter package name mismatches the upstream identity.

### Bridge Surface (SDK retirement)
- **D-30:** **Delete `src/gsd-query-tool.ts` entirely.** Upstream 1.2.0 workflows no longer emit `$GSD_SDK query …` — they emit `gsd_run query …` (a Bash shell function defined inline in each workflow). Pi's Bash tool runs `gsd_run` directly; no Pi tool middleware is needed. The 247-line `gsd_query` Pi tool has no callers in 1.2.0 output.
- **D-31:** **Delete `transformGsdSdkCommands` + 4 `$GSD_SDK` regex patterns from `src/prompt-transform.ts`** (positions 771/838/865/881/889). Upstream 1.2.0 source workflows do not contain `$GSD_SDK` tokens — the regex would never match. Removing the dead transform reduces maintenance surface. This explicitly resolves the v1.0 D-19/D-22 "revisit in v2.0" flag.
- **D-32:** **Net code change in bridge surface is negative** — pi-gsd-core ships less code after Phase 8 than pi-gsd-redux did at v1.0 close, while gaining 1.2.0 compatibility.

### Launcher Transform (Pi-side gap fix)
- **D-33:** Add a new pure transform `transformGsdRunLauncher` in `src/prompt-transform.ts`. It detects upstream's inline 4-fallback launcher block (anchor: the literal `_GSD_SHIM_NAME="gsd-tools.cjs"`) and **prepends a fallback-0** that uses `require.resolve` to find `gsd-tools.cjs` inside `node_modules/@opengsd/gsd-core/get-shit-done/bin/`. The upstream 4-fallback chain is preserved as-is for non-npm install paths (Claude Code `.claude/get-shit-done/`, global PATH, `$HOME/.claude/`).
- **D-34:** Concrete inserted block shape (Bash, semicolon-separated to stay single-line per upstream convention):
  ```bash
  _GSD_SHIM_NAME="gsd-tools.cjs"; GSD_TOOLS="$(node -e "console.log(require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs'))" 2>/dev/null)"; if [ -n "$GSD_TOOLS" ] && [ -f "$GSD_TOOLS" ]; then gsd_run() { node "$GSD_TOOLS" "$@"; }; else <upstream 4-fallback preserved>; fi
  ```
- **D-35:** `transformGsdRunLauncher` is **pure** (string in, string out; no `fs`/`path`/`os`) per the layering rule in CLAUDE.md. Insert it into `applyPromptTransforms` **after** `rewriteWorkflowPaths` and **before** the existing `normalizeGsdSlashReferences` step. Test coverage: upstream launcher line → augmented block; idempotent (running transform twice = identity); no false positives on lines containing only the substring `gsd-tools.cjs`.
- **D-36:** Do **not** use `OFFICIAL_PACKAGE_NAME` constant for the embedded `require.resolve` argument string — the constant is a build-time TS value, but the transform emits a literal Bash command that will be eval'd at user runtime. The package name `@opengsd/gsd-core` is hardcoded in the transform output (it is the package this transform was written against; a future rename would require a new Phase).

### Observability (DispatchLogger seam)
- **D-37:** **Do not auto-enable DispatchLogger in Phase 8.** Respect upstream's opt-in convention (`GSD_AUDIT=1` env var). Adding a `doctor` tip ("set `GSD_AUDIT=1` to enable dispatch trace at `.planning/.gsd-trace.jsonl`") and a one-paragraph README note is sufficient.
- **Why:** Phase 8 is stopgap; auto-enabling audit writes a `.gsd-trace.jsonl` file users didn't ask for, reversing upstream's deliberate default. Phase 9 Auto Orchestration is the natural owner of orchestration-lifecycle observability (per impact.md's "OrchestrationLogger" recommendation), and it can decide whether to set `GSD_AUDIT=1` per orchestration run.
- **D-38:** UPSTREAM-04 (DispatchLogger suitability assessment) is satisfied by Phase 7's impact.md verdict ("✅ usable; ⚠️ Hub-only scope, no orchestration lifecycle"). Phase 8 does not need a separate evaluation deliverable.

### Migration Commit Granularity
- **D-39:** Phase 8 plan splits work into **4 logical-layer commits** (not one big-bang, not per-file atomic):
  1. `chore(08): rename project pi-gsd-redux → pi-gsd-core` — package.json `name`/`bin`/`description`, README, CLAUDE.md, CLI self-refs, test fixtures using old project name
  2. `feat(08): migrate to @opengsd/gsd-core@1.2.0` — `src/official.ts` `OFFICIAL_PACKAGE_NAME` constant, `package.json` dependency, `npm install` run, all test fixtures + comments + path-rewrite inputs that reference the upstream package name
  3. `feat(08): retire $GSD_SDK Pi-tool bridge` — delete `src/gsd-query-tool.ts`, delete `transformGsdSdkCommands` + 4 regex patterns from `src/prompt-transform.ts`, delete related tests, update CLAUDE.md to remove the `gsd_query` tool reference and the `$GSD_SDK` transform pipeline mention
  4. `feat(08): add gsd_run launcher transform for Pi runtime` — new `transformGsdRunLauncher` in `src/prompt-transform.ts`, pure-function tests, pipeline insertion, regenerate `generated/workflows/`, `doctor` DispatchLogger tip (D-37), `npm run check` green
- **D-40:** **`npm run check` must be green at the tip of each commit.** Commit 3 (bridge retirement) is the trickiest — at HEAD of commit 3, upstream 1.2.0 workflows already do not emit `$GSD_SDK`, so deleting the dead transform plus tests does not regress anything. Commit 2 introduces 1.2.0 npm install (already cleared of SDK directory references after commit 3 is sequenced last? — re-check during plan-phase whether commits 2/3 must swap; final ordering is planner's call as long as each tip is green).
- **D-41:** Each commit message ends with `Phase: 08-upstream-1-2-0-upgrade-package-rename` per v1.0 commit convention.

### Claude's Discretion
- Exact wording of the doctor `GSD_AUDIT` tip
- Exact phrasing of the `transformGsdRunLauncher` JSDoc and test names
- Decision whether `src/gsd-models.ts:33` comment ("Loaded from `@opengsd/get-shit-done-redux/sdk/shared/model-catalog.json`") needs the path updated or whether that file location also changed in 1.2.0 (planner should verify against installed 1.2.0; if `sdk/shared/model-catalog.json` is also gone in 1.2.0, model routing needs its own rewire — flag for plan-phase research)
- Whether commit 1 (rename) should happen as a precursor (clean v1.0-state base) or be folded into a different commit
- Final placement of `transformGsdRunLauncher` within `applyPromptTransforms` if ordering constraints surface during implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 7 spike artifacts (PRIMARY — Phase 8 executes against these)
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/upstream-1.2.0-impact.md` — Full upstream 1.2.0 surface catalog: gsd-tools.cjs CLI commands, gsd_run launcher convention, DispatchLogger seam, 9-item migration checklist, 4 pitfalls
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/07-CONTEXT.md` — Phase 7 decisions (D-01 through D-11) including spike methodology
- `.planning/phases/07-pi-runtime-spike-gsd-pi-module-mapping/spike/pi-argv.md` — Pi `$ARGUMENTS` substitution contract (not directly modified in Phase 8 but reference for argv-aware transforms)

### Project requirements & roadmap
- `.planning/REQUIREMENTS.md` §UPSTREAM (UPSTREAM-01, UPSTREAM-02, UPSTREAM-03, UPSTREAM-04) — Phase 8 acceptance requirements
- `.planning/REQUIREMENTS.md` §MIGRATE (MIGRATE-02) — SDK import retirement requirement
- `.planning/ROADMAP.md` §Phase 8 — success criteria
- `.planning/PROJECT.md` — v2.0 strategic direction (Path B), D-19/D-22 "revisit in v2.0" flag now resolved
- `.planning/STATE.md` — D-12 (1.1.0 pin will be lifted), D-25, D-27 (Phase 8 placement rationale)

### Current codebase (v1.0 reference — to be modified)
- `src/official.ts:5` — `OFFICIAL_PACKAGE_NAME` constant
- `src/gsd-query-tool.ts` — entire file to be deleted (D-30)
- `src/prompt-transform.ts:751-911` — `$GSD_SDK` transforms to be deleted (D-31); new `transformGsdRunLauncher` to be added near `applyPromptTransforms` (D-35)
- `src/rewrite-workflow-paths.ts:7,30,56` — path rewrite input comments referencing old package name
- `src/generator.ts:15,90,151,160` — `OFFICIAL_PACKAGE_NAME` usage (cascades automatically when D-30 applied)
- `src/gsd-models.ts:33` — comment referencing `sdk/shared/model-catalog.json` (verify 1.2.0 location during planning)
- `package.json` — `name`, `bin`, `description`, dependency entry
- `CLAUDE.md` — sections on gsd_query tool and `$GSD_SDK` transform need updating

### Upstream 1.2.0 reference (extracted, available locally for verification)
- `/tmp/gsd-core-12/package/get-shit-done/workflows/discuss-phase.md:112` — example of upstream's inline launcher block (verified during discussion; identical to `_runtime-launcher.snippet.sh` content)
- `/tmp/gsd-core-12/package/get-shit-done/workflows/_runtime-launcher.snippet.sh` — canonical 4-fallback launcher source
- npm: `@opengsd/gsd-core@1.2.0` (installable; pinned target for `package.json`)

### Layering rules (must hold across all commits)
- `CLAUDE.md` §Architecture — 4-layer pipeline boundaries (entry / app services / pure transforms / resolvers+safety)
- `CLAUDE.md` §Conventions — `.js` extensions on local imports; pure transforms stay pure; services return don't print; postinstall must never fail; Pi hooks must never throw

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/prompt-transform.ts::applyPromptTransforms` pipeline** — `transformGsdRunLauncher` inserts as one more step in the existing chain; same `(text: string) => string` signature; same pure-function discipline. No new layering or infrastructure.
- **`src/official.ts::resolveOfficialPackage()`** — already handles `require.resolve()` of the upstream package + its subpaths. The rename to `@opengsd/gsd-core` flows through this function automatically when `OFFICIAL_PACKAGE_NAME` changes.
- **`tests/prompt-transform.test.ts`** — established pure-transform test style (string in → expected string out, idempotency assertions). New `transformGsdRunLauncher` tests follow the same pattern.
- **Existing path rewrite chain (`rewriteWorkflowPaths`)** — already rewrites `node_modules/@opengsd/get-shit-done-redux/...` → Pi-friendly absolute paths. Updates automatically when constant changes.

### Established Patterns
- **Pure transforms in `src/*-transform.ts` never import `fs`/`path`/`os`** — `transformGsdRunLauncher` must stay pure (CLAUDE.md hard rule; enforced by code review). Path resolution happens at user runtime via the Bash `node -e require.resolve(...)` invocation, not at transform time.
- **Commit messages tag the phase** — `chore(08): ...` / `feat(08): ...` per v1.0 convention.
- **`OFFICIAL_PACKAGE_NAME` is the single source of truth for upstream package name** — all rewrite logic reads from it; only one constant changes upstream.
- **GSD planning workflow** — phase artifacts under `.planning/phases/NN-slug/` per `.gsd/init` schema.

### Integration Points
- **`applyPromptTransforms` execution order** — `transformGsdRunLauncher` placement: after `rewriteWorkflowPaths` (so upstream package paths are already canonical before launcher detection), before existing `transformAskUserQuestionForPi` family (independent surfaces, no ordering coupling expected — but flagged for planner verification).
- **`npm run generate`** — must be re-run after Phase 8 to regenerate `generated/prompts` + `generated/agents` + `generated/workflows` against `@opengsd/gsd-core@1.2.0`. Final commit (4) includes regenerated artifacts.
- **`npm run check` gate** — typecheck + test + build + doctor must be green at every commit tip per D-40.
- **CI publish workflow (`.github/workflows/publish.yml`)** — references `package.json` name; the project rename in commit 1 changes what's published. v2.0 publish is out of scope for Phase 8 (deferred per v1.0 close), but the publish workflow file must be updated to the new name during commit 1.
- **`scripts/postinstall.mjs`** — runs `dist/cli.js postinstall`; must not regress under the rename (cli bin name change). Verify in commit 1.

</code_context>

<specifics>
## Specific Ideas

- User explicitly confirmed: v1.0 was only published as `0.2.0`; there are no external users on the `gsd_query` Pi tool name, so the bridge retirement (D-30/D-31) does not need a backwards-compat shim or deprecation warning cycle.
- User explicitly confirmed: project rename `pi-gsd-redux` → `pi-gsd-core` (D-29). Aligns the adapter name with the upstream package family it consumes.
- Phase 7 spike's `upstream-1.2.0-impact.md` "Phase 8 Migration Checklist" (9 items) is treated as authoritative — planner should produce a plan unit per logical layer (D-39's 4 commits) that collectively cover all 9 items + the 3 deletions (D-30/D-31) + 1 addition (D-33).
- Discussion explicitly traced `node_modules/@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs` location by extracting the 1.2.0 tarball locally — confirmed launcher block content matches `_runtime-launcher.snippet.sh` literally, and confirmed upstream's 4 fallbacks do NOT include `node_modules/`, which is exactly why `transformGsdRunLauncher` must add fallback-0.

</specifics>

<deferred>
## Deferred Ideas

- **Pi extension `session_start` injection of `GSD_TOOLS` env var** (originally floated as title-2 option B). Deferred to **Phase 12** alongside Settings Bridge (SETTINGS-01/02). The Phase 12 work already plans to surface GSD state in Pi prompt context at session_start — injecting `GSD_TOOLS` env from `resolveOfficialPackage()` slots naturally into the same hook. If that env-injection lands in Phase 12, `transformGsdRunLauncher` can be simplified (or removed) by having the launcher block prefer `$GSD_TOOLS` when present.
- **Auto-enable `GSD_AUDIT=1` for orchestrator runs** (title-3 option B). Deferred to **Phase 9** Auto Orchestration. Phase 9 can set `GSD_AUDIT=1` inside the orchestrator process for the duration of an `--auto` / `--chain` cycle, then unset — giving observability when it matters without polluting normal workflow runs.
- **OrchestrationLogger module** (impact.md UPSTREAM-04 recommendation, distinct from DispatchLogger). Belongs to **Phase 9** — Auto Orchestration owns orchestration-lifecycle events and is the natural place to introduce a sibling logger writing to the same `.gsd-trace.jsonl`.
- **`gsd-pi`-style command-routing-hub injection of a custom `DispatchLogger`** — not viable from pi-gsd-core because `gsd-tools.cjs` runs in a separate node subprocess; we cannot inject `{ onEvent }` from outside the process. Permanent constraint, not a future phase candidate.
- **`gsd_query` Pi tool deprecation cycle / migration warning** (MIGRATE-01 requirement). Because there are no external users on v1.0's `gsd_query` (D-30 rationale), the deprecation cycle collapses to a clean delete in Phase 8. MIGRATE-01 is effectively satisfied at Phase 8 close without a separate deprecation-warning phase.

</deferred>

---

*Phase: 8-Upstream 1.2.0 Upgrade + Package Rename*
*Context gathered: 2026-05-31*
