import type { DriftDetection, DriftDetectionInput } from "../catalog.js";

export function detectUnknownDrift(input: DriftDetectionInput): DriftDetection {
  return {
    repairs: [],
    blockers: (input.unsupportedMismatches ?? []).map((mismatch) => ({
      reasonCode: "unknown-drift",
      artifact: "state",
      message: `Unsupported drift mismatch: ${mismatch.message}`,
      evidence: [{
        reasonCode: "unknown-drift",
        path: mismatch.path,
        message: mismatch.message,
      }],
      suggestedNextAction: "manual-review",
    })),
    evidence: [],
  };
}
