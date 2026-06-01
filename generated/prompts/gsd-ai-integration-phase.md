---
description: Generate an AI-SPEC.md design contract for phases that involve building AI systems.
argument-hint: '[phase number]'
requires: '[phase]'
---
<pi_subagents_runtime_note>
Pi runtime: when this workflow calls for spawning GSD subagents, use the Pi `subagent` tool from `pi-subagents`.
Before delegation, inspect available agents with `subagent({ action: "list" })`.
Use exact official GSD agent names such as `gsd-planner`, `gsd-executor`, and `gsd-code-reviewer`.
If the `subagent` tool is unavailable, stop and ask the user to install or enable `pi-subagents`; do not simulate subagents inline.
</pi_subagents_runtime_note>

<objective>
Create an AI design contract (AI-SPEC.md) for a phase involving AI system development.
Orchestrates gsd-framework-selector → gsd-ai-researcher → gsd-domain-researcher → gsd-eval-planner.
Flow: Select Framework → Research Docs → Research Domain → Design Eval Strategy → Done
</objective>

<execution_context>
@generated/workflows/workflows/ai-integration-phase.md
@generated/workflows/references/ai-frameworks.md
@generated/workflows/references/ai-evals.md
</execution_context>

<context>
Phase number: $ARGUMENTS — optional, auto-detects next unplanned phase if omitted.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>
