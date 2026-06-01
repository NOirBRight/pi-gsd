<pi_subagents_runtime_note>
Pi runtime: when this workflow calls for spawning GSD subagents, use the Pi `subagent` tool from `pi-subagents`.
Before delegation, inspect available agents with `subagent({ action: "list" })`.
Use exact official GSD agent names such as `gsd-planner`, `gsd-executor`, and `gsd-code-reviewer`.
If the `subagent` tool is unavailable, stop and ask the user to install or enable `pi-subagents`; do not simulate subagents inline.
</pi_subagents_runtime_note>

# Instructions for GSD

- Use the get-shit-done skill when the user asks for GSD or uses a `gsd-*` command.
- Treat `/gsd-...` or `gsd-...` as command invocations and load the matching file from `.github/skills/gsd-*`.
- When a command says to spawn a subagent, prefer a matching custom agent from `.github/agents`.
- Do not apply GSD workflows unless the user explicitly asks for them.
- After completing any `gsd-*` command (or any deliverable it triggers: feature, bug fix, tests, docs, etc.), ALWAYS: (1) offer the user the next step by prompting via `ask_user`; repeat this feedback loop until the user explicitly indicates they are done.
