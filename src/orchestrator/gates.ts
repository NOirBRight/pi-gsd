import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { reconcileBeforeDispatch } from "./reconciliation.js";
import type { GateAdapter, GateName, GateResult, OrchestrationSnapshot, OrchestrationUnit } from "./types.js";

export type GateOverrides = Partial<Record<Exclude<GateName, "artifact">, GateAdapter>>;

export function runPreDispatchGates(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, overrides: GateOverrides = {}): GateResult {
  const orderedGates: [Exclude<GateName, "artifact">, GateAdapter][] = [
    ["reconcileBeforeDispatch", overrides.reconcileBeforeDispatch ?? reconcileBeforeDispatch],
    ["decideDispatch", overrides.decideDispatch ?? decideDispatch],
    ["validateToolContract", overrides.validateToolContract ?? validateToolContract],
    ["prepareUnitRoot", overrides.prepareUnitRoot ?? prepareUnitRoot],
    ["persistRuntimeState", overrides.persistRuntimeState ?? persistRuntimeState],
  ];

  for (const [, gate] of orderedGates) {
    const result = gate(snapshot, unit);
    if (!result.ok) return result;
  }

  return { ok: true, gate: "persistRuntimeState", evidence: orderedGates.map(([name]) => name) };
}

export function runPostDispatchGate(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, options: { cwd?: string; verifierSkip?: boolean; exists?: (path: string) => boolean; written?: string[] } = {}): GateResult {
  const exists = options.exists ?? existsSync;
  const cwd = options.cwd ?? process.cwd();
  const phaseDir = join(cwd, ".planning", "phases");

  if (unit.type === "plan") {
    return existsMatching(cwd, phaseDir, unit.phase, "PLAN.md", exists, options.written)
      ? pass("artifact", "plan artifact exists")
      : fail("Plan Unit did not produce a *-PLAN.md artifact.", [`missing:${unit.phase}-*-PLAN.md`]);
  }

  if (unit.type === "execute") {
    return existsMatching(cwd, phaseDir, unit.phase, "SUMMARY.md", exists, options.written)
      ? pass("artifact", "summary artifact exists")
      : fail("Execute Unit did not produce a *-SUMMARY.md artifact.", [`missing:${unit.phase}-*-SUMMARY.md`]);
  }

  if (unit.type === "verify") {
    if (options.verifierSkip || !snapshot.settings.workflow.verifier) return pass("artifact", "verifier skipped by settings");
    return existsMatching(cwd, phaseDir, unit.phase, "VERIFICATION.md", exists, options.written)
      ? pass("artifact", "verification artifact exists")
      : fail("Verify Unit did not produce a *-VERIFICATION.md artifact.", [`missing:${unit.phase}-*-VERIFICATION.md`]);
  }

  if (unit.type === "closeout") {
    return closeoutEvidence(cwd, unit.phase, options.written)
      ? pass("artifact", "closeout roadmap/state evidence exists")
      : fail("Closeout Unit requires ROADMAP and STATE evidence for the phase.", [`missing-closeout-evidence:${unit.phase}`]);
  }

  return pass("artifact", `${unit.type} has no Phase 9 artifact gate`);
}

function decideDispatch(_snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  const knownTypes: OrchestrationUnit["type"][] = ["discuss", "research", "plan", "plan-check", "execute", "code-review", "verify", "ui-review", "security-review", "nyquist-validation", "ai-integration", "ui-safety-gate", "closeout", "settings-gate", "pause-for-user"];
  if (!knownTypes.includes(unit.type)) {
    return { ok: false, gate: "decideDispatch", reason: "ambiguous-dispatch", retryable: false, resumeHint: "Unknown Unit type; update the orchestrator Unit union before dispatch.", evidence: [`type:${String(unit.type)}`] };
  }
  if (unit.type === "pause-for-user") {
    return { ok: false, gate: "decideDispatch", reason: "ambiguous-dispatch", retryable: false, resumeHint: unit.resumeHint ?? "User input is required before dispatch.", evidence: [unit.id] };
  }
  return pass("decideDispatch", `dispatch:${unit.type}`);
}

