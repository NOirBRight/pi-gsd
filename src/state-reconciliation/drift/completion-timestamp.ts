import { readFileSync } from "node:fs";
import type { DriftDetection, DriftDetectionInput } from "../catalog.js";
import type { ReconciliationBlocker, ReconciliationEvidence, ReconciliationRepair } from "../types.js";

export function detectCompletionTimestampDrift(input: DriftDetectionInput): DriftDetection {
  if (!input.roadmap) return empty();

  const repairs: ReconciliationRepair[] = [];
  const blockers: ReconciliationBlocker[] = [];

  for (const row of input.roadmap.phases) {
    const phase = input.snapshot.phases.find((candidate) => candidate.phase === row.phase);
    if (!phase || phase.plans.length === 0 || phase.summaries.length !== phase.plans.length) continue;

    const provenDate = provenCompletionDate(phase.summaries);
    const evidence: ReconciliationEvidence[] = [
      {
        reasonCode: "completion-timestamp-drift",
        path: row.path,
        phase: row.phase,
        artifact: "roadmap",
        message: "ROADMAP row considered for completion timestamp repair.",
        metadata: { line: row.line },
      },
      ...phase.summaries.map((path) => ({
        reasonCode: "completion-timestamp-drift" as const,
        path,
        phase: row.phase,
        artifact: "summary" as const,
        message: "Canonical summary considered for ROADMAP completion timestamp.",
      })),
    ];

    if (!provenDate) {
      if (row.status !== "Complete") continue;
      blockers.push({
        reasonCode: "completion-timestamp-drift",
        phase: row.phase,
        artifact: "roadmap",
        message: `ROADMAP phase ${row.phase} completion timestamp cannot be repaired because canonical summaries do not prove one timestamp.`,
        evidence,
        suggestedNextAction: "manual-review",
      });
      continue;
    }

    if (row.completed === provenDate) continue;
    repairs.push({
      reasonCode: "completion-timestamp-drift",
      action: "update-roadmap-completed",
      phase: row.phase,
      path: row.path,
      description: `Update ROADMAP phase ${row.phase} completed timestamp to ${provenDate}.`,
      evidence,
    });
  }

  return { repairs, blockers, evidence: [] };
}

function provenCompletionDate(summaryPaths: string[]): string | undefined {
  const dates = new Set<string>();
  for (const path of summaryPaths) {
    const match = /^completed:\s*["']?(?<date>\d{4}-\d{2}-\d{2})["']?\s*$/m.exec(readFileSync(path, "utf8"));
    if (match?.groups) dates.add(match.groups.date);
  }
  return dates.size === 1 ? [...dates][0] : undefined;
}

function empty(): DriftDetection {
  return { repairs: [], blockers: [], evidence: [] };
}
