---
phase: 07
phase_slug: pi-runtime-spike-gsd-pi-module-mapping
date: 2026-05-31
---

# Phase 07 — Validation Strategy

## Validation Architecture

This phase is a pure research spike — there are no production code changes. All verification is manual source inspection against the spike deliverables.

### Test Framework

- **N/A** — no executable code produced

### Spike Verification

Each of the 3 deliverables is verified by manual inspection against source evidence:

| Artifact | Verification Method | Source |
|----------|-------------------|--------|
| `pi-argv.md` | Compare documented substitution patterns against `prompt-templates.js` source | `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js` |
| `gsd-pi-module-map.md` | Compare mapped files/ADRs against actual gsd-pi fork source | `D:\Workstation\gsd-pi-fork` (commit fc39cdcdd) |
| `upstream-1.2.0-impact.md` | Compare cataloged API surfaces against actual 1.2.0 source files | `@opengsd/gsd-core@1.2.0` (npm tarball) |

### Requirement-to-Test Mapping

| REQ-ID | Covered By | Verification Method |
|--------|-----------|-------------------|
| RUNTIME-01 | pi-argv.md | Source inspection of prompt-templates.js substitution patterns |
| STATE-03 | gsd-pi-module-map.md | Cross-reference ADR-017 against gsd-pi-fork source |
| ORCH-01 | gsd-pi-module-map.md | Cross-reference ADR-009/014 against gsd-pi-fork source |
| UPSTREAM-03 | upstream-1.2.0-impact.md | Source inspection of gsd-tools.cjs + gsd_run |
| UPSTREAM-04 | upstream-1.2.0-impact.md | Source inspection of observability/logger.cjs DispatchLogger seam |

### Sampling and Automation

- **Sampling rate:** 100% — all 3 deliverables are manually verified
- **Feedback latency:** Immediate — verification happens during artifact creation
- **Automated checks:** None — this spike produces documentation only
- **Nyquist compliance:** Wave 0 completeness verified by plan-checker dimension 8

### Status

Research spike — no executable tests by design. Verification is manual source inspection documented in each artifact's creation process.
