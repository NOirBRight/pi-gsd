---
phase: 09
slug: auto-orchestration-native-module
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
updated: 2026-06-01
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/orchestrator.test.ts tests/orchestrator-settings.test.ts tests/orchestrator-journal.test.ts tests/prompt-transform.test.ts` |
| **Full suite command** | `npm test` |
| **Phase gate command** | `npm run typecheck && npm run build` |
| **Estimated runtime** | ~30-90 seconds targeted; full suite/build at phase gate |

---

## Sampling Rate

- **Before each behavior implementation:** Write or update the task's listed Vitest coverage first (`tdd="true"` tasks in 09-01, 09-02, and 09-03).
- **After every task commit:** Run the task's exact `<automated>` command from the corresponding PLAN.md task.
- **After every plan wave:** Run the plan-level verification command from `<verification>`.
- **Before `/gsd-verify-work`:** Run the Phase 9 gate: `npx vitest run tests/e2e/orchestrator-chain.test.ts tests/orchestrator.test.ts tests/orchestrator-settings.test.ts tests/orchestrator-journal.test.ts tests/cli.test.ts tests/prompt-transform.test.ts`, then `npm test`, `npm run typecheck`, and `npm run build`.
- **Max feedback latency:** 90 seconds for targeted checks; broader suite/build only at wave/phase boundaries.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement(s) | Threat Ref | Secure Behavior | Test Type | Automated Command | Test Artifact Source | Status |
|---------|------|------|----------------|------------|-----------------|-----------|-------------------|----------------------|--------|
| 09-01-01 | 09-01 Task 1 — Define orchestrator contracts and settings-driven Unit queue | 1 | ORCH-01, ORCH-02 | T-09-01 / T-09-02 | Settings-driven workflow-step Units; ambiguous settings pause instead of silently dispatching | unit | `npx vitest run tests/orchestrator-settings.test.ts` | `tests/orchestrator-settings.test.ts` created/updated by 09-01 Task 1 before implementation | ⬜ pending |
| 09-01-02 | 09-01 Task 2 — Implement pure state transitions and ordered gate seams | 1 | ORCH-02 | T-09-02 / T-09-03 | Gate order is explicit; retry budget exhaustion pauses with resume hint | unit | `npx vitest run tests/orchestrator.test.ts` | `tests/orchestrator.test.ts` created/updated by 09-01 Task 2 before implementation | ⬜ pending |
| 09-01-03 | 09-01 Task 3 — Expose orchestrator facade with injectable dependencies | 1 | ORCH-01, ORCH-02 | T-09-04 | Facade returns structured status without raw prompt/tool-turn data | unit | `npx vitest run tests/orchestrator.test.ts` | `tests/orchestrator.test.ts` updated by 09-01 Task 3 before implementation | ⬜ pending |
| 09-02-01 | 09-02 Task 1 — Persist redacted snapshot plus replayable lifecycle history | 2 | ORCH-03 | T-09-05 / T-09-06 | Journal stays under `.planning/` and redacts prompt/user/env/secret fields | unit | `npx vitest run tests/orchestrator-journal.test.ts` | `tests/orchestrator-journal.test.ts` created/updated by 09-02 Task 1 before implementation | ⬜ pending |
| 09-02-02 | 09-02 Task 2 — Add STATE.md digest pointer adapter through gsd-tools seam | 2 | ORCH-03 | T-09-08 | STATE digest uses handler seam and never direct Markdown mutation | unit | `npx vitest run tests/orchestrator-journal.test.ts -t "STATE digest"` | `tests/orchestrator-journal.test.ts` updated by 09-02 Task 2 before implementation | ⬜ pending |
| 09-02-03 | 09-02 Task 3 — Wire journal/resume/status into orchestrator facade | 2 | ORCH-03 | T-09-06 / T-09-07 | Resume uses validated unfinished snapshot and redacted lifecycle events | unit/integration | `npx vitest run tests/orchestrator.test.ts tests/orchestrator-journal.test.ts` | `tests/orchestrator.test.ts` and `tests/orchestrator-journal.test.ts` updated by 09-02 Task 3 before implementation | ⬜ pending |
| 09-03-01 | 09-03 Task 1 — Implement dispatch adapter and native --auto/--chain trigger paths | 3 | ORCH-01, ORCH-02, ORCH-03 | T-09-09 / T-09-10 / T-09-11 / T-09-13 | Native trigger/CLI dispatch uses argv arrays, validates targets, and scopes `GSD_AUDIT=1` without `GSD_AUDIT_ARGS` | unit/integration | `npx vitest run tests/orchestrator.test.ts tests/cli.test.ts tests/runtime-rewrites.test.ts -t "orchestrate|dispatch|GSD_AUDIT|native auto trigger|Unit dispatch target"` | Existing CLI/runtime tests plus orchestrator tests updated by 09-03 Task 1 before implementation | ⬜ pending |
| 09-03-02 | 09-03 Task 2 — Remove AUTO_MODE_CHECKLIST symbols and export orchestrator API | 3 | ORCH-01, RUNTIME-03 | T-09-12 | Checklist markers are absent; transform remains pure; API is exported | regression | `npx vitest run tests/prompt-transform.test.ts && ! (grep -R "pi_auto_mode_fidelity\|AUTO_MODE_CHECKLIST\|injectAutoModeChecklist" src tests generated | grep -v "RUNTIME-03" | grep -v "does not contain")` | `tests/prompt-transform.test.ts` updated by 09-03 Task 2 before implementation | ⬜ pending |
| 09-03-03 | 09-03 Task 3 — Add fixture chain integration coverage and final phase gates | 3 | ORCH-01, ORCH-02, ORCH-03, RUNTIME-03 | T-09-09 / T-09-10 / T-09-12 | Fixture chain advances only after artifact gates and contains no prompt checklist reminders | e2e/integration | `npx vitest run tests/e2e/orchestrator-chain.test.ts tests/orchestrator.test.ts tests/cli.test.ts tests/prompt-transform.test.ts -t "orchestrator chain|artifact gate|orchestrate|auto mode"` | `tests/e2e/orchestrator-chain.test.ts` created by 09-03 Task 3 before implementation | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is complete because no PLAN task uses `MISSING — Wave 0 must create ...` verification. The Phase 9 plans create or update their own test files inside the relevant TDD tasks before production changes:

- `tests/orchestrator-settings.test.ts` — 09-01 Task 1.
- `tests/orchestrator.test.ts` — 09-01 Tasks 2-3, 09-02 Task 3, 09-03 Tasks 1 and 3.
- `tests/orchestrator-journal.test.ts` — 09-02 Tasks 1-3.
- `tests/prompt-transform.test.ts` — 09-03 Task 2 and 09-03 Task 3.
- `tests/e2e/orchestrator-chain.test.ts` — 09-03 Task 3.

No separate pre-execution scaffold task is required; sampling continuity is maintained by each task's automated command.

---

## Sampling Continuity Check

| Check | Result | Evidence |
|-------|--------|----------|
| Every task has `<automated>` verify | ✅ | 09-01 through 09-03 each list automated Vitest/grep commands. |
| No 3 consecutive tasks without automated verify | ✅ | All 9 planned tasks have automated verification. |
| Wave 0 placeholders removed | ✅ | Per-task map references concrete plan/task IDs, not `Plan:TBD`. |
| No watch-mode flags | ✅ | Commands use `vitest run`; no watch mode. |
| Feedback latency bounded | ✅ | Targeted commands are per test file/filter; full suite/build deferred to phase gate. |

---

## Manual-Only Verifications

None required by the PLAN files. Cross-session resume UX is covered by automated journal/resume tests in 09-02 and fixture chain coverage in 09-03.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit TDD test creation path inside the task
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 is complete; no separate Wave 0 scaffold remains pending
- [x] No watch-mode flags
- [x] Feedback latency < 90s targeted / full suite at wave boundary
- [x] `nyquist_compliant: true` set in frontmatter after task map was concretized by PLAN.md

**Approval:** validation strategy current with 09-01, 09-02, and 09-03 PLAN.md files