function validateToolContract(_snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  return pass("validateToolContract", `phase-12-contract-seam:${unit.type}`);
}

function prepareUnitRoot(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  if (unit.type === "execute" && snapshot.settings.workflow.worktrees === false) {
    return pass("prepareUnitRoot", "worktree disabled by settings");
  }
  return pass("prepareUnitRoot", "phase-11-worktree-safety-seam");
}

function persistRuntimeState(_snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  return pass("persistRuntimeState", `persist-ready:${unit.id}`);
}

function pass(gate: GateName, evidence: string): GateResult {
  return { ok: true, gate, evidence: [evidence] };
}

function fail(resumeHint: string, evidence: string[]): GateResult {
  return { ok: false, gate: "artifact", reason: "gate-failed", retryable: false, resumeHint, evidence };
}

function existsMatching(cwd: string, phaseRoot: string, phase: string, suffix: string, exists: (path: string) => boolean, written?: string[]) {
  if (!written?.length) return false;
  const writtenSet = new Set(written.map((path) => normalizeWrittenPath(cwd, path)));
  const artifactPattern = new RegExp(`^${escapeRegExp(phase)}(?:-\\d+)?-${escapeRegExp(suffix)}$`);

  try {
    const candidates = [
      ...readdirSync(phaseRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(phaseRoot, entry.name)),
      ...readdirSync(phaseRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`))
        .flatMap((entry) => readdirSync(join(phaseRoot, entry.name), { withFileTypes: true })
          .filter((child) => child.isFile())
          .map((child) => join(phaseRoot, entry.name, child.name))),
    ];
    return candidates.some((path) => artifactPattern.test(basename(path)) && writtenSet.has(resolve(path)) && exists(path));
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWrittenPath(cwd: string, value: string): string {
  return resolve(isAbsolute(value) ? value : resolve(cwd, value));
}

function closeoutEvidence(cwd: string, phase: string, written?: string[]): boolean {
  if (!written?.length) return false;
  const writtenSet = new Set(written.map((path) => normalizeWrittenPath(cwd, path)));
  const roadmapPath = resolve(cwd, ".planning", "ROADMAP.md");
  const statePath = resolve(cwd, ".planning", "STATE.md");
  if (!writtenSet.has(roadmapPath) || !writtenSet.has(statePath)) return false;
  try {
    const roadmap = readFileSync(roadmapPath, "utf8");
    const state = readFileSync(statePath, "utf8");
    statSync(join(cwd, ".planning", "phases"));
    return roadmapPhaseComplete(roadmap, phase) && statePhaseComplete(state, phase);
  } catch {
    return false;
  }
}

function roadmapPhaseComplete(roadmap: string, phase: string): boolean {
  const phaseNumber = Number(phase);
  return roadmap.split(/\r?\n/).some((line) => {
    const columns = line.split("|").map((part) => part.trim());
    if (columns.length < 6) return false;
    const [done, total] = columns[3].split("/").map((part) => Number(part));
    return columns[1].startsWith(`${phaseNumber}.`)
      && Number.isInteger(done)
      && Number.isInteger(total)
      && total > 0
      && done === total
      && /^(Complete|✓ Done)$/.test(columns[4]);
  });
}

function statePhaseComplete(state: string, phase: string): boolean {
  const currentPosition = extractCurrentPositionSection(state);
  if (!currentPosition) return false;
  const phaseNumber = Number(phase);
  return currentPosition.split(/\r?\n/).some((line) => {
    const normalized = line.trim();
    return normalized.startsWith(`Phase: ${phaseNumber} `)
      && /\(\*\*completed\*\*\)|\bcompleted\b/i.test(normalized)
      && !/\bnot\s+completed\b|\bnot\s+complete\b|\bincomplete\b/i.test(normalized);
  });
}

function extractCurrentPositionSection(state: string): string {
  const match = state.match(/^## Current Position\s*\n([\s\S]*?)(?=\n##\s|$)/m);
  return match?.[1] ?? "";
}
