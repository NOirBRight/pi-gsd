# Phase 4: Workflow Fidelity - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase ensures GSD workflow slash commands execute correctly in the Pi runtime. Three categories of execution fidelity gaps are addressed:

1. **AskUserQuestion adaptation** — GSD workflows call `AskUserQuestion(header, question, options)` ~200+ times, but Pi has no such tool. The `@juicesharp/rpiv-ask-user-question` extension provides `ask_user_question` with a different schema. Prompt-level rewrite bridges the gap.

2. **Skill() dispatch adaptation** — GSD workflows reference `Skill(skill="gsd-xxx", args="...")` as a Claude Code tool call. Pi has no `Skill` tool; it uses `/skill:name` user commands and `read`-based skill loading. Prompt-level rewrite converts Skill() references to Pi-equivalent instructions.

3. **Subagent dispatch adaptation** — GSD workflows reference `Agent(subagent_type="gsd-xxx", ...)` which maps to Pi's `subagent({agent: "gsd-xxx", ...})`. This is already partially handled by pi-gsd-redux's `<pi_subagents_runtime_note>` injection, but may need verification.

**In scope:**
- Prompt and agent transformation for AskUserQuestion → ask_user_question schema rewrite
- Prompt and agent transformation for Skill() → Pi-equivalent dispatch rewrite
- Verification that subagent dispatch references are correct after transformation
- Unit tests for all rewrite logic
- Integration tests (generate → verify no residual Claude Code syntax)
- Manual end-to-end verification in a live Pi session (at least one workflow)

**Out of scope:**
- TUI verbosity reduction (Phase 5)
- Single-command install consolidation (Phase 5)
- npm publish (Phase 5)
- Building a mock AskUserQuestion test harness (Phase 5 smoke tests)
- pi-subagents EPERM fix (Phase 3, complete)
</domain>

<decisions>
## Implementation Decisions

### AskUserQuestion Integration Approach
- **D-01:** Use prompt rewrite at generation time as the primary strategy for AskUserQuestion → ask_user_question adaptation. This follows GSD's proven pattern for OpenCode (`AskUserQuestion` → `question`), Copilot (`AskUserQuestion` → `vscode_askquestions`), and other runtimes. The rewrite happens in `src/prompt-transform.ts` and/or `src/agent-transform.ts`, transforming GSD markdown `AskUserQuestion(header, question, options)` calls into `ask_user_question({ questions: [...] })` calls with the correct rpiv schema.

- **D-02:** The `@juicesharp/rpiv-ask-user-question` extension is a runtime dependency (not a build dependency). Users must install it via `pi install npm:@juicesharp/rpiv-ask-user-question` for the tool to be available. pi-gsd-redux's `doctor` command should verify it's installed.

### Execution Fidelity — Root Cause Analysis
- **D-03:** Three overlapping layers cause workflow execution failure in Pi:
  1. **Skill() dispatch mismatch** — GSD writes `Skill(skill="gsd-xxx")`; Pi has no `Skill` tool. Needs prompt rewrite to Pi-equivalent instructions.
  2. **AskUserQuestion tool missing** — Addressed by D-01/D-02.
  3. **Generated prompts may lose Skill()/AskUserQuestion references** — Current `src/prompt-transform.ts` and `src/agent-transform.ts` don't handle these constructs. Some may survive generation; others are dropped. Both need explicit transformation rules.

- **D-04:** GSD's OpenCode adapter (in `install.js` → `convertClaudeToOpencodeFrontmatter`) proves this approach works. Key mappings: `AskUserQuestion` → `question`, `Skill()` → `skill()` tool call, `SlashCommand` → `skill`, `subagent_type="general-purpose"` → `subagent_type="general"`. Pi needs a parallel set of mappings.

### Workflow Prompt Rewrite Layer
- **D-05:** All runtime-specific adaptations happen at prompt generation time, not at runtime via extension hooks. This is consistent with pi-gsd-redux's existing architecture (`src/prompt-transform.ts` for prompts, `src/agent-transform.ts` for agents) and with GSD's proven multi-runtime adapter pattern. No runtime dispatch interception is needed.

