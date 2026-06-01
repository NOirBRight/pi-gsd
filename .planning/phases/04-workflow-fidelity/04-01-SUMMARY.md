---
phase: 04-workflow-fidelity
plan: 01
subsystem: prompt-transform, agent-transform
tags: [ask-user-question, skill-dispatch, subagent-type, transformation, tdd]
dependency_graph:
  requires: [D-01, D-03, D-04, D-05]
  provides: [transformAskUserQuestionForPi, transformSkillDispatchForPi, transformSubagentDispatchForPi, agent-subagent-type-transform, agent-dispatch-transform]
  affects: [generator-pipeline, agent-pipeline]
tech_stack:
  added: []
  patterns: [pure-string-transform, code-fence-safe, pipeline-composition]
key_files:
  created: []
  modified:
    - src/prompt-transform.ts
    - src/agent-transform.ts
    - src/generator.ts
    - tests/prompt-transform.test.ts
    - tests/agent-transform.test.ts
    - tests/generator.test.ts
    - tests/agent-generator.test.ts
decisions:
  - Pipeline composition order: normalizeGsdSlashReferences → addPiSubagentGuidance → transformAskUserQuestionForPi → transformSkillDispatchForPi → transformSubagentDispatchForPi
  - Added transformSubagentDispatchForPi to prompt-transform.ts (plan specified agent-transform only, but prompts also contain subagent_type and Agent() references)
  - Agent() → subagent() transform uses regex with [\s\S]*? non-greedy match for prompt content
metrics:
  duration: 14m
  completed: 2026-05-30
  tasks_completed: 3
  files_modified: 7
  tests_added: 40
---

# Phase 04 Plan 01: Workflow Fidelity Transformations Summary

Pi-runtime transformation functions for AskUserQuestion, Skill(), and subagent_type, with full unit and integration test coverage.

## One-liner
AskUserQuestion→ask_user_question schema rewrite, Skill()→Pi instruction rewrite, subagent_type mapping, all wired into generation pipeline with 40 new tests.

## Tasks Completed

### Task 1: AskUserQuestion → ask_user_question transformation ✓
- **Commit:** d7785cb
- Added `transformAskUserQuestionForPi` to `src/prompt-transform.ts`
- Supports 5 calling patterns: positional args, named params, object options, multi-question arrays, multi-line
- Idempotent (skips if `ask_user_question` already present)
- Code-fence safe (preserves AskUserQuestion inside ``` blocks)
- 9 unit tests covering all patterns, code-fence exclusion, idempotency, surrounding text preservation

### Task 2: Skill() dispatch and subagent_type transformation ✓
- **Commit:** e3823d9
- Added `transformSkillDispatchForPi` to `src/prompt-transform.ts` — rewrites `Skill(skill="gsd-xxx", args="yyy")` to Pi-friendly instruction
- Added `transformSubagentDispatchForPi` to `src/prompt-transform.ts` — rewrites `subagent_type="general-purpose"` → `"general"` and `Agent(subagent_type=...)` → `subagent({agent:...})`
- Added `subagent_type="general-purpose"` → `"general"` rewrite to `rewriteOfficialAgentBody` in `src/agent-transform.ts`
- Added `Agent(subagent_type=...)` → `subagent({agent:..., task:...})` rewrite to `rewriteOfficialAgentBody`
- Code-fence safe for all prompt transforms
- 13 new tests across prompt-transform.test.ts and agent-transform.test.ts

### Task 3: Wire transforms into generation pipeline and integration test ✓
- **Commit:** faadca2
- Updated `generator.ts` to call `transformAskUserQuestionForPi`, `transformSkillDispatchForPi`, and `transformSubagentDispatchForPi` in the prompt generation pipeline
- Pipeline order: `normalizeGsdSlashReferences` → `addPiSubagentGuidance` → `transformAskUserQuestionForPi` → `transformSkillDispatchForPi` → `transformSubagentDispatchForPi`
- Agent transforms already applied via `rewriteOfficialAgentBody` in `agent-transform.ts`
- Added 5 integration tests in `generator.test.ts` and 2 in `agent-generator.test.ts`
- `npm run check` passes: typecheck + 230 tests + build + doctor

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added transformSubagentDispatchForPi to prompt-transform.ts**
- **Found during:** Task 3 (wiring)
- **Issue:** Plan specified `subagent_type` and `Agent()` transforms only for `agent-transform.ts`, but workflow prompts (processed by `generatePrompts`) also contain these patterns
- **Fix:** Added `transformSubagentDispatchForPi` export to `prompt-transform.ts` and wired it into the prompt generation pipeline
- **Files modified:** src/prompt-transform.ts, src/generator.ts
- **Rationale:** 10+ workflow files contain `subagent_type="general-purpose"` or `Agent(subagent_type=...)` references; not transforming them in prompts would leave residual Claude Code syntax

## Verification Results

- `npm run check`: ✓ typecheck clean, 230 tests pass, build succeeds, doctor OK
- `grep -r 'AskUserQuestion(' generated/:` No residual function calls outside code fences
- `grep -r 'Skill(skill=' generated/:` No residual Skill() calls
- `grep -r 'subagent_type="general-purpose"' generated/:` No residual general-purpose references (prose mentions in single quotes preserved correctly)
- All transforms are idempotent and code-fence safe

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: tampering | src/prompt-transform.ts | Regex patterns for AskUserQuestion/Skill() could theoretically match user-controlled content outside intended boundaries, but all transforms operate at generation time on upstream GSD content, not at runtime on user input |

## Self-Check: PASSED

- All 7 modified files found on disk
- All 3 commit hashes found in git history
- No unexpected file deletions in any commit
- `npm run check` clean (typecheck + 230 tests + build + doctor)
- No residual AskUserQuestion(), Skill(skill=, or subagent_type="general-purpose" outside code fences in generated output