---
phase: 11-worktree-safety-recovery-classification
security_reviewed: 2026-06-02T03:50:08Z
asvs_level: default
block_on: open_threats
threats_total: 16
threats_closed: 16
threats_open: 0
unregistered_flags: 0
status: secured
accepted_risks:
  - T-11-SC
---

# Phase 11 Security Audit

Scope: verify declared plan-time threat mitigations only. Implementation files were read-only; only this `11-SECURITY.md` was written.

## Threat Register Status

| Threat ID | Category | Disposition | Status | Evidence |
|---|---|---:|---|---|
| T-11-01 | Tampering | mitigate | CLOSED | `src/recovery/types.ts:3`, `src/recovery/types.ts:19`, `src/recovery/classify-failure.ts:46`; tests at `tests/recovery.test.ts:19-22`. Only `unknown` occurrence in recovery source is `unknown-drift` reason-code input at `src/recovery/classify-failure.ts:12`, not a recovery class fallback. |
| T-11-02 | Repudiation | mitigate | CLOSED | `src/orchestrator/reconciliation.ts:60-65` passes `reasonCode`, `blockers`, `written`, and evidence into `classifyFailure`; bounded gate evidence at `src/orchestrator/reconciliation.ts:79-86`; partial-write test at `tests/recovery.test.ts:44-48`. |
| T-11-03 | Denial of Service | mitigate | CLOSED | Retry path checks `snapshot.settings.workflow.node_repair_budget` at `src/orchestrator/state-machine.ts:164`; only retry scheduling branch emits `retry_scheduled` at `src/orchestrator/state-machine.ts:166`; budget regression test at `tests/orchestrator.test.ts:55-75`. |
| T-11-04 | Tampering | mitigate | CLOSED | `prepareUnitRoot` resolves roots at `src/worktree-safety/prepare-unit-root.ts:39-41`, requires `.git` at line 47, checks `GSD_PROJECT_ROOT` at lines 51-53, checks branch at line 56, and returns typed failures through `fail()` at lines 72-91. |
| T-11-05 | Elevation of Privilege | mitigate | CLOSED | Lease expected owner binds unit/session/phase/branch/root/host/pid at `src/worktree-safety/lease.ts:165`; owner comparison at `src/worktree-safety/lease.ts:168-169`; wrong-owner/stale decisions at `src/worktree-safety/lease.ts:55-60`. |
| T-11-06 | Tampering | mitigate | CLOSED | Branch mismatch returns typed failure at `src/worktree-safety/prepare-unit-root.ts:56-57`; grep for `checkout|switch` in `src` found no git checkout/switch call, only remediation text at `src/worktree-safety/prepare-unit-root.ts:57`. |
| T-11-07 | Information Disclosure | mitigate | CLOSED | Lease event type contains bounded fields only at `src/worktree-safety/types.ts:4-22`; event builder emits bounded unit/phase/root/branch/path/action/class/reason/host/pid fields at `src/worktree-safety/lease.ts:121`; journal redaction drops unsafe keys at `src/orchestrator/journal.ts:38-39`. |
| T-11-08 | Tampering | mitigate | CLOSED | Orchestrator gate imports real worktree safety at `src/orchestrator/gates.ts:4`; gate order includes `prepareUnitRoot` before `persistRuntimeState` at `src/orchestrator/gates.ts:12-17`; adapter calls `prepareSafeUnitRoot` at `src/orchestrator/gates.ts:87-98`; placeholder grep found no `phase-11-worktree-safety-seam`. |
| T-11-09 | Repudiation | mitigate | CLOSED | Lease events flow from gates to `AdvanceResult.events` via `leaseEvents(...)` in `src/orchestrator/state-machine.ts:63-66`, `:124`, and `:319`; `createAutoOrchestrator` records `result.events` through `deps.journal.append` at `src/orchestrator/index.ts:116-121`; integration test at `tests/orchestrator-journal.test.ts:163-169`. |
| T-11-10 | Information Disclosure | mitigate | CLOSED | `redactJournalEvent` whitelists event keys and drops unsafe keys at `src/orchestrator/journal.ts:38-39`, handles `recoveryDecision` explicitly at `src/orchestrator/journal.ts:132-135`, caps paths/written arrays at `src/orchestrator/journal.ts:139-141`, and sanitizes nested decisions at `src/orchestrator/journal.ts:158-180`. |
| T-11-11 | Tampering | mitigate | CLOSED | Stale incomplete/contradictory lease evidence maps to `user-input-required`/`unrepaired-state-drift` and pause action at `src/worktree-safety/lease.ts:55-58`; tests assert not `worktree-invalid` at `tests/worktree-safety.test.ts:149-158`; journal persistence test covers pause-with-remediation at `tests/orchestrator-journal.test.ts:188-209`. |
| T-11-04-01 | Spoofing | mitigate | CLOSED | `releaseLeaseOwnership` reads current lease and constructs expected owner at `src/worktree-safety/lease.ts:63-78`, rejects non-owners at `src/worktree-safety/lease.ts:80-82`, and uses the same unit/session/phase/root/branch/host/pid owner check at `src/worktree-safety/lease.ts:168-169`. |
| T-11-04-02 | Tampering | mitigate | CLOSED | Release resolves lease path through `resolveLeasePath` at `src/worktree-safety/lease.ts:65-68`; `.planning` containment is enforced at `src/worktree-safety/lease.ts:172-176`; release unsafe path test at `tests/worktree-safety.test.ts:193-202`. |
| T-11-04-03 | Repudiation | mitigate | CLOSED | Production `releaseLeaseOwnership` emits `leaseReleasedEvent` at `src/worktree-safety/lease.ts:90`; orchestrator release hook calls it at `src/orchestrator/state-machine.ts:267-288`; `record()` persists events through `JournalAdapter.append` at `src/orchestrator/index.ts:116-121`; runtime test at `tests/orchestrator.test.ts:184-186`. |
| T-11-04-04 | Information Disclosure | mitigate | CLOSED | Release event uses bounded builder at `src/worktree-safety/lease.ts:112-121`; journal sanitizer applies the same whitelist/redaction at `src/orchestrator/journal.ts:38-41` and `src/orchestrator/journal.ts:123-151`; unsafe payload test at `tests/orchestrator-journal.test.ts:174-216`. |
| T-11-SC | Tampering | mitigate | CLOSED | User explicitly approved upgrading `pi-subagents` from `ec7bfe8ac129f658008d508925e81baf3c32c41c` to `0511a836a10690416bb3f37c27354daa6a746866`. Legitimacy checks confirmed `npm ls pi-subagents --depth=0` resolves `pi-subagents@0.25.0` to the new hash, `node_modules/pi-subagents/package.json` reports name `pi-subagents`, version `0.25.0`, license `MIT`, and both old/new commits fetch from `https://github.com/NOirBRight/pi-subagents.git`. |

