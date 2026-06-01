---
phase: 08-upstream-1-2-0-upgrade-package-rename
fixed_at: 2026-05-31T16:08:21Z
review_path: .planning/phases/08-upstream-1-2-0-upgrade-package-rename/08-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-05-31T16:08:21Z
**Source review:** `.planning/phases/08-upstream-1-2-0-upgrade-package-rename/08-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

**Integration warning:** The fix commits were created on preserved branch `gsd-reviewfix/08-2956`. Fast-forwarding `master` failed because the main worktree has uncommitted changes that would be overwritten. Merge or cherry-pick `gsd-reviewfix/08-2956` after resolving the main worktree state.

## Fixed Issues

### CR-01: Code-fenced `general-purpose` Agent dispatch is converted to the wrong Pi agent name

**Files modified:** `src/prompt-transform.ts`, `tests/prompt-transform.test.ts`
**Commit:** b3c12ba
**Status:** fixed: requires human verification
**Applied fix:** Normalized code-fenced `Agent(subagent_type="general-purpose", ...)` dispatches to emit `subagent({agent: "general", ...})` and updated the focused expectation.

### CR-02: Doctor does not validate generated workflows even though generated prompts depend on them

**Files modified:** `src/doctor.ts`, `src/cli.ts`, `src/postinstall.ts`, `tests/doctor.test.ts`, `package.json`, `docs/PUBLISHING.md`
**Commit:** 8d53c89
**Applied fix:** Added optional generated workflow validation to doctor/CLI/postinstall, compared workflow files recursively, included workflows in package/check publishing paths, and documented workflow validation.

### WR-01: Global `ask_user_question` idempotency check leaves later raw AskUserQuestion calls untransformed

**Files modified:** `src/prompt-transform.ts`, `tests/prompt-transform.test.ts`
**Commit:** 6c539fa
**Status:** fixed: requires human verification
**Applied fix:** Removed the whole-document `ask_user_question` early return and added coverage for mixed already-transformed plus raw `AskUserQuestion(...)` content.

### WR-02: Publishing runbook recommends putting a real npm token on the command line

**Files modified:** `docs/PUBLISHING.md`
**Commit:** 4e056f2
**Applied fix:** Replaced the command-line `_authToken=YOUR_TOKEN` publish example with an `NPM_TOKEN` environment variable plus temporary npm user config that is deleted after publishing.

## Skipped Issues

None.

## Verification Notes

- Tier 1 re-read verification completed for each modified section.
- Targeted `npx vitest ...` and `npx tsc --noEmit ...` could not run in the isolated worktree because dependencies/TypeScript/Vitest were not installed (`Cannot find package 'vitest'`; `This is not the tsc command you are looking for`).
- `package.json` JSON parsing was verified with `node -e "JSON.parse(...)"` for CR-02.

---

_Fixed: 2026-05-31T16:08:21Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
