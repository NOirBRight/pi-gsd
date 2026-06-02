# Phase 12: Tool Contract + Settings Bridge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 12-Tool Contract + Settings Bridge
**Areas discussed:** Contract source, Enforcement behavior, Settings context, Settings changes

---

## Contract Source

### Canonical source

| Option | Description | Selected |
|--------|-------------|----------|
| Generated-first | From generated prompts / agents / upstream schema manifests; Pi runtime overlay only supplements local runtime fields. | ✓ |
| Hand-authored contract table | Maintain explicit Unit→tools/policy/schema table in `src/tool-contract/`. | |
| Mixed co-equal sources | Treat generated and hand-authored tables as co-primary and reconcile them. | |

**User's choice:** Generated-first.
**Notes:** Chosen to preserve upstream GSD content as canonical.

### Drift test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Dispatch-critical fields | Cover allowed tools, prompt obligations, schema enum values, validation requirements, closeout requirements. | ✓ |
| Full prompt diff | Include broad prompt text diffs. | |
| Minimal smoke | Only verify each Unit has a contract and passes a gate. | |

**User's choice:** Dispatch-critical fields.

### Overlay authority

| Option | Description | Selected |
|--------|-------------|----------|
| Supplement-only | Add Pi runtime metadata; do not relax upstream allowed tools/policies. | ✓ |
| Tighten only | May remove tools or strengthen validation, but not broaden authority. | |
| Full override | May replace any contract field. | |

**User's choice:** Supplement-only.

### Compile timing

| Option | Description | Selected |
|--------|-------------|----------|
| Build/generated snapshot | Compile/verify stable contract snapshot during generate/build/check; runtime reads verified output. | ✓ |
| Every runtime dispatch | Recompile live before dispatch. | |
| Tests only | Compile in tests/check but keep runtime static table. | |

**User's choice:** Build/generated snapshot.

---

## Enforcement Behavior

### Critical failure action

| Option | Description | Selected |
|--------|-------------|----------|
| Direct stop | Map critical failures to `dispatch-contract-invalid` → `stop`. | ✓ |
| Pause for remediation | Pause and allow repair before continuing. | |
| Warn and continue | Record warning but still dispatch. | |

**User's choice:** Direct stop.

### Noncritical drift

| Option | Description | Selected |
|--------|-------------|----------|
| Critical stop, other warn | Dispatch-critical fields stop; docs/prose drift warning-only in doctor/check. | ✓ |
| All stop | Any drift stops. | |
| All warning | All drift is advisory. | |

**User's choice:** Critical stop, other warn.

### Upfront invalid-input scope

| Option | Description | Selected |
|--------|-------------|----------|
| Unit dispatch inputs | Cover native orchestrator inputs into planner/researcher/executor Units first. | ✓ |
| Command + Unit | Validate both user command args and Unit dispatch inputs. | |
| Tests only | Runtime does not reject invalid inputs. | |

**User's choice:** Unit dispatch inputs.

### Failure evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Structured minimal evidence | `unitId`, `unitType`, contract hash/version, failed field, expected/actual, source paths. | ✓ |
| Full diff | Record full prompt/contract diff. | |
| Short message | One-line reason only. | |

**User's choice:** Structured minimal evidence.

---

## Settings Context

### Context content

| Option | Description | Selected |
|--------|-------------|----------|
| Effective workflow summary | Resolved workflow toggles, model/profile summary, source metadata, key defaults. | ✓ |
| Full config JSON | Inject raw settings/config. | |
| Overrides only | Only inject user-changed settings. | |

**User's choice:** Effective workflow summary.

### Injection timing

| Option | Description | Selected |
|--------|-------------|----------|
| GSD-related sessions | Parse/cache at session start; inject only for GSD prompts/workflows/native auto context. | ✓ |
| Every session | Always inject when extension loads. | |
| Command invocation only | Inject only while running `/gsd-*`. | |

**User's choice:** GSD-related sessions.

### Model/profile detail

| Option | Description | Selected |
|--------|-------------|----------|
| Routing summary | Current profile, agent tier→Pi model mapping summary, source. | ✓ |
| Full model list | Dump all available models and mappings. | |
| No model info | Workflow toggles only. | |

**User's choice:** Routing summary.

### Source/freshness detail

| Option | Description | Selected |
|--------|-------------|----------|
| Path + hash + mtime | Include source path, resolved hash, mtime, official version. | ✓ |
| Path only | Show only source path. | |
| No source | Show effective settings only. | |

**User's choice:** Path + hash + mtime.

---

## Settings Changes

### Canonical settings source

| Option | Description | Selected |
|--------|-------------|----------|
| Follow upstream resolution | Reuse upstream `gsd:settings` / config resolution semantics; no Pi-only settings file. | ✓ |
| Fixed `.planning/config.json` | Pi only reads/writes `.planning/config.json`. | |
| Pi-independent settings | Create separate Pi settings source. | |

**User's choice:** Follow upstream resolution.

### Refresh strategy

| Option | Description | Selected |
|--------|-------------|----------|
| mtime/hash lazy refresh | Check before GSD context/native dispatch; refresh cache on change. | ✓ |
| File watcher | Start watcher for immediate updates. | |
| New session only | Changes apply only after a new session. | |

**User's choice:** mtime/hash lazy refresh.

### Change notification

| Option | Description | Selected |
|--------|-------------|----------|
| Once per hash | Notify once per new settings hash with source + summary. | ✓ |
| Every time | Notify every detection. | |
| Silent | Refresh without notifying. | |

**User's choice:** Once per hash.

### Parse failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Conservatively block GSD | Warn and block/pause GSD context/native auto; ordinary chat continues. | ✓ |
| Fallback defaults | Use defaults and notify. | |
| Doctor only | Ignore at runtime; doctor/check reports later. | |

**User's choice:** Conservatively block GSD.

---

## Claude's Discretion

- Exact TypeScript type names and module layout inside `src/tool-contract/`.
- Exact stable contract snapshot filename/format.
- Exact warning format for noncritical drift.
- Exact concise markdown shape for settings context.

## Deferred Ideas

None.
