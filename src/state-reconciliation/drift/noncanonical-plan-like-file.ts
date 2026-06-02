import type { DriftDetection, DriftDetectionInput } from "../catalog.js";

export function detectNoncanonicalPlanLikeFiles(input: DriftDetectionInput): DriftDetection {
  return {
    repairs: [],
    blockers: [],
    evidence: input.snapshot.phases.flatMap((phase) => phase.noncanonical),
  };
}
