# Upstream 1.2.0 Impact Analysis — API Surface Catalog for Phase 8 Migration

**Phase:** 7
**Source:** `@opengsd/gsd-core@1.2.0` (npm, extracted from `opengsd-gsd-core-1.2.0.tgz`, 503 files)
**Date:** 2026-05-31

## Executive Summary

1. **Package renamed:** `@opengsd/get-shit-done-redux@1.1.0` → `@opengsd/gsd-core@1.2.0`. These are NOT aliases — the old name's latest version is still 1.1.0. Phase 8 must explicitly install the new package name.

2. **SDK directory removed entirely:** The `sdk/dist/query/*.js` path that pi-gsd-redux's `gsd_query` Pi tool depends on (36-route `COMMAND_ROUTE`, `src/gsd-query-tool.ts`) does not exist in 1.2.0. The import will fail at module resolution time.

3. **New surfaces replace the SDK:**
   - `gsd-tools.cjs` — 30+ atomic CLI commands covering config, state, phase, roadmap, requirements, milestones, validation, progress, intel
   - `gsd_run()` — shell function launcher with 4 fallback paths (defined in `_runtime-launcher.snippet.sh`)
   - `DispatchLogger` — structured dispatch-level observability seam with opt-in audit trail

## Structural Changes from 1.1.0 → 1.2.0

| Change | 1.1.0 State | 1.2.0 State | Impact on pi-gsd-redux |
|--------|-------------|-------------|------------------------|
| **Package name** | `@opengsd/get-shit-done-redux` | `@opengsd/gsd-core` | `src/official.ts:5` constant, `package.json` dependency, all path-rewrite inputs, comments, test fixtures must be renamed |
| **SDK directory** | `sdk/dist/query/*.js` (36 modules) | **Removed entirely** | `src/gsd-query-tool.ts` imports break at module resolution; 36-route `COMMAND_ROUTE` must be retired or rewired |
| **CLI bridge** | `$GSD_SDK` inline bash variable referencing `sdk/dist/query/` | `gsd-tools.cjs` (1,676 lines), 30+ CLI commands | `src/prompt-transform.ts` `$GSD_SDK` transforms must redirect from `gsd_query` Pi tool to direct `node gsd-tools.cjs` invocation |
| **gsd_run launcher** | Not present | Shell function in `_runtime-launcher.snippet.sh` with 4 fallback paths | Pi has no shell execution environment — cannot source `.sh` snippets. Phase 8 must use `require.resolve()` for path resolution |
| **Observability** | No event tracing | `DispatchLogger` (`observability/logger.cjs`) with `traceId`-based tracing, opt-in audit file (`.gsd-trace.jsonl`) | Usable as dispatch-level observability hook for v2.0 Auto Orchestration (per UPSTREAM-04) |
| **Command routing hub** | `sdk/dist/query/` modules routing | `command-routing-hub.cjs` (14.2 KB), accepts optional `logger: { onEvent }` injection seam | Wiring point for DispatchLogger in v2.0 |
| **bin/lib modules** | `bin/lib/*.cjs` (91 SD K-proxied modules) | `bin/lib/*.cjs` (50+ modules, no SDK dependency) | v2.0 must not import from any `bin/lib/*.cjs` to avoid coupling to internal implementation |
| **Hooks structure** | Unchanged in layout | 12 hooks in `hooks/` (Claude Code lifecycle hooks) | Not directly relevant to Pi runtime |

## gsd-tools CLI Surface Catalog

Verified against `get-shit-done/bin/gsd-tools.cjs` (1,676 lines, extracted from 1.2.0 tarball).

### Command Families

**Atomic Commands (20+):**
| Command | Purpose |
|---------|---------|
| `state load` | Load project config + state |
| `state json` | Output STATE.md frontmatter as JSON |
| `state update <field> <value>` | Update a STATE.md field |
| `state get [section]` | Get STATE.md content or section |
| `state patch --field val ...` | Batch update STATE.md fields |
| `state begin-phase --phase N --name S --plans C` | Update STATE.md for new phase start |
| `resolve-model <agent-type>` | Get model for agent based on profile |
| `find-phase <phase>` | Find phase directory by number |
| `commit <message> [--files ...]` | Commit planning docs |
| `verify-summary <path>` | Verify a SUMMARY.md file |
| `history-digest` | Aggregate all SUMMARY.md data |
| `summary-extract <path>` | Extract structured data from SUMMARY.md |
| `websearch <query>` | Search web via Brave API |

