---
phase: 06-workflow-runtime-fidelity
status: planning
last_updated: "2026-05-30"
depends_on:
  - 04-workflow-fidelity
  - 05-polish-ship
---

# Phase 6: Workflow Runtime Fidelity

## Problem Statement

Phase 4 (Workflow Fidelity) adapted Claude Code–specific syntax for Pi at the **command prompt** level. The verification claimed "0 residual Skill(skill=" in generated/prompts/", which was true — but only for the `generated/prompts/` directory.

Three critical gaps remain that prevent GSD workflows from actually executing in Pi:

### Gap 1: Workflow Path References Point to Untransformed Files

`<process>` sections in generated prompts still reference upstream workflow files via `~/.claude/...` and `$HOME/.claude/...` paths instead of the transformed copies in `generated/workflows/`. When the agent follows these references, it reads untransformed upstream files — bypassing all Phase 4 adaptations.

**Evidence:**
```
Generated prompts:    ~/.claude=22, $HOME/.claude=9, node_modules=115, generated/workflows=0
Generated workflows:  ~/.claude=88, $HOME/.claude=33, node_modules=46,  generated/workflows=0
```

`rewriteWorkflowPaths()` was implemented with 3 regex patterns + 15 passing unit tests, but the actual generation pipeline still produces untransformed paths. Root cause under active debugging.

### Gap 2: Skill() Calls Inside Code Fences Are Not Transformed

