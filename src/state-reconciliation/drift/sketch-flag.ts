import type { DriftDetection, DriftDetectionInput } from "../catalog.js";
import type { ReconciliationEvidence } from "../types.js";

export function detectSketchFlagDrift(input: DriftDetectionInput): DriftDetection {
  if (!input.sketch) return empty();
  if (typeof input.sketch.observedEnabled === "boolean" && input.sketch.observedEnabled === input.sketch.expectedEnabled) return empty();

  const evidence: ReconciliationEvidence[] = input.sketch.evidencePaths.map((path) => ({
    reasonCode: "sketch-flag-drift",
    path,
    phase: input.sketch?.phase,
    message: "Sketch metadata was considered but does not mechanically prove the ROADMAP flag.",
  }));

  return {
    repairs: [],
    blockers: [{
      reasonCode: "sketch-flag-drift",
      phase: input.sketch.phase,
      artifact: "roadmap",
      message: "Sketch flag drift is not mechanically provable from available sketch metadata.",
      evidence,
      suggestedNextAction: "manual-review",
    }],
    evidence: [],
  };
}

function empty(): DriftDetection {
  return { repairs: [], blockers: [], evidence: [] };
}
