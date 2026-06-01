import type { DriftDetection, DriftDetectionInput } from "../catalog.js";
import type { ReconciliationBlocker, ReconciliationEvidence, ReconciliationRepair } from "../types.js";

export function detectRoadmapDivergence(input: DriftDetectionInput): DriftDetection {
  if (!input.roadmap) return empty();

  const repairs: ReconciliationRepair[] = [];
  const blockers: ReconciliationBlocker[] = [];

  for (const row of input.roadmap.phases) {
    const phase = input.snapshot.phases.find((candidate) => candidate.phase === row.phase);
    if (!phase) continue;

    const expectedComplete = phase.summaries.length;
    const expectedTotal = phase.plans.length;
    const expectedStatus = expectedTotal > 0 && expectedComplete === expectedTotal ? "Complete" : "Executing";
    const diverges = row.plansComplete !== expectedComplete || row.totalPlans !== expectedTotal || row.status !== expectedStatus;
    if (!diverges) continue;

    const evidence: ReconciliationEvidence[] = [{
      reasonCode: "roadmap-divergence",
      path: row.path,
      phase: row.phase,
      artifact: "summary",
      message: `ROADMAP row has ${row.plansComplete}/${row.totalPlans} ${row.status}; canonical artifacts show ${expectedComplete}/${expectedTotal} ${expectedStatus}.`,
      metadata: {
        line: row.line,
        plansComplete: row.plansComplete,
        totalPlans: row.totalPlans,
        canonicalPlans: expectedTotal,
        canonicalSummaries: expectedComplete,
      },
    }];

    if (expectedTotal > 0 && expectedComplete === expectedTotal) {
      repairs.push({
        reasonCode: "roadmap-divergence",
        action: "update-roadmap-row",
        phase: row.phase,
        path: row.path,
        description: `Update ROADMAP phase ${row.phase} row to ${expectedComplete}/${expectedTotal} ${expectedStatus}.`,
        evidence,
      });
      continue;
    }

    if (input.activeUnitId === `${row.phase}:execute` && expectedStatus === "Executing") {
      continue;
    }

    blockers.push({
      reasonCode: "roadmap-divergence",
      phase: row.phase,
      artifact: "roadmap",
      message: `ROADMAP phase ${row.phase} metadata cannot be mechanically proven from canonical artifacts.`,
      evidence,
      suggestedNextAction: "manual-review",
    });
  }

  return { repairs, blockers, evidence: [] };
}

function empty(): DriftDetection {
  return { repairs: [], blockers: [], evidence: [] };
}
