import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyArtifactName } from "./artifacts.js";
import type { CanonicalPhaseArtifacts, PlanningArtifactScan, ReconciliationBlocker, ReconciliationEvidence } from "./types.js";

export function scanPlanningArtifacts(basePath: string): PlanningArtifactScan {
  const phasesPath = join(basePath, ".planning", "phases");
  if (!existsSync(phasesPath)) {
    const blocker: ReconciliationBlocker = {
      reasonCode: "unknown-drift",
      artifact: "state",
      message: `Missing .planning/phases directory at ${phasesPath}`,
      evidence: [],
      suggestedNextAction: "manual-review",
    };
    return { phasesPath, phases: [], totals: emptyTotals(), evidence: [], blockers: [blocker] };
  }

  const phases = new Map<string, CanonicalPhaseArtifacts>();
  const evidence: ReconciliationEvidence[] = [];
  const blockers: ReconciliationBlocker[] = [];

  for (const entry of readdirSync(phasesPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const phaseDir = join(phasesPath, entry.name);

    for (const file of readdirSync(phaseDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isFile()) continue;
      const path = join(phaseDir, file.name);
      if (!statSync(path).isFile()) continue;

      const classification = classifyArtifactName(file.name);
      if (classification.canonical) {
        const phase = getOrCreatePhase(phases, classification.phase, phaseDir);
        if (classification.kind === "plan") phase.plans.push(path);
        if (classification.kind === "summary") phase.summaries.push(path);
        if (classification.kind === "verification") phase.verifications.push(path);
        if (classification.kind === "review") phase.reviews.push(path);
        if (classification.kind === "context") phase.contexts.push(path);
        continue;
      }

      if (classification.reasonCode === "noncanonical-plan-like-file" && classification.evidence) {
        const item = { ...classification.evidence, path };
        evidence.push(item);
        if (classification.phase) getOrCreatePhase(phases, classification.phase, phaseDir).noncanonical.push(item);
      }
    }
  }

  const phaseList = [...phases.values()].sort((a, b) => a.phase.localeCompare(b.phase));
  return {
    phasesPath,
    phases: phaseList,
    totals: {
      plans: sum(phaseList, "plans"),
      summaries: sum(phaseList, "summaries"),
      verifications: sum(phaseList, "verifications"),
      reviews: sum(phaseList, "reviews"),
      contexts: sum(phaseList, "contexts"),
      noncanonical: sum(phaseList, "noncanonical"),
    },
    evidence,
    blockers,
  };
}

function getOrCreatePhase(phases: Map<string, CanonicalPhaseArtifacts>, phase: string, directory: string): CanonicalPhaseArtifacts {
  const existing = phases.get(phase);
  if (existing) return existing;

  const created: CanonicalPhaseArtifacts = {
    phase,
    directory,
    plans: [],
    summaries: [],
    verifications: [],
    reviews: [],
    contexts: [],
    noncanonical: [],
  };
  phases.set(phase, created);
  return created;
}

function emptyTotals() {
  return { plans: 0, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 };
}

function sum(phases: CanonicalPhaseArtifacts[], key: keyof Pick<CanonicalPhaseArtifacts, "plans" | "summaries" | "verifications" | "reviews" | "contexts" | "noncanonical">): number {
  return phases.reduce((total, phase) => total + phase[key].length, 0);
}
