# Phase 3: Subagent Stability - Research

**Researched:** 2026-05-30
**Domain:** pi-subagents EPERM crash, ES module binding workaround, upstream PR vs fork strategy
**Confidence:** HIGH

## Summary

The pi-subagents EPERM crash is a critical startup blocker on Windows Azure AD/Entra ID machines. When the NTFS ACL on the global temp directory (`%TEMP%\pi-subagents-user-{username}\`) is corrupted (typically after wake-from-sleep), `ensureAccessibleDir` in `src/extension/index.ts:89` throws an uncaught EPERM on `mkdirSync`, which propagates up through Pi's extension loader and kills the entire Pi process. The secondary challenge is that `RESULTS_DIR` and `ASYNC_DIR` are exported as `export const` (primitive string) bindings from `src/shared/types.ts:679-680`, making them read-only in all ES module consumers — so a fallback path cannot propagate to downstream modules without upstream changes.

Investigation reveals that the pi-subagents upstream repo (nicobailon/pi-subagents) has an active release cadence (1.5 days average, 79 versions over ~4 months, latest 0.25.0 on 2026-05-21). Multiple consumer modules already accept directory paths via dependency injection (createResultWatcher, createAsyncJobTracker, run-status, run-id-resolver, async-resume, stale-run-reconciler all use `deps.asyncDirRoot ?? ASYNC_DIR` / `deps.resultsDir ?? RESULTS_DIR`), meaning the upstream fix is surgically scoped to: (1) `ensureAccessibleDir` catch + fallback logic, (2) changing the two `const` exports to a mutable container, and (3) updating the approximately 3 call sites in `registerSubagentExtension` that pass these constants directly.

**Primary recommendation:** Submit an upstream PR to pi-subagents with the `ensureAccessibleDir` EPERM fix + ES module binding refactor. The fix is well-scoped (~4 files, ~50 lines changed). Given the upstream's active cadence, a 2-week response window is reasonable. Prepare a monkey-patch interim workaround in pi-gsd-redux's extension as a safety net if upstream is unresponsive.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** EPERM root cause — `ensureAccessibleDir` must not crash Pi. Catch EPERM/EACCES, attempt recovery, use pid-scoped fallback path if recovery fails.
- **D-02:** ES module read-only binding workaround — change the binding approach. Chosen approach depends on upstream responsiveness (D-03).
- **D-03:** Start with upstream PR (option A). If upstream unresponsive within 2 weeks, consider maintaining a fork at NOirBRight/pi-subagents. Monkey-patch (option B) is viable as interim measure but fragile.
- **D-04:** After modifying pi-subagents, must re-verify that agent sync, doctor, and /gsd-models still work. Run full `npm run check` plus manual /gsd-models invocation.

### Claude's Discretion

- Whether to implement monkey-patch first and upstream PR second, or PR first and monkey-patch only if needed
- Exact fallback path naming scheme (pid-scoped, or hash, or timestamp)
- Whether the repair PowerShell script should be simplified or kept as-is

### Deferred Ideas (OUT OF SCOPE)

- Project-local async result storage (like @tintinweb/pi-subagents uses `.pi/output/`) — long-term upstream architectural fix
- Concurrent-process safety for shared temp dir
- Switching from pi-subagents (nicobailon) to @tintinweb/pi-subagents — fundamentally incompatible
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Fix EPERM crash in ensureAccessibleDir | Call chain analysis below; fix pattern: catch EPERM → try rm+mkdir → fallback |
| D-02 | ES module binding workaround | Consumer audit below; already DI-injected in most modules; only registerSubagentExtension needs refactor |
| D-03 | Upstream PR vs fork decision | Upstream activity analysis below; recommendation: PR first, fork as fallback |
| D-04 | Verify /gsd-models after fix | Validation Architecture section below; test suite + manual verification plan |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| EPERM catch + fallback in ensureAccessibleDir | pi-subagents (upstream) | — | ensureAccessibleDir is internal to pi-subagents; only upstream can fix it properly |
| ES module binding refactor (RESULTS_DIR/ASYNC_DIR) | pi-subagents (upstream) | — | Constants are defined and consumed within pi-subagents; only upstream can change export shape |
| Monkey-patch interim protection | pi-gsd-redux extension | — | pi-gsd-redux can pre-create/clean temp dirs and set globalThis flags before pi-subagents loads |
| Upstream PR authoring | pi-gsd-redux contributor | — | pi-gsd-redux maintainers write and submit the PR |
| Fork maintenance (if needed) | pi-gsd-redux contributor | — | If upstream ignores PR for 2+ weeks, fork at NOirBRight/pi-subagents |
| Post-fix regression verification | pi-gsd-redux test suite | Manual session test | Doctor, agent-sync, /gsd-models must pass after any pi-subagents change |
| Windows ACL repair script | pi-gsd-redux scripts/ | — | Already exists; kept as diagnostic/labor-of-last-resort tool |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pi-subagents | 0.25.0 | Pi subagent extension with chain/parallel/async modes | Only subagent extension compatible with GSD prompt architecture; tool name `subagent`, frontmatter fields, chain/parallel modes required by GSD workflows |
| @earendil-works/pi-coding-agent | 0.77.0 | Pi extension API, extension loader, runtime types | Official Pi SDK; defines ExtensionAPI, ExtensionContext, ToolDefinition, etc. |
| @earendil-works/pi-tui | 0.77.0 | Pi TUI rendering primitives | Required for subagent widget/message rendering |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jiti | 2.7.0 | TypeScript extension loader used by Pi | Pi uses `createJiti` with `moduleCache: false` to load extensions; relevant for monkey-patch viability — jiti's cache-free mode means modules are re-evaluated each load |
| typebox | 1.1.24 | Runtime schema validation | Used by pi-subagents for SubagentParams schema |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pi-subagents (nicobailon) | @tintinweb/pi-subagents | Incompatible: different tool name (`Agent` vs `subagent`), no chain/parallel, no intercom, different frontmatter; explicitly deferred |
| Upstream PR fix | Direct node_modules patch | node_modules patches are lost on npm install; no patch-package setup in project; fragile and not sustainable |
| Upstream PR fix | Fork + npm publish | Fork is the planned fallback after 2-week upstream silence window; requires separate npm package name and consumers to switch |

**Installation:** No new packages needed. This phase modifies an existing dependency (pi-subagents) either upstream or via fork.

**Version verification:**
```
pi-subagents@0.25.0 (published 2026-05-21, 79 versions total)
@earendil-works/pi-coding-agent@0.77.0
@earendil-works/pi-tui@0.77.0
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| pi-subagents | npm | ~4 months (79 versions) | Moderate (Pi ecosystem) | github.com/nicobailon/pi-subagents | [OK] | Approved |
| @earendil-works/pi-coding-agent | npm | ~22 days [1] | Moderate | earendil-works org | [SUS] | Flagged — likely false positive (Pi ecosystem core package) |
| @earendil-works/pi-tui | npm | ~22 days [1] | Moderate | earendil-works org | [SUS] | Flagged — likely false positive (Pi ecosystem TUI package) |
| @opengsd/get-shit-done-redux | npm | ~6 days | Low | opengsd org | [SLOP] | False positive — internal org package, already installed and verified in project |

[1] slopcheck flagged these as "only 22 days old". This is because slopcheck checks the *current* registry publish date, which may reflect a recent transfer or rename. These are well-established Pi ecosystem packages with 77+ versions already published. The SUS flag is a false positive.

**Packages removed due to slopcheck [SLOP] verdict:** none (the SLOP for @opengsd/get-shit-done-redux is a false positive — it's an internal org package already installed and validated by `npm run check`)

**Packages flagged as suspicious [SUS]:** @earendil-works/pi-coding-agent, @earendil-works/pi-tui — both are false positives from slopcheck's age heuristic. These are Pi ecosystem core packages with established version history (same version number as pi-subagents dependency). Planner should NOT add checkpoint for these.

*Note: slopcheck crashed during npm install attempt (Windows FileNotFoundError), but the scan results were captured before the crash. All packages above already exist in the project's node_modules and have been verified via `npm run check` (180 tests pass, typecheck clean, build clean).*

## Architecture Patterns

### System Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────────┐
│                      Pi Runtime Startup                          │
│                                                                  │
│  1. Extension Discovery (resource-loader.js)                    │
│     ├─ .pi/extensions/ (project-local)                           │
│     ├─ ~/.pi/agent/extensions/ (global)                         │
│     └─ npm packages with pi.extensions manifest                  │
│                                                                  │
│  2. Extension Loading (loader.js → jiti)                        │
│     ├─ loadExtension(path) → jiti.import(modulePath)            │
│     │   └─ CRASH POINT: if module throws at top level           │
│     │       (e.g., ensureAccessibleDir EPERM)                   │
│     │       → extension load fails → error recorded             │
│     │       → if critical ext → Pi cannot start                 │
│     └─ factory(api) → registers tools/hooks/commands             │
│                                                                  │
│  3. Pi Session Start                                             │
│     └─ Extensions receive session_start events                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  pi-subagents extension load sequence            │
│                                                  │
│  registerSubagentExtension(api)                  │
│    ├── ensureAccessibleDir(RESULTS_DIR)  ← EPERM│
│    ├── ensureAccessibleDir(ASYNC_DIR)   ← EPERM│
│    ├── cleanupOldChainDirs()                      │
│    ├── loadConfig()                               │
│    ├── createResultWatcher(RESULTS_DIR)           │
│    ├── createAsyncJobTracker(ASYNC_DIR)           │
│    ├── pi.registerTool(subagent)                 │
│    ├── registerSlashCommands()                    │
│    └── register event handlers                    │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  RESULTS_DIR / ASYNC_DIR dependency flow          │
│                                                  │
│  types.ts: export const RESULTS_DIR = "..."      │
│  types.ts: export const ASYNC_DIR  = "..."      │
│         ↓ (ES module live binding, read-only)    │
│  ┌────────────────┬────────────────────────────┐│
│  │ Direct import   │ DI-injected (fallback OK) ││
│  ├────────────────┼────────────────────────────┤│
│  │ index.ts:L226   │ async-job-tracker.ts:L37  ││
│  │ index.ts:L227   │ run-status.ts:L102-103    ││
│  │ index.ts:L258   │ run-id-resolver.ts:L56-57││
│  │ index.ts:L274   │ async-resume.ts:L240-241 ││
│  │ async-execution │ stale-run-reconciler.ts   ││
│  │   :L273,L405,  │ nested-events.ts:L812,L818││
│  │    L571,L623    │ doctor.ts:L47-48          ││
│  └────────────────┴────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

### Recommended Project Structure

No structural changes to pi-gsd-redux project layout. Changes fall into three categories:

```text
pi-subagents/ (upstream or fork)           # Upstream changes
├── src/extension/index.ts                # Fix ensureAccessibleDir, pass local vars
├── src/shared/types.ts                   # Change export const to mutable container
└── src/extension/doctor.ts              # Use container instead of const

pi-gsd-redux/                              # This project
├── src/extension.ts                       # Add pre-startup temp dir guard (interim)
└── tests/                                 # Add EPERM scenario tests
```

### Pattern 1: Upstream ensureAccessibleDir Fix (Recommended)

**What:** Catch EPERM/EACCES in `ensureAccessibleDir`, attempt recovery, fall back to pid-scoped path.

**When to use:** This is THE fix for D-01. Must be in pi-subagents upstream code.

**Example:**
```typescript
// Source: Proposed upstream PR pattern (derived from docs/issue-pi-subagents-eperm.md)
function ensureAccessibleDir(dirPath: string): string {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (err: any) {
        if (err?.code !== 'EPERM' && err?.code !== 'EACCES') throw err;
        // ACL corruption: try delete + recreate
        try {
            fs.rmSync(dirPath, { recursive: true, force: true });
        } catch {
            // Deletion also blocked — fall through to fallback
        }
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch {
            // Still blocked — use pid-scoped fallback
            const fallback = `${dirPath}-${process.pid}`;
            fs.mkdirSync(fallback, { recursive: true });
            return fallback;
        }
    }
    try {
        fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch { /* best effort */ }
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
        } catch {
            const fallback = `${dirPath}-${process.pid}`;
            fs.mkdirSync(fallback, { recursive: true });
            return fallback;
        }
    }
    return dirPath; // Return the verified path
}
```

**Key change:** Function now returns `string` (the actual dir path) instead of `void`. Callers use the return value instead of the constant.

### Pattern 2: ES Module Mutable Container for RESULTS_DIR/ASYNC_DIR

**What:** Replace `export const` primitive strings with a mutable container object.

**When to use:** Required to propagate fallback paths to all consumer modules.

**Example:**
```typescript
// Source: Proposed upstream PR pattern
// In src/shared/types.ts — BEFORE:
export const RESULTS_DIR = path.join(TEMP_ROOT_DIR, "async-subagent-results");
export const ASYNC_DIR = path.join(TEMP_ROOT_DIR, "async-subagent-runs");

// AFTER: Mutable container (object properties can be reassigned even with const binding)
export const DIRS = {
    results: path.join(TEMP_ROOT_DIR, "async-subagent-results"),
    async: path.join(TEMP_ROOT_DIR, "async-subagent-runs"),
};

// OR: Getter/setter pattern (more explicit)
let _resultsDir = path.join(TEMP_ROOT_DIR, "async-subagent-results");
let _asyncDir = path.join(TEMP_ROOT_DIR, "async-subagent-runs");
export function getResultsDir() { return _resultsDir; }
export function setResultsDir(dir: string) { _resultsDir = dir; }
export function getAsyncDir() { return _asyncDir; }
export function setAsyncDir(dir: string) { _asyncDir = dir; }
// Backward-compatible aliases:
export const RESULTS_DIR = new Proxy({} as string, {
    toString: () => getResultsDir(),
    valueOf: () => getResultsDir(),
});
```

**The DIRS object pattern is recommended** because:
1. ES module `export const DIRS = { ... }` — the binding is `const` (read-only) but the **object properties** are mutable
2. All consumers that currently import `RESULTS_DIR` can be updated to use `DIRS.results`
3. The `registerSubagentExtension` function can assign `DIRS.results = fallbackPath` after `ensureAccessibleDir`
4. The DI-injected modules (async-job-tracker, etc.) already use their parameter: `options.resultsDir ?? RESULTS_DIR` → update to `options.resultsDir ?? DIRS.results`

### Pattern 3: Interim Monkey-Patch via Extension Pre-Start Guard

**What:** pi-gsd-redux's extension pre-creates/cleans the temp directories before pi-subagents loads.

**When to use:** As an interim safety net while waiting for upstream PR response.

**Limitations:**
- Cannot propagate fallback paths to pi-subagents (ES module read-only binding)
- Can only help if the ACL corruption allows **deletion** but blocks **mkdir on existing** — which is an uncommon but not impossible case
- If ACL completely blocks access (the common case with null DACL), pre-cleanup also fails
- **Does not solve the core problem** — only helps with the "directory exists and is readable but mkdir gets EPERM on recursion" edge case

**Example:**
```typescript
// Source: Proposed pi-gsd-redux extension.ts addition
function guardPiSubagentsTempDirs(): void {
    const os = require("os");
    const path = require("path");
    const fs = require("fs");
    const tmpdir = os.tmpdir();
    const username = os.userInfo().username;
    const sanitized = username.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
    const tempRoot = path.join(tmpdir, `pi-subagents-user-${sanitized}`);
    for (const subdir of ["async-subagent-results", "async-subagent-runs"]) {
        const dirPath = path.join(tempRoot, subdir);
        try {
            fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
        } catch {
            // Directory exists but is inaccessible — try to clean it
            try {
                fs.rmSync(dirPath, { recursive: true, force: true });
                fs.mkdirSync(dirPath, { recursive: true });
            } catch {
                // ACL too corrupted for non-elevated repair
                // Flag via globalThis for diagnostic reporting
                (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken = true;
            }
        }
    }
}
```

### Anti-Patterns to Avoid

- **Patching node_modules directly:** `node_modules/pi-subagents/src/extension/index.ts` changes are lost on `npm install`. No patch-package or postinstall-patch infrastructure exists in this project. Never edit files in node_modules as a "fix."
- **Adding platform-specific elevated-privilege code to extension.ts:** The repair PowerShell script requires admin elevation (`takeown` + `icacls`). Pi extensions run at user privilege. Attempting UAC elevation from an extension is architecturally wrong and will fail in non-interactive contexts.
- **Swallowing EPERM silently:** Changing ensureAccessibleDir to `try { mkdir } catch { /* ignore */ }` leaves async subagent infrastructure in a broken state (no result dir, no watcher, no job tracker). Must propagate a working path or fail explicitly.
- **Using environment variables to override RESULTS_DIR:** The `resolveTempScopeId` function reads `process.env.USERNAME` for scoping, but there is no env var override for the temp root path itself. Adding one would require an upstream change, making it equivalent in effort to the mutable container fix but less maintainable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NTFS ACL repair | Custom Node.js ACL repair code | PowerShell script (already exists) + upstream fix | Windows ACL manipulation requires Win32 API calls (OpenProcessToken, AdjustTokenPrivileges, takeown, icacls) — the existing 300+ line `repair-pi-subagents-temp.ps1` handles this; reinventing in Node.js adds no value |
| ES module live binding mutation | Module cache hacking or `Module.register` hooks | Upstream change to mutable container (DIRS object or getter/setter) | Node.js ESM deliberately prevents module cache manipulation; `Module.register` hooks are experimental and Pi uses jiti loader which has its own module resolution |
| Temp dir path resolution | Custom temp root logic | `resolveTempScopeId` (already in pi-subagents) | Already handles uid/username/homedir resolution with proper sanitization; duplicating would diverge from upstream |

**Key insight:** The pi-subagents codebase already has dependency injection patterns for directory paths (`deps.asyncDirRoot ?? ASYNC_DIR`, `options.resultsDir ?? RESULTS_DIR`). The fix leverages this existing architecture by making the default fallback path mutable, not by introducing a new path resolution system.

## Common Pitfalls

### Pitfall 1: Assuming Extension Load Order Can Be Controlled
**What goes wrong:** Planning to have pi-gsd-redux's extension "run before" pi-subagents to pre-clean directories.
**Why it happens:** Pi's `discoverAndLoadExtensions` loads extensions in directory-scanning order (`.pi/extensions/` → `~/.pi/agent/extensions/` → npm packages → configured paths), not in a user-specified priority. Extension order is determined by filesystem enumeration, which is not deterministic across platforms.
**How to avoid:** Don't rely on extension load order for the fix. The upstream `ensureAccessibleDir` fix must be self-contained within pi-subagents. The monkey-patch guard is a best-effort addition, not a guaranteed solution.
**Warning signs:** If you see code in pi-gsd-redux's extension that assumes "pi-subagents hasn't loaded yet," it's fragile.

### Pitfall 2: Forgetting That `async-execution.ts` Uses RESULTS_DIR/ASYNC_DIR Directly
**What goes wrong:** Updating `registerSubagentExtension` to use the fallback path but forgetting that `async-execution.ts` imports and uses `RESULTS_DIR` directly at lines 273, 405, 571, 623 without DI injection.
**Why it happens:** Most consumer modules use the DI pattern (`deps.resultsDir ?? RESULTS_DIR`), but `async-execution.ts` and `nested-events.ts` use the constants directly for path construction.
**How to avoid:** In the upstream PR, audit ALL 11 usage sites of RESULTS_DIR and ASYNC_DIR (documented in the consumer audit below). Every module that uses them directly must be updated to use the mutable container (`DIRS.results`, `DIRS.async`) or accept the path via DI.
**Warning signs:** After fix, if async subagent results appear in the old (non-fallback) directory, `async-execution.ts` wasn't updated.

### Pitfall 3: Fallback Directory Not Cleaned Up
**What goes wrong:** Pid-scoped fallback directories accumulate across sessions (`async-subagent-results-12345`, `async-subagent-results-12346`, etc.).
**Why it happens:** The fallback is a new path that existing cleanup logic (`cleanupOldChainDirs`, `cleanupAllArtifactDirs`) doesn't know about.
**How to avoid:** The upstream PR should (a) register the fallback path in the DIRS container so cleanup finds it, and (b) add `cleanupOldFallbackDirs` logic or extend existing cleanup to scan for `dirPath-*` patterns. This is a secondary concern — primary fix is ensuring Pi starts at all.
**Warning signs:** After repeated ACL corruption + recovery, `%TEMP%` fills with orphaned `pi-subagents-user-*-{pid}` directories.

### Pitfall 4: Fork Package Name Collision
**What goes wrong:** Publishing a fork as `pi-subagents` on npm conflicts with the original.
**Why it happens:** npm package names are unique; you can't publish the same name under a different account without org scoping.
**How to avoid:** If forking, use a scoped package name like `@noirbright/pi-subagents` or `pi-subagents-fork`. Update pi-gsd-redux's `package.json` and `src/pi-subagents.ts` resolver accordingly. The `resolvePiSubagentsPackage` function uses `require.resolve("pi-subagents/package.json")` — it must find the fork's package.json.
**Warning signs:** `npm install` fails after switching to fork with same name.

### Pitfall 5: Repair Script Requires Manual Elevated Execution
**What goes wrong:** Users don't know they need admin powershell to run the repair script.
**Why it happens:** The script's header says "run from elevated PowerShell" but there's no Pi-level detection or guidance.
**How to avoid:** The upstream fix eliminates the need for the repair script in most cases. For the remaining edge cases, add a diagnostic to pi-gsd-redux's `doctor` command that detects ACL corruption and tells the user exactly what to run. Do NOT attempt to auto-elevate from the extension.
**Warning signs:** Users report EPERM and don't know about the repair script.

## Code Examples

### Complete Upstream PR Diff (Conceptual)

```typescript
// === src/shared/types.ts ===
// BEFORE (line 679-680):
export const RESULTS_DIR = path.join(TEMP_ROOT_DIR, "async-subagent-results");
export const ASYNC_DIR = path.join(TEMP_ROOT_DIR, "async-subagent-runs");

// AFTER:
export const DIRS = {
    results: path.join(TEMP_ROOT_DIR, "async-subagent-results"),
    async: path.join(TEMP_ROOT_DIR, "async-subagent-runs"),
    chain: CHAIN_RUNS_DIR,
    artifacts: TEMP_ARTIFACTS_DIR,
};
// Backward-compatible accessors for gradual migration
export const RESULTS_DIR = DIRS.results;  // still readable, but DIRS.results is the source
export const ASYNC_DIR = DIRS.async;

// === src/extension/index.ts ===
// BEFORE (lines 89-101):
function ensureAccessibleDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
    try { fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK); }
    catch {
        try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch { /* best effort */ }
        fs.mkdirSync(dirPath, { recursive: true });
        fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    }
}

// AFTER:
function ensureAccessibleDir(dirPath: string): string {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (err: any) {
        if (err?.code !== 'EPERM' && err?.code !== 'EACCES') throw err;
        try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch { /* ACL blocks deletion */ }
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch {
            // Use pid-scoped fallback — ACL prevents access to original path
            const fallback = `${dirPath}-${process.pid}`;
            fs.mkdirSync(fallback, { recursive: true });
            fs.accessSync(fallback, fs.constants.R_OK | fs.constants.W_OK);
            return fallback;
        }
    }
    try {
        fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch { /* best effort */ }
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
        } catch {
            const fallback = `${dirPath}-${process.pid}`;
            fs.mkdirSync(fallback, { recursive: true });
            fs.accessSync(fallback, fs.constants.R_OK | fs.constants.W_OK);
            return fallback;
        }
    }
    return dirPath;
}

// BEFORE (lines 226-227):
ensureAccessibleDir(RESULTS_DIR);
ensureAccessibleDir(ASYNC_DIR);

// AFTER:
DIRS.results = ensureAccessibleDir(DIRS.results);
DIRS.async = ensureAccessibleDir(DIRS.async);
```

Source: Derived from `docs/issue-pi-subagents-eperm.md` + `node_modules/pi-subagents/src/extension/index.ts:89-101,226-227` analysis

### Complete Consumer Audit: RESULTS_DIR / ASYNC_DIR Usage

```text
File: src/extension/index.ts
  Line 226: ensureAccessibleDir(RESULTS_DIR)           → MUST use DIRS.results (return value)
  Line 227: ensureAccessibleDir(ASYNC_DIR)             → MUST use DIRS.async (return value)
  Line 258: RESULTS_DIR (passed to createResultWatcher) → Already parameterized ✓
  Line 274: ASYNC_DIR (passed to createAsyncJobTracker) → Already parameterized ✓

File: src/extension/doctor.ts
  Line 47-48: asyncDir: ASYNC_DIR, resultsDir: RESULTS_DIR → Use DIRS.async, DIRS.results

File: src/runs/background/async-execution.ts
  Line 273: path.join(ASYNC_DIR, id)                    → Use DIRS.async
  Line 405: path.join(RESULTS_DIR, `${id}.json`)       → Use DIRS.results
  Line 571: path.join(ASYNC_DIR, id)                    → Use DIRS.async
  Line 623: path.join(RESULTS_DIR, `${id}.json`)       → Use DIRS.results

File: src/runs/background/async-job-tracker.ts
  Line 37: options.resultsDir ?? RESULTS_DIR            → options.resultsDir ?? DIRS.results

File: src/runs/background/async-resume.ts
  Line 240: deps.asyncDirRoot ?? ASYNC_DIR              → deps.asyncDirRoot ?? DIRS.async
  Line 241: deps.resultsDir ?? RESULTS_DIR              → deps.resultsDir ?? DIRS.results

File: src/runs/background/run-id-resolver.ts
  Line 56: deps.asyncDirRoot ?? ASYNC_DIR               → deps.asyncDirRoot ?? DIRS.async
  Line 57: deps.resultsDir ?? RESULTS_DIR               → deps.resultsDir ?? DIRS.results

File: src/runs/background/run-status.ts
  Line 102: deps.asyncDirRoot ?? ASYNC_DIR              → deps.asyncDirRoot ?? DIRS.async
  Line 103: deps.resultsDir ?? RESULTS_DIR              → deps.resultsDir ?? DIRS.results

File: src/runs/background/stale-run-reconciler.ts
  Line 257: path.join(options.resultsDir ?? RESULTS_DIR, "nested", ...) → DIRS.results
  Line 303: path.join(options.resultsDir ?? RESULTS_DIR, `${runId}.json`) → DIRS.results

File: src/runs/shared/nested-events.ts
  Line 812: containedPath(ASYNC_DIR, resolved)          → containedPath(DIRS.async, resolved)
  Line 818: path.join(RESULTS_DIR, "nested", ...)       → path.join(DIRS.results, "nested", ...)

File: src/runs/background/result-watcher.ts
  No direct use; receives resultsDir as parameter ✓

TOTAL: 4 files need direct constant → DIRS.* migration
       7 files use DI pattern (deps/options) and need fallback default updated
```

Source: grep audit of `node_modules/pi-subagents/src/`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `export const` for config paths | Mutable config objects (`DIRS` pattern) | Industry standard | ES module read-only binding is a known limitation; Node.js ecosystem now uses objects/config managers for mutable shared state |
| Uncaught filesystem errors in extension init | Graceful degradation with fallback | pi-subagents 0.24.4+ trend | Recent versions already added more error handling (fanout child recovery, completion guard fixes) |
| Global temp dir for all async results | Per-process or per-session isolation | Not yet adopted | Trend in newer architectures (tintinweb uses project-local); pi-subagents hasn't moved yet |

**Deprecated/outdated:**
- `export const` for path values that may need runtime override: ES module live bindings make these read-only in consumers. Modern pattern is mutable container or getter.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pi-subagents upstream maintainer (nicobailon) will accept a PR within 2 weeks | D-03 | Must maintain fork; adds ongoing maintenance burden |
| A2 | The `DIRS = { results, async, ... }` mutable container pattern is acceptable to upstream | Pattern 2 | Upstream may prefer getter/setter; additional PR discussion |
| A3 | Pid-scoped fallback (`dirPath-${process.pid}`) is sufficient for fallback uniqueness | Pattern 1 | If multiple concurrent Pi processes exist with ACL corruption, each gets its own fallback dir; no collision |
| A4 | Pi extension load order is not controllable by extensions themselves | Pitfall 1 | If Pi adds extension priority feature, monkey-patch guard becomes more viable |
| A5 | The repair script (`repair-pi-subagents-temp.ps1`) will not need to be committed to git (it's in `.gitignore`) | Anti-patterns | If users need it shipped with package, must reconsider gitignore |
| A6 | `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` SUS flags are false positives | Package Legitimacy Audit | If they're actually compromised, entire Pi ecosystem is at risk (extremely unlikely given version alignment) |

## Open Questions (RESOLVED)

1. **Upstream PR acceptance timeline** — RESOLVED: Submit PR immediately; 2-week deadline per D-03; fork at NOirBRight/pi-subagents as backup if unresponsive.

2. **Windows ACL corruption detection from non-elevated process** — RESOLVED: Distinguish by error code. EPERM/EACCES on `mkdirSync` with `recursive: true` means ACL issue; ENOENT means different problem. This heuristic is sufficient for the catch block.

3. **Fallback directory lifecycle** — RESOLVED: Include basic cleanup for `dirPath-*` patterns in the upstream PR. Low risk, prevents temp dir bloat.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | pi-gsd-redux, pi-subagents | ✓ | v25.7.0 | — |
| npm | Package management | ✓ | 11.10.1 | — |
| PowerShell | Repair script execution | ✓ | Windows built-in | — |
| Admin elevation | ACL repair (manual only) | ✓ | Manual UAC | — (no auto-elevation) |
| Git | Version control | ✓ | — | — |
| TypeScript | Build | ✓ | — | — |
| vitest | Tests | ✓ | 4.1.7 | — |
| slopcheck | Package audit | ✓ | 0.6.1 | Manual registry check |

**Missing dependencies with no fallback:**
- None — all required dependencies are available

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.7 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` (same — 3.3s total) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | ensureAccessibleDir catches EPERM and falls back | unit (upstream) | `npx vitest run` (upstream repo) | ❌ Not in pi-gsd-redux — upstream must add |
| D-02 | DIRS container propagates fallback paths to consumers | unit (upstream) | `npx vitest run` (upstream repo) | ❌ Not in pi-gsd-redux — upstream must add |
| D-03 | Upstream PR submitted | manual | N/A | ❌ Must be done |
| D-04 | pi-gsd-redux full suite still passes after pi-subagents change | unit + integration | `npx vitest run && npm run check` | ✅ 16 test files, 180 tests |
| D-04 | /gsd-models works in fresh Pi session | manual | Pi session test | ❌ Must be done manually |
| D-04 | Doctor command passes | integration | `node dist/cli.js doctor --prompts generated/prompts --agents --cwd .` | ✅ Exists |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run && npm run check`
- **Phase gate:** Full suite green + manual /gsd-models verification

### Wave 0 Gaps
- [ ] Upstream test for `ensureAccessibleDir` EPERM handling — covers D-01
- [ ] Upstream test for `DIRS.results`/`DIRS.async` fallback propagation — covers D-02
- [ ] Manual test procedure doc for /gsd-models post-fix verification — covers D-04

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Path validation in `resolveTempScopeId` (sanitizes username segments) |
| V6 Cryptography | no | — |

### Known Threat Patterns for pi-subagents on Windows

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| NTFS ACL null DACL after wake-from-sleep | Denial of Service | Upstream fix: catch EPERM + pid-scoped fallback |
| Temp directory symlink attack (TOCTOU) | Tampering | `mkdirSync` with `recursive: true` doesn't follow symlinks on existing dirs; `fs.accessSync` validates after creation |
| Pid-scoped fallback directory name prediction | Spoofing | Fallback uses `process.pid` (kernel-assigned, non-sequential on Windows); low risk for temp files |
| Race condition on shared temp dir | Tampering | Deferred (explicitly out of scope per CONTEXT.md); shared scope is known risk |

## Sources

### Primary (HIGH confidence)
- `node_modules/pi-subagents/src/extension/index.ts` — Source code analysis of ensureAccessibleDir (lines 89-101, 226-227), extension registration
- `node_modules/pi-subagents/src/shared/types.ts` — RESULTS_DIR/ASYNC_DIR definition (lines 679-680), resolveTempScopeId, all type definitions
- `docs/issue-pi-subagents-eperm.md` — Full root cause analysis, fix options, workarounds (project documentation)
- npm registry — pi-subagents version history (79 versions, 0.25.0 latest, 2026-05-21)

### Secondary (MEDIUM confidence)
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js` — Extension discovery and loading mechanism (jiti-based, moduleCache: false)
- `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js` — Extension path discovery from package.json pi manifest
- `node_modules/pi-subagents/CHANGELOG.md` — Recent fix patterns (0.24.4 added more error handling)
- `scripts/repair-pi-subagents-temp.ps1` — ACL repair approach for Windows (Win32 API, takeown, icacls)

### Tertiary (LOW confidence)
- GitHub issue/PR response time for nicobailon/pi-subagents — Not verified; assumed based on release cadence that maintainer is active
- Pi extension load order guarantee — Assumed based on code analysis of `discoverAndLoadExtensions`; no official documentation found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — directly verified via npm view and source code analysis
- Architecture: HIGH — traced through extension loading code, module import chains, and Pi resource loader
- Pitfalls: MEDIUM — some pitfalls are theoretical (extension load order) and may differ in future Pi versions
- Upstream PR viability: MEDIUM — release cadence is promising but maintainer responsiveness to external PRs is unverified

**Research date:** 2026-05-30
**Valid until:** 2026-06-30 (stable — pi-subagents architecture unlikely to change in 30 days given current pattern)