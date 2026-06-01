---
description: Socratic ideation and idea routing — think through ideas before committing to plans
---
<pi_subagents_runtime_note>
Pi runtime: when this workflow calls for spawning GSD subagents, use the Pi `subagent` tool from `pi-subagents`.
Before delegation, inspect available agents with `subagent({ action: "list" })`.
Use exact official GSD agent names such as `gsd-planner`, `gsd-executor`, and `gsd-code-reviewer`.
If the `subagent` tool is unavailable, stop and ask the user to install or enable `pi-subagents`; do not simulate subagents inline.
</pi_subagents_runtime_note>

<objective>
Open-ended Socratic ideation session. Guides the developer through exploring an idea via
probing questions, optionally spawns research, then routes outputs to the appropriate GSD
artifacts (notes, todos, seeds, research questions, requirements, or new phases).

Accepts an optional topic argument: `/gsd-explore authentication strategy`
</objective>

<execution_context>
@generated/workflows/workflows/explore.md
</execution_context>

<process>
Execute end-to-end.
</process>
