# Phase 4: Workflow Fidelity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 04-workflow-fidelity
**Areas discussed:** AskUserQuestion integration approach, Execution fidelity root cause, Workflow prompt rewrite vs runtime bridge, Test strategy for workflow fidelity

---

## AskUserQuestion Integration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| A: Adapter in pi-gsd-redux | Runtime function transforming GSD's (header, question, options) → rpiv's questions[] format | |
| B: Prompt rewrite at generation time | Transform AskUserQuestion calls in generated markdown to ask_user_question schema, following GSD's OpenCode adapter pattern | ✓ |
| C: Separate shim extension | New Pi extension registering `AskUserQuestion` tool that wraps rpiv internally | |

**User's choice:** B (prompt rewrite)
**Notes:** User asked for recommendation; Claude recommended B based on consistency with existing pattern, zero runtime cost, and GSD's proven OpenCode adapter. User agreed.

---

## Execution Fidelity Root Cause

| Option | Description | Selected |
|--------|-------------|----------|
| A: Skill() dispatch not available | GSD writes Skill(skill="...") but Pi has no Skill tool | Partial — one layer |
| B: Subagent markers wrong | Return format drift from subagents | |
| C: Context/timeout divergence | Chain mode runs out of context | |
| D: Mixed / not sure | Need research to determine actual failure | ✓ |

**User's choice:** D (not sure, requested research)
**Notes:** Claude researched GSD's OpenCode adapter, Pi extension API, and rpiv-ask-user-question. Discovered three overlapping root causes: (1) Skill() syntax mismatch, (2) AskUserQuestion tool missing, (3) generated prompts may lose references. GSD's install.js proves prompt rewrite strategy works across runtimes.

---

## Workflow Prompt Rewrite vs Runtime Bridge

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt rewrite at generation time | Transform in src/prompt-transform.ts and src/agent-transform.ts, same pattern as existing slash command rewrites | ✓ |
| Runtime bridge via extension hooks | Intercept tool calls on the fly in src/extension.ts | |
| Both (belt and suspenders) | Combine both approaches | |

**User's choice:** Lock — consistent with Area 1 decision and Area 2 research findings
**Notes:** GSD's OpenCode adapter is entirely generation-time prompt rewrite. Pi needs the same approach with Pi-specific targets. No runtime interception needed.

---

## Test Strategy for Workflow Fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| A: Unit tests (transform logic) | Test regex/schema transformation in prompt-transform.ts and agent-transform.ts | ✓ (must) |
| B: Integration tests (generate → verify) | Generate prompts/agents, verify no residual Claude Code syntax | ✓ (must) |
| C: Manual E2E verification | Run live Pi session, verify ask_user_question appears, workflow completes | ✓ (must, at least once) |
| D: Mock test harness | Simulated AskUserQuestion responses for automated workflow testing | Deferred to Phase 5 |

**User's choice:** A+B+C must, D deferred
**Notes:** User agreed with the four-layer recommendation. Manual verification at least once is essential since AskUserQuestion TUI behavior can only be confirmed in a live session.

---

## Claude's Discretion

- Exact regex patterns and transformation logic for each runtime-specific mapping
- Whether to combine AskUserQuestion and Skill() transforms into prompt-transform.ts or split into separate modules
- Exact Pi-equivalent instruction format for Skill() dispatch (read prompt file vs. slash command vs. inline instruction)

## Deferred Ideas

- Mock AskUserQuestion test harness — Phase 5 (smoke tests)
- Concurrent-process safety for shared temp dir — separate concern (from Phase 3)
- TUI verbosity reduction — Phase 5
- Single-command install consolidation — Phase 5
- Registering a `Skill` tool via `pi.registerTool` — revisit only if prompt rewrite proves insufficient for --chain/--auto flows