**Phase Operations (5):**
| Command | Purpose |
|---------|---------|
| `phase next-decimal <phase>` | Calculate next decimal phase number |
| `phase add <description>` | Append new phase to roadmap + create dir |
| `phase insert <after> <description>` | Insert decimal phase after existing |
| `phase remove <phase> [--force]` | Remove phase, renumber subsequent |
| `phase complete <phase>` | Mark phase done, update state + roadmap |

**Roadmap Operations (4):**
| Command | Purpose |
|---------|---------|
| `roadmap get-phase <phase>` | Extract phase section from ROADMAP.md |
| `roadmap analyze` | Full roadmap parse with disk status |
| `roadmap update-plan-progress <N>` | Update progress table from disk |
| `roadmap annotate-dependencies <N>` | Add wave dependency notes |

**Requirements, Milestone, Validation, Progress:**
| Command | Family |
|---------|--------|
| `requirements mark-complete <ids>` | Requirements |
| `milestone complete <version>` | Milestone |
| `validate consistency` | Validation |
| `validate health [--repair]` | Validation |
| `validate agents` | Validation |
| `progress [json\|table\|bar]` | Progress |

**Intel (9 commands):**
| Command | Purpose |
|---------|---------|
| `intel query <term>` | Query intel files |
| `intel status` | Show intel file freshness |
| `intel update` | Trigger intel refresh |
| `intel diff` | Show changed intel entries |
| `intel snapshot` | Save current intel state |
| `intel patch-meta <file>` | Update _meta.updated_at |
| `intel validate` | Validate intel file structure |
| `intel extract-exports <file>` | Extract exported symbols |
| `intel api-surface` | Render API-SURFACE.md |

**UAT/Audit:** `audit-uat`, `audit-open`, `uat render-checkpoint`
**Scaffolding:** `scaffold context/uat/verification/phase-dir`
**Frontmatter CRUD:** `frontmatter get/set/merge`
**Todos:** `todo complete`

### Usage Pattern

All commands follow: `node gsd-tools.cjs <command> [args] [--raw] [--pick <field>]`

- `--raw` — return unformatted JSON
- `--pick <field>` — extract a specific field from JSON result

## gsd_run Launcher Convention

### What It Is

`gsd_run` is **NOT a binary** — it is a shell function defined in `_runtime-launcher.snippet.sh`:

```bash
_GSD_SHIM_NAME="gsd-tools.cjs"
_GSD_RUNTIME_ROOT="${RUNTIME_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Fallback path 1: project get-shit-done/bin/
GSD_TOOLS="${_GSD_RUNTIME_ROOT}/get-shit-done/bin/${_GSD_SHIM_NAME}"

if [ -f "$GSD_TOOLS" ]; then
  gsd_run() { node "$GSD_TOOLS" "$@"; }
# Fallback path 2: .claude/get-shit-done/bin/
elif [ -f "${_GSD_RUNTIME_ROOT}/.claude/get-shit-done/bin/${_GSD_SHIM_NAME}" ]; then
  GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.claude/get-shit-done/bin/${_GSD_SHIM_NAME}"
  gsd_run() { node "$GSD_TOOLS" "$@"; }
# Fallback path 3: PATH
elif command -v gsd-tools >/dev/null 2>&1; then
  GSD_TOOLS="$(command -v gsd-tools)"
  gsd_run() { "$GSD_TOOLS" "$@"; }
# Fallback path 4: user home .claude
elif [ -f "$HOME/.claude/get-shit-done/bin/${_GSD_SHIM_NAME}" ]; then
  GSD_TOOLS="$HOME/.claude/get-shit-done/bin/${_GSD_SHIM_NAME}"
  gsd_run() { node "$GSD_TOOLS" "$@"; }
fi
```

### Pi Runtime Implication

**Pi does not have a shell execution environment** for sourcing `.sh` snippets. `gsd_run` cannot be called from Pi tools, extension hooks, or transform output.

