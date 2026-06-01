import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

export function runPostDispatchGate(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, options: { cwd?: string; verifierSkip?: boolean; exists?: (path: string) => boolean } = {}): GateResult {
  const exists = options.exists ?? existsSync;
  const cwd = options.cwd ?? process.cwd();
  const phaseDir = join(cwd, ".planning", "phases");

  if (unit.type === "plan") {
    return existsMatching(phaseDir, unit.phase, "PLAN.md", exists)
      ? pass("artifact", "plan artifact exists")
      : fail("Plan Unit did not produce a *-PLAN.md artifact.", [`missing:${unit.phase}-*-PLAN.md`]);
  }

  if (unit.type === "execute") {
    return existsMatching(phaseDir, unit.phase, "SUMMARY.md", exists)
      ? pass("artifact", "summary artifact exists")
      : fail("Execute Unit did not produce a *-SUMMARY.md artifact.", [`missing:${unit.phase}-*-SUMMARY.md`]);
  }

  if (unit.type === "verify") {
    if (options.verifierSkip || !snapshot.settings.workflow.verifier) return pass("artifact", "verifier skipped by settings");
    return existsMatching(phaseDir, unit.phase, "VERIFICATION.md", exists)
      ? pass("artifact", "verification artifact exists")
      : fail("Verify Unit did not produce a *-VERIFICATION.md artifact.", [`missing:${unit.phase}-*-VERIFICATION.md`]);
  }

  if (unit.type === "closeout") {
    return pass("artifact", "closeout evidence deferred to phase status seam");
  }

  return pass("artifact", `${unit.type} has no Phase 9 artifact gate`);
}

function decideDispatch(_snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  const knownTypes: OrchestrationUnit["type"][] = ["discuss", "research", "plan", "plan-check", "execute", "code-review", "verify", "ui-review", "closeout", "settings-gate", "pause-for-user"];
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

function existsMatching(phaseRoot: string, phase: string, suffix: string, exists: (path: string) => boolean) {
  const commonNames = [
    join(phaseRoot, `${phase}-${suffix}`),
    join(phaseRoot, `${phase}-01-${suffix}`),
  ];
  if (commonNames.some((path) => exists(path))) return true;

  try {
    return readdirSync(phaseRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`))
      .some((entry) => exists(join(phaseRoot, entry.name, `${phase}-${suffix}`)) || exists(join(phaseRoot, entry.name, `${phase}-01-${suffix}`)));
  } catch {
    return false;
  }
}
