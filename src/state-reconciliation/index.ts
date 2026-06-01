import { scanPlanningArtifacts } from "./scan.js";
import type { ReconciliationOptions, ReconciliationReport } from "./types.js";

export { classifyArtifactName } from "./artifacts.js";
export { scanPlanningArtifacts } from "./scan.js";
export * from "./types.js";

export function reconcileBeforeDispatch(basePath: string, options: ReconciliationOptions = {}): ReconciliationReport {
  const scan = scanPlanningArtifacts(basePath);

  return {
    ok: scan.blockers.length === 0,
    snapshot: {
      phasesPath: scan.phasesPath,
      phases: scan.phases,
      totals: scan.totals,
    },
    repairs: [],
    blockers: scan.blockers,
    written: options.apply ? [] : [],
    evidence: scan.evidence,
  };
}