The upstream GSD workflow markdown uses ``` code fences to format LLM-executable instructions (pseudo-code mixing bash + Skill() calls). `splitCodeFences()` correctly protects code fences from modification, but in the workflow context, these are **executable instructions**, not display code.

**Evidence:** 24 Skill() calls inside code fences are skipped by `transformSkillDispatchForPi`. The most impactful is `chain.md:59` — the core `--chain` mode orchestration that passes control between phases.

### Gap 3: $GSD_SDK Commands Are Unrunnable in Pi

`--chain` and `--auto` workflows rely heavily on `$GSD_SDK query` CLI commands for config reads, phase status checks, and step orchestration. Pi has no `$GSD_SDK` tool — these commands silently fail.

**Evidence:** 424 occurrences of `$GSD_SDK` across 91 unique sub-commands in upstream workflow files. The SDK ships as a Node.js library (`@opengsd/get-shit-done-redux/sdk/dist/query/`) with 65 importable handler modules that we've verified work correctly against this project.

## Goal

Ensure GSD workflow files are fully adapted for Pi runtime so that `--chain` and `--auto` modes execute correctly end-to-end.

## Scope

**In scope:**
- Fix `rewriteWorkflowPaths()` to actually transform paths in generated output
- Transform Skill() calls inside workflow code fences (smart-detection strategy)
- Bridge `$GSD_SDK` commands to Pi runtime via `gsd_query` tool backed by SDK API
- Extend verification to cover `generated/workflows/` (not just `generated/prompts/`)

**Out of scope:**
- New GSD features or workflow logic changes
- Upstream package modifications (transform generation-time only)
- UI/UX changes to pi-web or Pi itself

## Decisions

### D-18: Workflow code-fence Skill() transformation strategy

**Decision:** Smart-detection dual-pass (D-23 refines). Transform Skill() calls inside code fences in workflow files only, using a separate `transformWorkflowCodeFences()` function. Only code fences containing known transformation patterns (Skill(), AskUserQuestion(), $GSD_SDK, Agent(), subagent()) are transformed. Pure bash blocks are preserved as-is.

**Rationale:** Command prompts' code fences contain genuine display code (bash examples, JSON schemas). Workflow code fences contain LLM action instructions. Smart detection avoids over-transforming while ensuring all executable patterns are converted.

### D-19: $GSD_SDK adaptation strategy (updated)

**Decision:** Bridge all `$GSD_SDK query` commands to Pi runtime via a single `gsd_query` Pi tool backed by the upstream SDK's Node.js API. Generation-time transform replaces `$GSD_SDK query <subcmd> <args>` with `gsd_query({command: "<subcmd>", args: [...]})` call instructions. All 91 sub-commands (both read-only queries and mutations like commit, state.update, config-set) go through this single tool.

**Why this beats natural-language replacement (previous D-19):**
- Structured: preserves exact semantics, no LLM interpretation ambiguity
- Testable: each handler has deterministic input/output
- Complete: covers all 91 sub-commands, not just top N patterns
- Maintainable: upstream SDK API is stable; route map is small
- Already verified: `configGet`, `checkAutoMode`, `initPhaseOp`, `stateGet`, `roadmapAnalyze`, `frontmatterGet`, `findPhase`, `verifyPathExists` all return correct data against this project's `.planning/` directory

**Mutation handling:** Write operations (commit, state.update, config-set, frontmatter.set, phase lifecycle mutations) go through the same `gsd_query` tool. The tool description will document which commands are mutations. No separate mutation tool — keeping the interface simple and matching the upstream CLI pattern.

### D-20: Path rewrite implementation fix

**Decision:** Debug regex non-functioning in generation pipeline first. If regex proves fragile, fall back to line-by-line string replacement of known path prefixes (`~/.claude/`, `$HOME/.claude/`, `node_modules/@opengsd/`).

**Update:** Further investigation revealed the upstream source files use `~/.claude/get-shit-done-redux/get-shit-done/...` paths (133 occurrences), not `node_modules/...` absolute paths. The generation pipeline was also passing `officialRoot` (a file path) instead of `OFFICIAL_PACKAGE_NAME` (a package name) as the second argument — fixed in generator.ts but the output still shows zero rewrites. Root cause under active debugging.

### D-21: Verification scope extension

**Decision:** Phase 6 verification MUST check `generated/workflows/` in addition to `generated/prompts/`. All grep-based checks that were limited to `generated/prompts/` must be extended to `generated/workflows/`.

**Rationale:** Phase 4 verification missed the workflow directory, leading to a false "0 residual" claim.

### D-22: gsd_query tool structure

**Decision:** Single Pi tool (`gsd_query`) with a `command` string parameter that routes to all 91 SDK sub-commands. The tool description lists the most common commands. Mutation and query operations share the same tool.

**Rationale:** Matches the upstream `$GSD_SDK query` CLI pattern. One tool is simpler to register, document, and maintain than 8-10 categorized tools. The routing layer maps `command` → correct SDK handler function.

### D-23: Workflow code-fence transform scope

**Decision:** Smart-detection — only transform code fences that contain known transformation patterns (Skill(), AskUserQuestion(), $GSD_SDK, Agent(), subagent_type). Pure bash blocks without these patterns are preserved as-is.

**Rationale:** Already have three transform functions (transformSkillDispatchForPi, transformAskUserQuestionForPi, transformGsdSdkCommands) that can be called inside code fences. If upstream adds new syntax, a new transform function is added to the pipeline. This avoids over-transforming while ensuring all executable patterns are converted.

### D-24: Path rewrite fallback strategy

**Decision:** Debug the regex first (15 unit tests pass but pipeline produces zero rewrites). If regex fix resolves the pipeline issue, no fallback needed. If regex proves fragile at the integration level, fall back to line-by-line string replacement of known path prefixes.

## Canonical Refs

- `.planning/codebase/ARCHITECTURE.md` — Generation pipeline architecture
- `.planning/codebase/CONVENTIONS.md` — Code style and naming conventions
- `src/prompt-transform.ts` — All prompt transform functions (AskUserQuestion, Skill, subagent, lazy-load, splitCodeFences)
- `src/rewrite-workflow-paths.ts` — Path rewrite function (buggy, 15 tests pass but pipeline fails)
- `src/generator.ts` — Generation pipeline (generatePrompts, generateWorkflows, generateAll)
- `@opengsd/get-shit-done-redux/sdk/dist/query/` — 65 SDK query handler modules (configGet, initPhaseOp, checkAutoMode, stateGet, etc.)

## Codebase Context

**Existing transform pipeline (src/prompt-transform.ts):**
- `normalizeGsdSlashReferences()` — `/gsd-xxx` → `/gsd-xxx` normalization
- `addPiSubagentGuidance()` — Adds Pi subagent guidance text
- `transformAskUserQuestionForPi()` — AskUserQuestion → ask_user_question (code-fence safe)
- `transformSkillDispatchForPi()` — Skill(skill="gsd-xxx") → instruction text (code-fence safe)
- `transformSubagentDispatchForPi()` — subagent_type="general-purpose" → "general"
- `transformLazyLoadReferences()` — @file references → Read() pointers (handles ~/.claude/, $HOME, absolute)
- `splitCodeFences()` — Splits text into code/non-code segments (now exported)
- `transformGsdSdkCommands()` — **NEW** — `$GSD_SDK query` → `gsd_query()` calls

**Generation pipeline order (src/generator.ts):**
- Command prompts: `rewriteWorkflowPaths(body)` → `applyPromptTransforms(body)` (normalize → guidance → AUQ → Skill → subagent → lazy-load → gsd-sdk)
- Workflow files: `rewriteWorkflowPaths(source)` → `transformWorkflowCodeFences(pathRewritten)` → `applyPromptTransforms(body)`
- Agent bodies: `transformOfficialAgentMarkdown()` → subagent_type + Agent() rewrites

**SDK query handlers verified working (tested against this project):**
- `configGet(["workflow._auto_chain_active"], cwd)` → `{data: false}`
- `checkAutoMode([], cwd)` → `{data: {active: false, source: "none"}}`
- `initPhaseOp(["06"], cwd)` → full phase info object
- `stateGet(["status"], cwd)` → `{data: {status: "In Progress"}}`
- `roadmapAnalyze([], cwd)` → full roadmap analysis
- `frontmatterGet([".planning/STATE.md", "status"], cwd)` → `{data: {status: "In Progress"}}`
- `findPhase(["06"], cwd)` → phase directory info
- `verifyPathExists([".planning/ROADMAP.md"], cwd)` → `{data: {exists: true, type: "file"}}`

## Locked Requirements (from prior phases)

- D-06: Lazy-load external file references via Read() pointers at generation time
- D-07: Only replace external reference files, preserve workflow inline content
- D-08: Implement transformations at generation time in prompt-transform.ts
- D-10: Postinstall runs sync-agents + doctor; failures produce warnings only
- D-12: Version 0.1.0 → 0.2.0 → 1.0.0
- D-14: npm provenance signing via GitHub Actions OIDC

## Exit Criteria

- [ ] Zero untransformed path references in `generated/prompts/` AND `generated/workflows/`
- [ ] Zero untransformed Skill() calls in `generated/workflows/` (including inside code fences)
- [ ] Zero untransformed $GSD_SDK commands in `generated/workflows/`
- [ ] `gsd_query` tool registered and functional with P0 commands returning correct data
- [ ] All existing tests pass
- [ ] New integration tests verify pipeline output for all 3 transformation categories
- [ ] `npm run check` clean