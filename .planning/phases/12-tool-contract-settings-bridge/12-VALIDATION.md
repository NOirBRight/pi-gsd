# Phase 12: Tool Contract + Settings Bridge - Validation Architecture

**Created:** 2026-06-02
**Status:** Required before execution

## Purpose

Define the validation gate for Phase 12 before execution. Phase 12 changes native dispatch safety and Pi prompt context behavior, so validation must prove both contract enforcement and settings bridge behavior with targeted automated tests before broad checks.

## Requirement Coverage

| Requirement | Validation focus | Primary tests |
|---|---|---|
| CONTRACT-01 | Generated-first per-Unit contract compilation, supplement-only overlay, dispatch-critical parity drift, stable snapshot/hash | `tests/tool-contract.test.ts`, `tests/doctor.test.ts` |
| CONTRACT-02 | `validateToolContract` pre-dispatch gate fails closed with `dispatch-contract-invalid -> stop`; invalid Unit never dispatches | `tests/tool-contract.test.ts`, `tests/orchestrator.test.ts` |
| SETTINGS-01 | GSD-related Pi context gets concise effective workflow/model/source summary; unrelated contexts stay clean | `tests/settings-bridge.test.ts`, `tests/extension.test.ts` |
| SETTINGS-02 | Same settings source as upstream `gsd:settings`, active-workstream precedence, lazy mtime/hash refresh, notify-once, parse-failure blocking for GSD | `tests/settings-bridge.test.ts`, `tests/orchestrator-settings.test.ts`, `tests/extension.test.ts` |

## Test Strategy

### Plan 12-01 — Tool Contract

Required targeted commands:

```bash
npx vitest run tests/tool-contract.test.ts tests/orchestrator.test.ts tests/doctor.test.ts --reporter=dot
npm run typecheck
npm run check
```

Required assertions:

- Compiler reads upstream-derived generated prompts/agents/workflows/manifests; generated artifacts are inputs, not hand-edited runtime targets.
- `generated/tool-contracts.json` is deterministic and includes a stable `contractHash`.
- Dispatch-critical drift fails doctor/check; prose-only drift is warning-only.
- Supplement-only overlay cannot relax upstream allowed tools or policy constraints.
- Invalid Unit contract fails before dispatch and before `prepareUnitRoot`.
- Failure evidence is bounded: Unit identifiers, field names, hash/version, expected/actual summaries, source paths; no full prompt/user text/secrets.

### Plan 12-02 — Settings Bridge

Required targeted commands:

```bash
npx vitest run tests/settings-bridge.test.ts tests/orchestrator-settings.test.ts tests/extension.test.ts --reporter=dot
npx vitest run tests/settings-bridge.test.ts tests/orchestrator-settings.test.ts tests/gsd-models.test.ts --reporter=dot
npm run typecheck
npm run check
```

Required assertions:

- Config source resolution order matches upstream settings workflow: explicit config path, `.planning/active-workstream` → `.planning/workstreams/<slug>/config.json`, `.planning/config.json`, legacy root `config.json`.
- `resolveWorkflowSettings` and Settings Bridge share source resolution; Pi-visible context and native runtime behavior do not diverge.
- Settings context is concise/redacted: no raw config dump, no full model catalog, no tokens/secrets.
- Context injection is limited to GSD-related contexts; unrelated Pi conversations are unchanged.
- Lazy refresh compares mtime/hash and does not start long-lived watchers.
- Each new settings hash notifies at most once.
- Malformed settings block GSD context/native auto dispatch with warning/remediation while ordinary non-GSD chat continues.

## Red / Green / Refactor Expectations

- Write or extend failing Vitest tests before production code for each task.
- Implement smallest code changes needed to pass targeted tests.
- Refactor only after targeted tests are green.
- Run `npm run check` before phase closeout.

## Execution Gate

Execution may proceed only when:

1. `12-CONTEXT.md`, `12-RESEARCH.md`, `12-VALIDATION.md`, `12-01-PLAN.md`, and `12-02-PLAN.md` exist.
2. `12-RESEARCH.md` open questions are marked resolved.
3. Plan-checker returns PASS or no blockers.

## Notes

- No new external dependencies are planned.
- Planning artifacts remain uncommitted because current config reports `commit_docs=false`; do not commit unless the user explicitly requests it.
