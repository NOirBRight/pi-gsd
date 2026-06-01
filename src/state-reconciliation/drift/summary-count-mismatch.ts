import { basename } from "node:path";
import type { DriftDetection, DriftDetectionInput } from "../catalog.js";
import type { ReconciliationBlocker, ReconciliationEvidence } from "../types.js";

export function detectSummaryCountMismatch(input: DriftDetectionInput): DriftDetection {
  const blockers: ReconciliationBlocker[] = [];

  for (const phase of input.snapshot.phases) {
    const summaries = new Set(phase.summaries.map((path) => artifactPlan(path, "SUMMARY")));
    const missing = phase.plans
      .map((path) => ({ path, plan: artifactPlan(path, "PLAN") }))
      .filter((plan) => plan.plan && !summaries.has(plan.plan));

    if (missing.length === 0) continue;

    const evidence: ReconciliationEvidence[] = missing.map(({ path, plan }) => ({
      reasonCode: "summary-count-mismatch",
      path,
      phase: phase.phase,
      plan,
      artifact: "summary",
      message: `Canonical plan ${basename(path)} has no matching ${phase.phase}-${plan}-SUMMARY.md artifact.`,
    }));

    blockers.push({
      reasonCode: "summary-count-mismatch",
      phase: phase.phase,
      artifact: "summary",
      message: `Phase ${phase.phase} is missing canonical summary artifacts: ${missing.map(({ plan }) => `${phase.phase}-${plan}-SUMMARY.md`).join(", ")}.`,
      evidence,
      suggestedNextAction: "manual-review",
    });
  }

  return { repairs: [], blockers, evidence: [] };
}

function artifactPlan(path: string, suffix: "PLAN" | "SUMMARY"): string | undefined {
  const pattern = new RegExp(`^\\d{2}-(\\d{2})-${suffix}\\.md$`);
  return pattern.exec(basename(path))?.[1];
}
