# Phase 5: Polish & Ship - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase prepares pi-gsd-redux for v1.0 release. It reduces TUI verbosity from GSD workflow context injection, consolidates installation into a single command, sets up CI and publishing, and creates automated end-to-end smoke tests.

**In scope:**
- Reduce TUI verbosity by replacing `<required_reading>` external file references with lazy-load `Read()` pointers at generation time
- Consolidate installation: move pi-subagents and rpiv from peerDependencies to dependencies, add postinstall script for automatic sync-agents + doctor check
- Create GitHub Actions CI workflow (typecheck + test + build + doctor)
- Set up npm publishing pipeline with provenance signing
- Version from 0.1.0 → 0.2.0 (initial release), then 1.0.0 after all verification passes
- Create automated E2E smoke tests covering: fresh install, /gsd-models, doctor full check, workflow end-to-end

**Out of scope:**
- New features or capabilities beyond what Phases 1–4 delivered
- Changes to upstream GSD workflow content itself (we transform, not modify upstream)
- Pi platform TUI changes (out of our package's control)
- Performance optimization of generation pipeline beyond the lazy-load transform
</domain>

<decisions>
## Implementation Decisions

### TUI Verbosity Reduction
- **D-06:** Use lazy-load references — replace `<required_reading>` external file references (domain-probes.md, gate-prompts.md, universal-anti-patterns.md, scout-codebase.md, etc.) with `Read(path)` pointers at generation time. The agent reads reference files on demand instead of having them injected inline.
- **D-07:** Only replace external reference files (`<required_reading>` blocks). Workflow inline content (`<process>`, `<philosophy>`, `<scope_guardrail>`, `<gray_area_identification>`, `<answer_validation>`, `<progressive_disclosure>`, `<downstream_awareness>`) stays as-is in the generated prompt.
- **D-08:** Implement lazy-load transform in `src/prompt-transform.ts` as an additional generation-time transform step. Do NOT use runtime context hook — consistent with the D-05 pattern (all runtime adaptations at generation time, not runtime interception).

### Single-Command Installation
- **D-09:** Move `pi-subagents` and `@juicesharp/rpiv-ask-user-question` from `peerDependencies` to `dependencies` in `package.json`. npm install of pi-gsd-redux will automatically install all required companions.
- **D-10:** Add `postinstall` script to `package.json` that runs `sync-agents` (project scope) and `doctor --prompts generated/prompts --agents` (basic validation). Failures produce warnings only — do NOT block the install.
- **D-11:** End-user experience: `pi install npm:pi-gsd-redux` → all dependencies installed + agents synced + doctor check run. Single command.

### npm Publish & Release
- **D-12:** Version progression: 0.1.0 → 0.2.0 (after all Phase 5 work completes) → 1.0.0 (after all verification passes including E2E smoke tests). Pin `@opengsd/get-shit-done-redux` version from `latest` to a specific version before 0.2.0.
- **D-13:** GitHub Actions CI workflow: run typecheck + test + build + doctor on every push. npm publish is manually triggered (not auto-publish on merge).
- **D-14:** Add npm provenance signing (`npm publish --provenance`) via GitHub Actions OIDC. Requires a dedicated publish workflow with `npm-publish` action or equivalent.

### E2E Smoke Tests
- **D-15:** Create automated E2E smoke tests covering four scenarios: (1) fresh install flow — `pi install npm:pi-gsd-redux` from scratch, verify postinstall sync + doctor; (2) `/gsd-models` command — model routing UI displays and responds correctly; (3) `doctor --agents` full check — all checks pass (official package, pi-subagents, rpiv, agent sync, temp ACL); (4) complete GSD workflow end-to-end — run `/gsd-discuss-phase` or similar and verify ask_user_question dispatch, Skill() references, and subagent routing work correctly.
- **D-16:** Smoke tests run both locally (`npm run e2e` / `npm run smoke`) and in GitHub Actions CI. CI workflow for E2E needs Pi environment setup — researcher/planner to determine feasibility.
- **D-17:** The workflow end-to-end E2E test is the highest-risk scenario — it requires a running Pi session. Researcher/planner should evaluate whether a programmatic Pi session test is feasible or if this scenario stays as a manual pre-release checklist item.

### Claude's Discretion
- Exact regex patterns for detecting `<required_reading>` blocks and `@file:` references in prompt-transform.ts
- How to format the `Read()` pointer (absolute path vs relative path vs package-relative path)
- Exact postinstall script implementation (Node script vs shell script, error handling granularity)
- GitHub Actions workflow file structure and trigger configuration
- Which GSD workflow to use for the E2E workflow test (discuss-phase is the most interactive; a simpler one like plan-phase may be more automatable)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### TUI Verbosity — Transform Targets
- `src/prompt-transform.ts` — Existing prompt transformation pipeline. Lazy-load transform is added here after existing transforms.
- `src/generator.ts` — Generation orchestrator. Calls prompt-transform functions in sequence.
- `node_modules/@opengsd/get-shit-done-redux/get-shit-done/workflows/` — Upstream workflow files with `<required_reading>` blocks that need lazy-loading.
- `node_modules/@opengsd/get-shit-done-redux/get-shit-done/references/` — External reference files (domain-probes.md, gate-prompts.md, universal-anti-patterns.md, scout-codebase.md) that will be replaced with Read() pointers.

### Installation — Current State
- `package.json` — Current peerDependencies for pi-subagents and rpiv; needs restructuring.
- `src/agent-sync.ts` — Sync logic that postinstall will invoke.
- `src/doctor.ts` — Doctor validation that postinstall will invoke.
- `src/cli.ts` — CLI entry point; postinstall script routes through here.
- `docs/PUBLISHING.md` — Existing publishing runbook; needs updates for new workflow.

### CI & Publishing
- `package.json` scripts — Current: `build`, `typecheck`, `test`, `check`, `generate`. Needs: CI workflow file, publish workflow file.
- No `.github/workflows/` directory exists yet — needs creation.

### E2E Smoke Tests
- `tests/` — Current test directory with 17 test files, 239 tests. E2E tests add a new category.
- `src/extension.ts` — Pi extension entry point; needed for workflow E2E test.
- `src/gsd-models.ts` — /gsd-models command implementation; needed for model routing E2E test.
- `src/doctor.ts` — Doctor implementation; needed for full doctor E2E test.

### Prior Phase Context
- `.planning/phases/04-workflow-fidelity/04-CONTEXT.md` — Phase 4 decisions (prompt-transform pattern, generation-time adaptation, rpiv peer dependency).
- `.planning/phases/03-subagent-stability/03-CONTEXT.md` — Phase 3 decisions (EPERM handling, fork approach, session-scoped temp dirs).

### Architecture & Quality
- `.planning/codebase/ARCHITECTURE.md` — System architecture and data flow.
- `.planning/codebase/CONCERNS.md` — Known tech debt including floating upstream version, no CI, and no coverage threshold.
- `.planning/codebase/CONVENTIONS.md` — Coding patterns and import conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/prompt-transform.ts` — Already has `normalizeGsdSlashReferences`, `rewriteRuntimePaths`, `transformAskUserQuestionForPi`, `transformSkillDispatchForPi`, `transformSubagentDispatchForPi`. Lazy-load transform fits the same pattern — a new pure function called from the generation pipeline.
- `src/generator.ts` — `generatePrompts` already orchestrates the transform pipeline. New lazy-load transform is additive, called after existing transforms.
- `src/official.ts` — Package resolver that can resolve reference file paths for `Read()` pointer generation.
- `src/doctor.ts` — Validation framework with `runDoctor` returning `{ ok, messages }`. Postinstall script can reuse this.
- `src/agent-sync.ts` — `syncAgents` with `--scope project` and `--dry-run` options. Postinstall will call this.
- `src/cli.ts` — CLI entry point with `runCli` function. Postinstall should route through this or call the underlying service functions directly.
- `tests/prompt-transform.test.ts` — Extensive test patterns (17 tests for transform functions) that new lazy-load tests should follow.

### Established Patterns
- **Pure string transforms with no filesystem access** — `prompt-transform.ts` functions are pure. The lazy-load transform needs path resolution (knowing where reference files are) but the string replacement itself is pure.
- **Generation pipeline composition** — `generator.ts` calls transforms in sequence. New transforms are additive.
- **Doctor check pattern** — `doctor.ts` returns `{ ok, messages }` with warning/error distinction. Postinstall can reuse this pattern.
- **Test-then-regenerate** — Run `npm run check` (typecheck + test + build + doctor) after changes. This is the existing quality gate.

### Integration Points
- `src/generator.ts:generatePrompts` — Where lazy-load transform hooks in. Called after all existing prompt transforms.
- `package.json:scripts` — Where `postinstall` and `smoke`/`e2e` scripts are added.
- `package.json:dependencies` — Where pi-subagents and rpiv move from peerDependencies.
- `.github/workflows/` — New directory for CI and publish workflow files.
- `docs/PUBLISHING.md` — Needs updates for postinstall, CI, provenance, and revised version strategy.

</code_context>

<specifics>
## Specific Ideas

1. The `<required_reading>` pattern in upstream workflow files uses `@path/to/file.md` syntax (e.g., `@D:/Workstation/pi-gsd/node_modules/@opengsd/get-shit-done-redux/get-shit-done/references/domain-probes.md`). The lazy-load transform should detect these `@` references, resolve the file path relative to the upstream package, and replace them with `Read("resolved/path/to/file.md")` instructions.

2. The `<progressive_disclosure>` section in workflow files already uses lazy-loading semantics ("Read only the files needed for the current invocation"). This is a proven pattern — the `<required_reading>` transform should follow this style: `"Read the following file when you reach this step: path/to/file.md"`.

3. Postinstall script should be a Node script (not shell/PowerShell) for cross-platform compatibility — Windows users can't run .sh scripts natively, and Pi users may be on any OS.

4. For the E2E workflow test, consider testing with `/gsd-models` as the simplest interactive GSD command, even though discuss-phase is more comprehensive. Simpler commands are more automatable and still exercise extension loading, context rewriting, and TUI interaction.

5. Pinning `@opengsd/get-shit-done-redux` from `latest` to a specific version is both a release requirement (reproducible builds) and addresses the CONCERNS.md tech debt item about floating version. This should happen before 0.2.0.

6. CI workflow should trigger on `push` to `main` and on pull requests. The publish workflow should be a separate `workflow_dispatch` event that requires manual triggering.
</specifics>

<deferred>
## Deferred Ideas

- Registering a `Skill` tool via `pi.registerTool` — revisit only if prompt rewrite proves insufficient for --chain/--auto flows (from Phase 4)
- Concurrent-process safety for shared temp dir — separate concern, not in this phase
- Pi platform TUI-level changes to collapse/hide context injection blocks — out of scope for this package
- Coverage threshold enforcement — valuable but not blocking for v1.0; add post-release
- Coverage for official frontmatter compatibility testing — medium priority, add post-release
- Mock AskUserQuestion test harness for automated workflow testing — from Phase 4, may be needed for E2E workflow test

---

*Phase: 05-polish-ship*
*Context gathered: 2026-05-30*