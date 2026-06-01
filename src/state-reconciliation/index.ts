import { existsSync } from "node:fs";
import { join } from "node:path";
import { classifyDrift } from "./catalog.js";
import { readJournalState } from "./journal.js";
import { applyRepairs, planRepairs } from "./repair.js";
import { readRoadmapState } from "./roadmap.js";
import { scanPlanningArtifacts } from "./scan.js";
import { readStateDigest } from "./state.js";
import type { ReconciliationOptions, ReconciliationReport } from "./types.js";

export { classifyDrift, KNOWN_DRIFT_KINDS } from "./catalog.js";
export { classifyArtifactName } from "./artifacts.js";
export { readJournalState } from "./journal.js";
export { applyRepairs, planRepairs } from "./repair.js";
export { readRoadmapState } from "./roadmap.js";
export { scanPlanningArtifacts } from "./scan.js";
export { readStateDigest } from "./state.js";
export * from "./types.js";

export function reconcileBeforeDispatch(basePath: string, options: ReconciliationOptions = {}): ReconciliationReport {
  const scan = scanPlanningArtifacts(basePath);
  const snapshot = {
    phasesPath: scan.phasesPath,
    phases: scan.phases,
    totals: scan.totals,
  };
  const roadmap = readOptionalRoadmapState(basePath);
  const state = readOptionalStateDigest(basePath);
  const journal = readJournalState(basePath);
  const detection = classifyDrift({ snapshot, roadmap, state, journal });
  const blockers = [
    ...scan.blockers,
    ...(roadmap?.blockers ?? []),
    ...(state?.blockers ?? []),
    ...journal.blockers,
    ...detection.blockers,
  ];
  const repairs = planRepairs(detection);
  const application = options.apply && blockers.length === 0
    ? applyRepairs(basePath, repairs)
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