### Runtime-Specific Transformation Mappings for Pi

| Source (Claude Code) | Pi Target |
|---|---|
| `AskUserQuestion(header, question, options, multiSelect?)` | `ask_user_question({ questions: [{ question, header, options: [{ label, description }], multiSelect? }] })` |
| `Skill(skill="gsd-xxx", args="yyy")` | Instruction to read the corresponding GSD prompt file or invoke `/gsd-xxx yyy` |
| `SlashCommand("/gsd-xxx")` | Already handled by existing `normalizeGsdSlashReferences` |
| `Agent(subagent_type="gsd-xxx", prompt="...")` | `subagent({agent: "gsd-xxx", task: "..."})` — verify existing `<pi_subagents_runtime_note>` covers this |
| `subagent_type="general-purpose"` | `subagent_type="general"` (Pi convention, mirroring OpenCode mapping) |

### Claude's Discretion
- Exact regex patterns and transformation logic for each mapping — researcher and planner can determine the best approach based on upstream GSD markdown patterns.
- Whether to combine AskUserQuestion and Skill() transformations into `prompt-transform.ts` or split into separate modules.
- The exact Pi-equivalent instruction format for Skill() dispatch (read prompt file vs. slash command vs. inline instruction) — this depends on what's most reliable in practice.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### GSD Runtime Adapter (proven pattern)
- `node_modules/@opengsd/get-shit-done-redux/bin/install.js` — OpenCode, Copilot, Codex, Gemini, Cursor runtime adapters. Key functions: `convertClaudeToOpencodeFrontmatter`, `claudeToOpencodeTools`, `convertToolName`. This is the primary reference for how GSD adapts AskUserQuestion and Skill() for non-Claude runtimes.

### GSD Upstream Workflows (source of AskUserQuestion/Skill() references)
- `node_modules/@opengsd/get-shit-done-redux/get-shit-done/workflows/` — 41 `Skill()` call sites, 200+ `AskUserQuestion` call sites across all workflow files
- `node_modules/@opengsd/get-shit-done-redux/get-shit-done/workflows/discuss-phase.md` — Primary discuss workflow (12 AskUserQuestion calls)
- `node_modules/@opengsd/get-shit-done-redux/get-shit-done/workflows/plan-phase.md` — Plan workflow (11+ AskUserQuestion calls)
- `node_modules/@opengsd/get-shit-done-redux/get-shit-done/workflows/execute-phase.md` — Execute workflow (Skill dispatch, Agent dispatch)

### Pi Extension API
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` — `registerTool`, `registerCommand`, `ExtensionContext`, `ExtensionCommandContext` types. Key: `ExtensionContext` (tool execute context) does NOT have `sendUserMessage`/`steer`/`followUp`; only `ExtensionCommandContext` (command handler context) does.

### rpiv Ask User Question
- `node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts` — Tool registration, schema (`QuestionParamsSchema`), validation
- `node_modules/@juicesharp/rpiv-ask-user-question/events.ts` — Public event contract (`rpiv:ask-user:prompt`)

### pi-gsd-redux Source (transformation targets)
- `src/prompt-transform.ts` — Current prompt transformation (slash command rewrites)
- `src/agent-transform.ts` — Current agent transformation (tool/frontmatter/body rewrites)
- `src/extension.ts` — Pi extension entry point (session_start, context, message_end hooks, gsd-models command)
- `src/generator.ts` — Prompt generation pipeline
- `src/agent-generator.ts` — Agent generation pipeline

### Project Planning
- `.planning/codebase/ARCHITECTURE.md` — System architecture and data flow
- `.planning/codebase/CONCERNS.md` — Known tech debt (hand-rolled frontmatter parser, regex-based transforms)
- `.planning/codebase/INTEGRATIONS.md` — External integrations
- `.planning/codebase/STACK.md` — Technology stack
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/prompt-transform.ts` — Already has `normalizeGsdSlashReferences` (regex-based `/gsd:xxx` → `/gsd-xxx`) and `rewriteRuntimePaths`. New AskUserQuestion and Skill() transforms follow the same pattern.
- `src/agent-transform.ts` — Already transforms GSD agent markdown (frontmatter, tools, body). New subagent_type mapping follows the same pattern.
- `src/official.ts` — Package resolver that finds `@opengsd/get-shit-done-redux` install path. Transformation code needs this to resolve prompt/agent file paths at generation time.
- `src/doctor.ts` — Validation framework. Can be extended to check for `ask_user_question` tool availability and verify no residual `AskUserQuestion`/`Skill()` in generated output.
- `tests/prompt-transform.test.ts`, `tests/agent-transform.test.ts` — Existing test patterns for transform functions.

