---
phase: 11
slug: worktree-safety-recovery-classification
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-02
updated: 2026-06-02
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. This artifact describes planned coverage; implementation tests are not complete until the corresponding plan tasks execute.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/recovery.test.ts tests/worktree-safety.test.ts tests/orchestrator.test.ts tests/orchestrator-journal.test.ts` |
| **Full suite command** | `npm run check` |
| **Estimated runtime** | ~60 seconds targeted; full suite project-dependent |

---

## Sampling Rate

- **After every task:** Run the targeted Vitest command listed in that task.
- **After every plan wave:** Run `npm run typecheck`; run `npm run check` at plan close when targeted tests are green.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 60 seconds targeted where practical.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | RECOV-01/02 | T-11-01/T-11-02 | No unclassified recovery fallback; partial-write preserves written[] and stops | unit | `npx vitest run tests/recovery.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | RECOV-02 | T-11-03 | GateResult embeds recoveryDecision and telemetry exitReason uses recovery class | unit/integration | `npx vitest run tests/recovery.test.ts tests/orchestrator.test.ts` | partial | ⬜ pending |
| 11-02-01 | 02 | 2 | WTREE-01/02 | T-11-04/T-11-06 | Source-writing Units fail closed on invalid roots; no branch auto-checkout | unit | `npx vitest run tests/worktree-safety.test.ts tests/recovery.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | WTREE-02/RECOV-02 | T-11-05/T-11-07 | Lease ownership/stale reclaim produces bounded events and pause-with-remediation for incomplete/contradictory stale evidence | unit | `npx vitest run tests/worktree-safety.test.ts tests/recovery.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 3 | WTREE-01/02/RECOV-02 | T-11-08 | Real orchestrator gate calls prepareUnitRoot and carries lease events | integration | `npx vitest run tests/orchestrator.test.ts tests/worktree-safety.test.ts tests/recovery.test.ts` | partial | ⬜ pending |
| 11-03-02 | 03 | 3 | RECOV-02 | T-11-09/T-11-10 | Journal persists only bounded recovery/lease evidence | unit/integration | `npx vitest run tests/orchestrator-journal.test.ts tests/recovery.test.ts` | partial | ⬜ pending |
| 11-03-03 | 03 | 3 | WTREE-02/RECOV-02 | T-11-09/T-11-11 | Actual prepareUnitRoot/orchestrator flow appends lease acquire/release/stale-reclaim JSON events; stale ambiguous evidence pauses with remediation | integration | `npx vitest run tests/orchestrator.test.ts tests/orchestrator-journal.test.ts tests/worktree-safety.test.ts tests/recovery.test.ts` | partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/recovery.test.ts` — table-driven tests for all eight recovery classes, class→action mapping, Phase 10 reasonCode mapping, and partial-write written[] preservation.
- [ ] `tests/worktree-safety.test.ts` — root validation tests for `.git`, branch, lease, stale-reclaim, and `GSD_PROJECT_ROOT` failures.
- [ ] `tests/orchestrator.test.ts` — gate/order tests proving typed `recoveryDecision`, `exitReason`, real `prepareUnitRoot` flow, and stale lease pause-with-remediation behavior.
- [ ] `tests/orchestrator-journal.test.ts` — persisted journal JSON tests for bounded `recoveryDecision`, `exitReason`, action, lease acquire, lease release, and stale-reclaim events.

---

## Manual-Only Verifications

All phase behaviors should have automated verification through Vitest, `npm run typecheck`, and `npm run check`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all new test-file creation requirements
- [x] No watch-mode flags
- [x] Feedback latency target documented for targeted tests
- [x] `nyquist_compliant: true` set in frontmatter because every planned behavior has an automated verification target

**Approval:** pending execution
