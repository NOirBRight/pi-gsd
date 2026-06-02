import { existsSync } from "node:fs";
import { join } from "node:path";
import { classifyDrift } from "./catalog.js";
import { readJournalState } from "./journal.js";
import { applyRepairs, planRepairs } from "./repair.js";
import { readRoadmapState } from "./roadmap.js";
import { scanPlanningArtifacts } from "./scan.js";
import { readStateDigest } from "./state.js";
import type { CanonicalPhaseArtifacts, PlanningArtifactTotals, ReconciliationOptions, ReconciliationReport } from "./types.js";

export { classifyDrift, KNOWN_DRIFT_KINDS } from "./catalog.js";
export { classifyArtifactName } from "./artifacts.js";
export { ReconciliationFailedError } from "./errors.js";
export { readJournalState } from "./journal.js";
export { applyRepairs, planRepairs } from "./repair.js";
export { readRoadmapState } from "./roadmap.js";
export { scanPlanningArtifacts } from "./scan.js";
export { readStateDigest } from "./state.js";
export * from "./types.js";

export function reconcileBeforeDispatch(basePath: string, options: ReconciliationOptions = {}): ReconciliationReport {
  const scan = scanPlanningArtifacts(basePath);
  const requestedPhase = options.phase?.padStart(2, "0");
  const phases = requestedPhase ? scan.phases.filter((phase) => phase.phase === requestedPhase) : scan.phases;
  const snapshot = {
    phasesPath: scan.phasesPath,
    phases,
    totals: options.phase ? totalsFor(phases) : scan.totals,
  };
  const roadmap = readOptionalRoadmapState(basePath);
  const state = readOptionalStateDigest(basePath);
  const journal = readJournalState(basePath);
  const detection = classifyDrift({ snapshot, roadmap, state, journal, activeUnitId: options.activeUnitId });
  const blockers = [
    ...scan.blockers,
    ...(roadmap?.blockers ?? []),
    ...(state?.blockers ?? []),
    ...journal.blockers,
    ...detection.blockers,
  ];
  const repairs = planRepairs(detection);
  const application = options.apply && blockers.length === 0
    ? applyRepairs(basePath, repairs, options.fileSystem)
    : { ok: true, blockers: [], written: [] };

  return {
    ok: blockers.length === 0 && application.ok,
    snapshot,
    repairs,
    blockers: [...blockers, ...application.blockers],
    written: application.written,
    evidence: [...scan.evidence, ...detection.evidence],
  };
}

function totalsFor(phases: CanonicalPhaseArtifacts[]): PlanningArtifactTotals {
  return {
    plans: phases.reduce((total, phase) => total + phase.plans.length, 0),
    summaries: phases.reduce((total, phase) => total + phase.summaries.length, 0),
    verifications: phases.reduce((total, phase) => total + phase.verifications.length, 0),
    reviews: phases.reduce((total, phase) => total + phase.reviews.length, 0),
    contexts: phases.reduce((total, phase) => total + phase.contexts.length, 0),
    noncanonical: phases.reduce((total, phase) => total + phase.noncanonical.length, 0),
  };
}

function readOptionalRoadmapState(basePath: string) {
  return existsSync(join(basePath, ".planning", "ROADMAP.md"))
    ? readRoadmapState(basePath)
    : undefined;
}

function readOptionalStateDigest(basePath: string) {
  return existsSync(join(basePath, ".planning", "STATE.md"))
    ? readStateDigest(basePath)
    : undefined;
}
