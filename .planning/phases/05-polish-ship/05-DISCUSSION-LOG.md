# Phase 5: Polish & Ship - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 05-polish-ship
**Areas discussed:** TUI verbosity, Single-command install, npm publish & release, E2E smoke tests

---

## TUI Verbosity

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy-load references | Replace \u003crequired_reading\u003e external files with Read() pointers at generation time | ✓ |
| Pruning + lazy-load hybrid | Strip verbose sections AND add file-path pointers | |
| Generation-time pruning only | Shorten descriptions and strip examples inline | |
| Hide at TUI level | Pi platform feature change — out of scope | |

**User's choice:** Lazy-load references
**Notes:** User chose lazy-load after discussion. Key tradeoff: pure lazy-load is simplest transform, preserves all context, and follows the `<progressive_disclosure>` pattern already present in upstream workflows.

### Lazy-load scope

| Option | Description | Selected |
|--------|-------------|----------|
| External reference files only | Replace \u003crequired_reading\u003e blocks (domain-probes, gate-prompts, anti-patterns, scout-codebase) | ✓ |
| All 300+ line sections | Replace all large content blocks including inline process descriptions | |

**User's choice:** External reference files only
**Notes:** Workflow inline content (steps, scope guardrails, validation rules) stays as-is. Only external reference files loaded via `@path` syntax get lazy-loaded.

### Implementation layer

| Option | Description | Selected |
|--------|-------------|----------|
| Generation-time transform | Add transform step in prompt-transform.ts, consistent with existing pattern | ✓ |
| Runtime context hook | Replace content in extension.ts context hook at runtime | |

**User's choice:** Generation-time transform
**Notes:** Consistent with D-05 (all runtime adaptations at generation time). Zero runtime cost. Follows existing pipeline composition pattern.

---

## Single-Command Install

| Option | Description | Selected |
|--------|-------------|----------|
| Merge dependencies + postinstall | Move peerDeps to deps, add postinstall script for auto sync + doctor | ✓ |
| Postinstall only | Keep peerDeps, add postinstall for sync | |
| Install script only | Shell/PowerShell setup script, no code changes | |

**User's choice:** Merge dependencies + postinstall auto sync
**Notes:** User emphasized "3+1, auto sync, one-click install". pi-subagents and rpiv move from peerDependencies to dependencies so npm handles installation. Postinstall handles agent sync and validation.

### Postinstall behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Sync + doctor check, warn on failure | Run sync-agents and doctor; failures produce warnings only, do not block install | ✓ |
| Sync only, no doctor | Run sync-agents only; user manually runs doctor | |

**User's choice:** Sync + doctor check, warn on failure
**Notes:** Postinstall runs sync-agents (project scope) and doctor (basic check). If either fails, a warning is printed but the install succeeds. This matches the non-blocking pattern from existing extension behavior.

---

## npm Publish & Release

### Version strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Direct 1.0.0 | Publish as 1.0.0 after Phase 5 completion | |
| 0.2.0 then 1.0.0 | Publish 0.2.0 after Phase 5 work, upgrade to 1.0.0 after all verification passes | ✓ |

**User's choice:** 0.2.0 then 1.0.0
**Notes:** Two-step versioning: 0.2.0 for the code-complete release, 1.0.0 after E2E verification confirms everything works end-to-end. Also pin @opengsd/get-shit-done-redux from `latest` to specific version before 0.2.0.

### CI & publishing

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions CI + manual publish (recommended) | CI runs typecheck + test + build + doctor on every push; npm publish is manually triggered | ✓ |
| Fully manual | No CI, all manual | |

**User's choice:** GitHub Actions CI + manual publish
**Notes:** CI provides quality gate on every push. Publish stays manual (workflow_dispatch trigger) because of npm security-key 2FA.

### npm provenance

| Option | Description | Selected |
|--------|-------------|----------|
| Current approach (short-lived granular token) | Manual token creation per publish, no provenance | |
| Add npm provenance | npm publish --provenance via GitHub Actions OIDC for verifiable build provenance | ✓ |

**User's choice:** Add npm provenance
**Notes:** Provenance provides supply chain security transparency. Requires a publish workflow with OIDC permissions in GitHub Actions.

---

## E2E Smoke Tests

### Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Automated smoke tests (recommended) | Script/suite that runs install, sync, doctor, and functional verification | ✓ |
| Manual checklist | Step-by-step human verification | |
| Both automated + manual | Automated for core paths, manual for edge cases | |

**User's choice:** Automated smoke tests
**Notes:** All four scenarios: fresh install, /gsd-models, doctor full check, end-to-end workflow.

### Test scenarios

| Option | Description | Selected |
|--------|-------------|----------|
| Install flow | pi install from scratch, verify postinstall | ✓ |
| /gsd-models | Model routing UI displays and responds | ✓ |
| Doctor full check | All checks pass | ✓ |
| Workflow end-to-end | Complete GSD workflow runs correctly | ✓ |

**User's choice:** All four scenarios

### Execution environment

| Option | Description | Selected |
|--------|-------------|----------|
| Local manual (npm run e2e) | Not in CI, run locally before release | |
| CI only | GitHub Actions only | |
| Both CI + local | Run in both environments | ✓ |

**User's choice:** Both CI + local
**Notes:** Workflow end-to-end test is highest risk — requires running Pi session. Researcher/planner to evaluate whether programmatic Pi session test is feasible in CI or whether this scenario stays as a manual pre-release checklist item.

---

## Claude's Discretion

- Exact regex patterns for detecting `<required_reading>` blocks and `@file:` references
- Read() pointer path format (absolute vs relative vs package-relative)
- Postinstall script implementation details (Node script vs shell, error handling)
- GitHub Actions workflow file structure
- Which GSD workflow to use for E2E test

## Deferred Ideas

- Registering a Skill tool via pi.registerTool — revisit only if prompt rewrite proves insufficient (from Phase 4)
- Coverage threshold enforcement — post-release
- Official frontmatter compatibility testing — post-release, medium priority
- Mock AskUserQuestion test harness — may be needed for E2E workflow test