### Established Patterns
- **Pure string transforms with no filesystem access** — `prompt-transform.ts` and `agent-transform.ts` are pure functions. New transforms should follow this pattern.
- **Generator orchestration** — `generator.ts` and `agent-generator.ts` coordinate transforms and writes. New transforms are called from these orchestrators.
- **Test-then-regenerate** — Run `npm run check` (typecheck + test + doctor) after changes.

### Integration Points
- `src/generator.ts:generatePrompts` — Where prompt-level transforms are applied. New AskUserQuestion/Skill transforms hook in here.
- `src/agent-generator.ts:generateAgents` — Where agent-level transforms are applied.
- `src/extension.ts` — Runtime rewrite hooks. NOT the target for this phase (generation-time only), but must be reviewed to ensure no conflicts.
- `package.json` → `pi.extensions` — Extension registration. `ask_user_question` tool comes from rpiv, not from pi-gsd-redux.

</code_context>

<specifics>
## Specific Ideas

1. GSD's OpenCode adapter maps `AskUserQuestion` → `question` with a simple regex `\bAskUserQuestion\b`. The Pi equivalent should map `\bAskUserQuestion\b` → `ask_user_question` but with schema adaptation (flat args → structured `{ questions: [...] }` object). The regex match is the easy part; the schema transformation is the hard part.

2. Skill() dispatch in Pi should map to something the LLM can act on. Two practical options: (a) "Read the GSD prompt file at [path] and follow its instructions" — leverages Pi's `/skill:name` mechanism where skills are already generated and synced; (b) "Run /gsd-xxx command" — tells the LLM to tell the user to invoke a slash command. Option (a) is more autonomous (works in --chain/--auto), option (b) requires user interaction.

3. The `--text` mode fallback already exists in GSD workflows — it replaces AskUserQuestion with plain-text numbered lists. This is a safety net if rpiv's ask_user_question is not installed. Consider detecting the absence of rpiv and automatically enabling --text mode transforms.

4. Current `src/prompt-transform.ts` already handles `/gsd:xxx` → `/gsd-xxx` and path rewrites. The new transforms should be additive — new functions called after existing transforms, not replacing them.

5. The `subagent_type="general-purpose"` → `subagent_type="general"` mapping is trivial (string replacement) and mirrors what GSD does for OpenCode. Should be a one-liner in `agent-transform.ts`.

6. `doctor` command should gain a check: "Is @juicesharp/rpiv-ask-user-question installed?" — verifies the runtime dependency exists, similar to how it already checks for pi-subagents.
</specifics>

<deferred>
## Deferred Ideas

- **Mock AskUserQuestion test harness** — Build an automated test that simulates ask_user_question responses to verify workflow branching logic. Deferred to Phase 5 (smoke tests).
- **Concurrent-process safety for shared temp dir** — From Phase 3 decisions, this is a separate concern.
- **TUI verbosity reduction** — Phase 5 scope.
- **Single-command install** — Consolidating `pi install npm:pi-gsd-redux` + `pi install npm:pi-subagents` + `pi install npm:@juicesharp/rpiv-ask-user-question` + `sync-agents` into one step is Phase 5 scope.
- **Registering a `Skill` tool via `pi.registerTool`** — Could register a tool that resolves and returns GSD prompt content. This was discussed but the prompt-rewrite approach was chosen instead. If rewrite proves insufficient for --chain/--auto flows, this can be revisited as a supplement.
</deferred>

---

*Phase: 04-workflow-fidelity*
*Context gathered: 2026-05-30*