## Open Threats

None.

## Accepted Risks

| Threat ID | Decision | Evidence |
|---|---|---|
| T-11-SC | Accepted as approved dependency upgrade by user request. | `pi-subagents` hash changed from `ec7bfe8ac129f658008d508925e81baf3c32c41c` to `0511a836a10690416bb3f37c27354daa6a746866`; both commits exist in the expected upstream repository; installed package metadata remains `pi-subagents@0.25.0`, MIT. |

## Unregistered Flags

None. `11-04-SUMMARY.md` reports: “None beyond the plan threat model.” Other Phase 11 summaries did not declare additional `## Threat Flags` entries.

## Audit Trail

- Loaded required auditor instructions from `C:/Users/noirb/.claude/agents/gsd-security-auditor.md`.
- Checked project skills directories `.claude/skills/` and `.agents/skills/`; neither exists.
- Read all required Phase 11 plan, summary, review, verification, UAT, implementation, and test files listed in the task.
- Grep-verified each declared mitigation in the implementation or tests; did not modify implementation files.
- Wrote this security report to `.planning/phases/11-worktree-safety-recovery-classification/11-SECURITY.md`.
- 2026-06-02T03:50:08Z: User approved the `pi-subagents` hash upgrade. Verified installed package metadata and fetched both old/new commits from `https://github.com/NOirBRight/pi-subagents.git`; closed T-11-SC as accepted approved dependency upgrade.