**Phase 8 recommendation:** Do NOT attempt to reimplement `gsd_run` or source the snippet. Instead:
1. Use `require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs')` to get the resolved path
2. Invoke `node <resolvedPath> <command> [args]` via Pi's `exec` tool or a dedicated Pi tool registration
3. The 4 fallback paths in `gsd_run` become irrelevant — npm's `require.resolve()` already handles resolution

**Pitfall:** Do not hardcode the path to `gsd-tools.cjs` (e.g., `node ${node_modules}/@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs`). The path varies across install locations (global, local, linked, pnpm hoisted). Use `require.resolve()`.

## DispatchLogger Seam Assessment

### API Surface

Verified against `observability/event.cjs`, `observability/logger.cjs`, `observability/redaction.cjs`.

**Interface:**
```typescript
interface DispatchLogger {
  onEvent(event: DispatchEvent): void;
}
```

**DispatchEvent shape** (from `event.cjs` `makeDispatchEvent`):
```
{
  traceId:        string           // UUID v4, generated per dispatch
  parentTraceId:  string|undefined // propagated when valid UUID v4
  command:        string           // the dispatched command verb
  args?:          unknown          // only when includeArgs=true AND GSD_AUDIT_ARGS=1
  result:         {                // HubResult
    kind: "ok" | "UnknownCommand" | "InvalidArgs" | "HandlerRefusal" | "HandlerFailure",
    ...payload
  }
  timestamp:      string           // ISO 8601
}
```

**Default behavior** (`createDefaultLogger`):
- **Silent on success** — no stdout/stderr when `result.kind === 'ok'`
- **Structured JSON to stderr on error** — flattened `{ kind, traceId, ...typedPayload }` per line
- **Opt-in audit file** — when `GSD_AUDIT=1` or `config.audit.enabled=true`, appends every event (success + error) as one JSON line to `.planning/.gsd-trace.jsonl`
- **Args redacted by default** — `includeArgs` default is `false`; args only in events when `GSD_AUDIT_ARGS=1` set via `redaction.cjs` `shouldIncludeArgs()`
- **Crash-safe** — uses synchronous `fs.appendFileSync` (dispatch is synchronous); creates `.planning/` if absent
- **No-op default** — `createNoOpLogger()` silently drops all events; Hub uses this when no logger is injected

**Wiring point** (`command-routing-hub.cjs`):
The Hub accepts optional `logger: { onEvent }` parameter. Calls `logger.onEvent(event)` after every dispatch. The check is `typeof logger.onEvent === 'function'` — any object with `onEvent` satisfies the interface.

### UPSTREAM-04 Suitability Verdict

| Criterion | Assessment |
|-----------|-----------|
| **Structured tracing** | ✅ `traceId` (UUID v4) + `parentTraceId` propagation enables end-to-end dispatch correlation |
| **Opt-in audit file** | ✅ `.gsd-trace.jsonl` is crash-safe (sync append) and opt-in — no performance penalty when disabled |
| **Error surface** | ✅ Structured stderr JSON on errors with flattened `kind` + typed payload |
| **Args redaction** | ✅ Redacted by default (`GSD_AUDIT_ARGS=1` opt-in) |
| **Scope limitation** | ⚠️ Hub dispatch events only — does NOT cover orchestration lifecycle transitions (Unit dispatch decisions, gate outcomes, state transitions) |
| **No telemetry/aggregation** | ⚠️ Raw JSONL lines only — no built-in aggregation, time-series, or dashboard integration |

**Recommendation for v2.0 (UPSTREAM-04):**
- **Use `DispatchLogger` for Hub-level dispatch tracing** — wire it into Phase 8's `gsd-tools.cjs` invocations
- **Add a separate `OrchestrationLogger`** for orchestration lifecycle events (Unit dispatch decisions, gate outcomes, state transitions), following the same `{ onEvent }` pattern and writing to the same `.gsd-trace.jsonl` with a different event type discriminator field
- The audit file format (one JSON line per event, sync append) is suitable for v2.0's synchronous dispatch model

## State of the Art Comparison

