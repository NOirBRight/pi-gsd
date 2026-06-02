import type { DriftDetection, DriftDetectionInput } from "../catalog.js";
import type { ReconciliationEvidence } from "../types.js";

export function detectUnregisteredMilestone(input: DriftDetectionInput): DriftDetection {
  const state = input.state;
  const milestone = state?.frontmatter.milestone;
  if (!state || typeof milestone !== "string" || !input.roadmap) return empty();

  const knownMilestones = new Set(input.roadmap.phases.map((phase) => phase.milestone));
  if (knownMilestones.has(milestone)) return empty();

  const evidence: ReconciliationEvidence[] = [
    {
      reasonCode: "unregistered-milestone",
      path: state.path,
      message: `STATE references milestone ${milestone}.`,
      metadata: { milestone },
    },
    {
      reasonCode: "unregistered-milestone",
      path: input.roadmap.path,
      message: `ROADMAP progress table does not register milestone ${milestone}.`,
      metadata: { milestone },
    },
  ];

  return {
    repairs: [],
    blockers: [{
      reasonCode: "unregistered-milestone",
      artifact: "roadmap",
      message: `Milestone ${milestone} is not registered in ROADMAP metadata; Phase 10 must not synthesize milestone prose.`,
      evidence,
      suggestedNextAction: "manual-review",
    }],
    evidence: [],
  };
}

function empty(): DriftDetection {
  return { repairs: [], blockers: [], evidence: [] };
}
