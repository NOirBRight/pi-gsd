import type { DriftDetection, DriftDetectionInput } from "../catalog.js";
import type { ReconciliationEvidence } from "../types.js";

export function detectStaleWorker(input: DriftDetectionInput): DriftDetection {
  const journal = input.journal;
  if (!journal?.ok || journal.journal?.snapshot.status !== "running") return empty();

  const currentUnit = unitId(journal.journal.snapshot.currentUnit);
  const evidence: ReconciliationEvidence[] = [{
    reasonCode: "stale-worker",
    path: journal.path,
    message: "Journal has an active worker snapshot that requires recovery classification.",
    metadata: currentUnit ? { currentUnit } : undefined,
  }];

  return {
    repairs: [],
    blockers: [{
      reasonCode: "stale-worker",
      artifact: "journal",
      message: "Journal active worker state requires recovery classification.",
      evidence,
      suggestedNextAction: "requires-recovery-classification",
    }],
    evidence: [],
  };
}

function unitId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function empty(): DriftDetection {
  return { repairs: [], blockers: [], evidence: [] };
}