| Old Approach (v1.0) | New Approach (v1.2.0) | Impact |
|---------------------|----------------------|--------|
| `gsd_query` Pi tool (91-route `COMMAND_ROUTE`) → `sdk/dist/query/*.js` | `gsd-tools.cjs` (30+ CLI commands) + `gsd_run()` shell launcher | Pi cannot use `gsd_run` (no shell); must call `node gsd-tools.cjs` directly via `require.resolve()` |
| `AUTO_MODE_CHECKLIST` prompt injection for `--chain`/`--auto` compliance | Native TS orchestration (Phase 9) + `advance()` loop | Prompt injection is no longer the orchestration mechanism — removed in Phase 9 |
| `@opengsd/get-shit-done-redux@1.1.0` | `@opengsd/gsd-core@1.2.0` | Package rename — all references, imports, path rewrites, comments, test fixtures must be updated in Phase 8 |
| No event tracing | `DispatchLogger` seam with `traceId`-based audit trail (`.gsd-trace.jsonl`) | Phase 8 can wire observability; Phase 9 Auto Orch can extend with orchestration lifecycle events |

## Phase 8 Migration Checklist

Concrete code locations requiring changes for the 1.2.0 upgrade:

| # | File | Change | Action |
|---|------|--------|--------|
| 1 | `src/official.ts:5` | `OFFICIAL_PACKAGE_NAME` constant | `"@opengsd/get-shit-done-redux"` → `"@opengsd/gsd-core"` |
| 2 | `package.json` | Dependency declaration | `"@opengsd/get-shit-done-redux": "1.1.0"` → `"@opengsd/gsd-core": "1.2.0"` |
| 3 | `src/gsd-query-tool.ts:76` | `SDK_PACKAGE` import path | `sdk/dist/query/*.js` does not exist in 1.2.0 — module resolution will fail. Either delete the file (MIGRATE-03) or rewire to `gsd-tools.cjs` |
| 4 | `src/prompt-transform.ts:771,838,865,881` | `$GSD_SDK` regex transforms (4 patterns) | Redirect from `gsd_query({...})` to direct `node gsd-tools.cjs` invocation or native State Reconciliation calls (UPSTREAM-03) |
| 5 | `src/rewrite-workflow-paths.ts:7,30,56` | Path rewrite input patterns | Old package name strings in comments and `OFFICIAL_PACKAGE_NAME` reference — updated automatically when #1 changes |
| 6 | `src/generator.ts:15,90,151,160` | `OFFICIAL_PACKAGE_NAME` usage | Updated automatically when #1 changes |
| 7 | All test fixtures | Package name references in test data | Find-and-replace `@opengsd/get-shit-done-redux` → `@opengsd/gsd-core` |
| 8 | All comments | Inline documentation mentioning old package name | Find-and-replace across `src/` |
| 9 | `npm run check` | Full gate: typecheck + test + build + doctor | Must pass with `@opengsd/gsd-core@1.2.0` installed |

## Common Pitfalls for Phase 8

**Pitfall 1: Assuming `$ARGUMENTS` is env var or tool input.** `$ARGUMENTS` is a template placeholder substituted by Pi's `prompt-templates.js` before the LLM sees the prompt. Phase 8 does not need to change this mechanism — it is Pi-owned.

**Pitfall 2: Treating `gsd-tools.cjs` as an SDK replacement.** `gsd-tools.cjs` is a CLI transition bridge, not a programmatic API. v2.0's State Reconciliation module (Phase 10) is the intended long-term replacement for SDK-style programmatic access. Phase 8 should use `gsd-tools.cjs` as a stopgap, not a target architecture.

**Pitfall 3: Skipping `_runtime-launcher.snippet.sh` resolution logic.** The 4 fallback paths in the snippet cover standard installation locations. Hardcoding a path (e.g., `./node_modules/@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs`) fails when the package is installed globally, linked, or hoisted by pnpm. Use `require.resolve()` instead.

**Pitfall 4: Assuming old package name aliases to new.** `npm install @opengsd/get-shit-done-redux` installs 1.1.0 (old), not 1.2.0 (new). Phase 8 must explicitly install `@opengsd/gsd-core@1.2.0`.

---

*Per D-04: This is a surface catalog for code-level inspection, NOT a full v1.1.0→v1.2.0 diff. Phase 8 performs the actual diff and migration.*
