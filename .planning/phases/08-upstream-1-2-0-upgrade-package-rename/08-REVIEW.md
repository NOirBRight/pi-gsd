---
phase: 08-upstream-1-2-0-upgrade-package-rename
reviewed: 2026-05-31T15:58:36Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - docs/PUBLISHING.md
  - src/doctor.ts
  - src/generator.ts
  - src/prompt-transform.ts
  - tests/prompt-transform.test.ts
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-31T15:58:36Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the publishing runbook, doctor/generator services, prompt transforms, and prompt-transform tests. The main concerns are runtime correctness for code-fenced subagent dispatches and incomplete release validation for generated workflows.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Code-fenced `general-purpose` Agent dispatch is converted to the wrong Pi agent name

**File:** `src/prompt-transform.ts:826-829`
**Issue:** In `transformWorkflowCodeFences`, `Agent(subagent_type="general-purpose", ...)` is rewritten directly to `subagent({agent: "general-purpose", ...})`. The later `subagent_type="general-purpose"` replacement cannot affect that result because the `subagent_type=` text has already been removed. Non-code-fence dispatches normalize to `general` first, so code-fenced workflow instructions can fail only in the code-fence path.
**Fix:** Normalize the captured agent type before emitting the `subagent` call, and update the test at `tests/prompt-transform.test.ts:635-639` to expect `agent: "general"`.
```ts
transformed = transformed.replace(
  /Agent\(subagent_type="([^"]+)",\s*prompt="([\s\S]*?)"\)/g,
  (_match: string, agentType: string, promptText: string) => {
    const piAgentType = agentType === "general-purpose" ? "general" : agentType;
    return `subagent({agent: "${piAgentType}", task: "${promptText}"})`;
  },
);
```

### CR-02: Doctor does not validate generated workflows even though generated prompts depend on them

**File:** `src/doctor.ts:132-160`
**Issue:** `runDoctor` regenerates and compares prompts and agents only. `generateAll` now writes transformed workflows under `generated/workflows` (`src/generator.ts:188-195`), and `generateWorkflows` documents that these files are critical because prompts delegate to workflow files. A release can therefore pass `npm run check` with stale or missing generated workflow files, leaving users with broken or untransformed workflow execution.
**Fix:** Add a workflows directory option to doctor/CLI, generate expected workflows into the temp dir, and compare them recursively alongside prompts and agents. Also include `generated/workflows` in publishing checks.

## Warnings

### WR-01: Global `ask_user_question` idempotency check leaves later raw AskUserQuestion calls untransformed

**File:** `src/prompt-transform.ts:125-127`
**Issue:** `transformAskUserQuestionForPi` returns the entire input unchanged if it contains the substring `ask_user_question` anywhere. Mixed documents with one already-transformed call plus another raw `AskUserQuestion(...)` keep the raw call, which can happen after partial regeneration or when upstream text mentions the Pi tool before another question call.
**Fix:** Remove the whole-document early return and rely on the specific `AskUserQuestion` matcher; already-transformed calls do not match that pattern.

### WR-02: Publishing runbook recommends putting a real npm token on the command line

**File:** `docs/PUBLISHING.md:133-137`
**Issue:** The suggested `npm publish ... --//registry.npmjs.org/:_authToken=YOUR_TOKEN` pattern encourages maintainers to pass a live token as a command-line argument, which can leak through shell history and process listings.
**Fix:** Use an environment variable or temporary user config instead, e.g. `NPM_TOKEN=... npm publish --access public --registry https://registry.npmjs.org/` with a temporary `.npmrc` that references `${NPM_TOKEN}`, then delete it after publishing.

---

_Reviewed: 2026-05-31T15:58:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
