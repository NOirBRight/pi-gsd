import { detectNoncanonicalPlanLikeFiles } from "./drift/noncanonical-plan-like-file.js";
import { detectCompletionTimestampDrift } from "./drift/completion-timestamp.js";
import { detectRoadmapDivergence } from "./drift/roadmap-divergence.js";
import { detectSummaryCountMismatch } from "./drift/summary-count-mismatch.js";
import type { RoadmapState } from "./roadmap.js";
import type { ReconciledStateSnapshot, ReconciliationBlocker, ReconciliationEvidence, ReconciliationReasonCode, ReconciliationRepair } from "./types.js";

export const KNOWN_DRIFT_KINDS = [
  "sketch-flag-drift",
  "completion-timestamp-drift",
  "roadmap-divergence",
  "stale-worker",
  "unregistered-milestone",
  "summary-count-mismatch",
  "noncanonical-plan-like-file",
  "unknown-drift",
] as const satisfies readonly ReconciliationReasonCode[];

export type DriftDetectionInput = {
  snapshot: ReconciledStateSnapshot;
  roadmap?: RoadmapState;
};

export type DriftDetection = {
  repairs: ReconciliationRepair[];
  blockers: ReconciliationBlocker[];
  evidence: ReconciliationEvidence[];
};

export type DriftDetector = (input: DriftDetectionInput) => DriftDetection;

const DETECTORS: DriftDetector[] = [
  detectSummaryCountMismatch,
  detectRoadmapDivergence,
  detectCompletionTimestampDrift,
  detectNoncanonicalPlanLikeFiles,
];

export function classifyDrift(input: DriftDetectionInput): DriftDetection {
  return DETECTORS.reduce<DriftDetection>((combined, detector) => {
    const result = detector(input);
    combined.repairs.push(...result.repairs);
    combined.blockers.push(...result.blockers);
    combined.evidence.push(...result.evidence);
    return combined;
  }, { repairs: [], blockers: [], evidence: [] });
}
