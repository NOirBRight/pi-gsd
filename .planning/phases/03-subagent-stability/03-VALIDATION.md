---
phase: "03"
phase-slug: "subagent-stability"
created: "2026-05-30"
---

# Phase 03: Subagent Stability — Validation Strategy

## Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.7 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` (same — 3.3s total) |

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | ensureAccessibleDir catches EPERM and falls back | unit (upstream) | `npx vitest run` (upstream repo) | ❌ Upstream must add |
| D-02 | DIRS container propagates fallback paths to consumers | unit (upstream) | `npx vitest run` (upstream repo) | ❌ Upstream must add |
| D-03 | Upstream PR submitted | manual | N/A | ❌ Must be done |
| D-04 | pi-gsd-redux full suite still passes after pi-subagents change | unit + integration | `npx vitest run && npm run check` | ✅ |
| D-04 | /gsd-models works in fresh Pi session | manual | Pi session test | ❌ Manual |
| D-04 | Doctor command passes | integration | `node dist/cli.js doctor --prompts generated/prompts --agents --cwd .` | ✅ |

## Sampling Rate

- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run && npm run check`
- **Phase gate:** Full suite green + manual /gsd-models verification

## Wave 0 Gaps

- [ ] Upstream test for `ensureAccessibleDir` EPERM handling — covers D-01
- [ ] Upstream test for `DIRS.results`/`DIRS.async` fallback propagation — covers D-02
- [ ] Manual test procedure doc for /gsd-models post-fix verification — covers D-04