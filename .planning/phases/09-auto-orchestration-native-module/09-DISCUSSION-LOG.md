# Phase 9: Auto Orchestration Native Module - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 9-Auto Orchestration Native Module
**Areas discussed:** Unit boundary, State journal, Native vs CLI, Observability

---

## Unit Boundary

| Question | User's choice / response | Notes |
|---|---|---|
| First native orchestrator coverage | Reference `/gsd-settings` and all global/project settings | User emphasized settings include many related parameters, not just phase toggles. |
| Unit granularity | Workflow step | Plan/Execute/Verify/Closeout and settings-gated workflow steps are Units. |
| Optional gates | Reference settings; if unclear ask user | User expects original behavior likely has AskUserQuestion confirmation patterns. |
| Failure behavior | Use settings retry | Interpreted as using `workflow.node_repair` / `workflow.node_repair_budget` before pause/escalation. |
| Settings-driven lock confirmation | Not locked yet | Captured as planner research requirement for precedence between settings, roadmap indicators, and user confirmation. |
| Continue? | Next area | Unit boundary discussion complete enough for context. |

---

## State Journal

| Question | User's choice / response | Notes |
|---|---|---|
| Primary lifecycle state location | Sibling JSON | Detailed lifecycle state should not live as full transition history in `STATE.md`. |
| Resume semantics | Asked when resume is used | Explained resume as restart after session interruption, failure, human gate, or repair-budget exhaustion. |
| Transition granularity | Gate outcomes | Record lifecycle/gate events, not every tool call. |
| `STATE.md` role | Asked whether digest+pointer conforms to upstream | Read upstream artifact/state docs. Captured as: likely conforms, but planner must verify handlers/resume consumption. |
| Resume lock after explanation | Current + replay | Current snapshot for restore; replayable history for audit/debug. |
| Continue? | Next area | State journal discussion complete enough for context. |

---

## Native vs CLI

| Question | User's choice / response | Notes |
|---|---|---|
| Allowed `gsd-tools.cjs` dependency | CLI for mutations | Native loop owns orchestration; registered CLI handlers remain acceptable for `.planning/` mutations. |
| Unit dispatch mechanism | Pi subagents | Dispatch GSD agents through Pi subagent/agent APIs. |
| Replacement for `AUTO_MODE_CHECKLIST` | Code gates | Runtime gates validate artifacts/status instead of prompt reminders. |
| Phase 9 / Phase 10 boundary | Thin adapter | Define reconciliation seam/stub; full repair in Phase 10. |
| Continue? | Next area | Native vs CLI discussion complete. |

---

## Observability

| Question | User's choice / response | Notes |
|---|---|---|
| Events to record | Lifecycle + gates | Start/stop, Unit start/end, settings resolved, gates, retry, pause/resume/stop. |
| Enable `GSD_AUDIT=1` | Scoped enable | Only inside native auto/chain run child environment. |
| Sensitive info handling | Redacted default | No secrets/full args/user text by default. |
| User status surface | `getStatus` API | Must expose current Unit, queue, attempt, last event, resume hint. |
| Continue? | Ready context | Proceeded to write CONTEXT.md. |

---

## Claude's Discretion

- Exact sibling journal filename and schema.
- Exact `getStatus()` return shape.
- Exact artifact-gate validator implementation details.
- Exact pause/resume message wording.

## Deferred Ideas

- Phase 10: full State Reconciliation drift catalog and idempotent repair.
- Phase 11: Worktree Safety and full Recovery Classification.
- Phase 12: Tool Contract and Settings Bridge.
- v2.1: parallel slice orchestration.
