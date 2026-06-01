---
description: Run all remaining phases autonomously — discuss→plan→execute per phase
argument-hint: '[--from N] [--to N] [--only N] [--interactive]'
requires: '[cleanup, phase, progress]'
---
<pi_subagents_runtime_note>
Pi runtime: when this workflow calls for spawning GSD subagents, use the Pi `subagent` tool from `pi-subagents`.
Before delegation, inspect available agents with `subagent({ action: "list" })`.
Use exact official GSD agent names such as `gsd-planner`, `gsd-executor`, and `gsd-code-reviewer`.
If the `subagent` tool is unavailable, stop and ask the user to install or enable `pi-subagents`; do not simulate subagents inline.
</pi_subagents_runtime_note>

<objective>
Execute all remaining milestone phases autonomously. For each phase: discuss → plan → execute. Pauses only for user decisions (grey area acceptance, blockers, validation requests).

Uses ROADMAP.md phase discovery and Skill() flat invocations for each phase command. After all phases complete: milestone audit → complete → cleanup.

**Creates/Updates:**
- `.planning/STATE.md` — updated after each phase
- `.planning/ROADMAP.md` — progress updated after each phase
- Phase artifacts — CONTEXT.md, PLANs, SUMMARYs per phase

**After:** Milestone is complete and cleaned up.
</objective>

<execution_context>
@generated/workflows/workflows/autonomous.md
@generated/workflows/references/ui-brand.md
</execution_context>

<context>
Optional flags:
- `--from N` — start from phase N instead of the first incomplete phase.
- `--to N` — stop after phase N completes (halt instead of advancing to next phase).
- `--only N` — execute only phase N (single-phase mode).
- `--interactive` — run discuss inline with questions (not auto-answered), then dispatch plan→execute as background agents. Keeps the main context lean while preserving user input on decisions.

Project context, phase list, and state are resolved inside the workflow using init commands (`gsd-tools query init.milestone-op`, `gsd-tools query roadmap.analyze`). No upfront context loading needed.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (phase discovery, per-phase execution, blocker handling, progress display).
</process>
