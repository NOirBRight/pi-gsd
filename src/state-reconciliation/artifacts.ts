import type { CanonicalArtifactKind, ReconciliationEvidence, ReconciliationReasonCode } from "./types.js";

export type CanonicalArtifactClassification = {
  canonical: true;
  filename: string;
  kind: CanonicalArtifactKind;
  phase: string;
  plan?: string;
};

export type NoncanonicalArtifactClassification = {
  canonical: false;
  filename: string;
  kind: "noncanonical" | "ignored";
  phase?: string;
  reasonCode?: ReconciliationReasonCode;
  evidence?: ReconciliationEvidence;
};

export type ArtifactClassification = CanonicalArtifactClassification | NoncanonicalArtifactClassification;

const PLAN_ARTIFACT = /^(?<phase>\d{2})-(?<plan>\d{2})-PLAN\.md$/;
const SUMMARY_ARTIFACT = /^(?<phase>\d{2})-(?<plan>\d{2})-SUMMARY\.md$/;
const PHASE_ARTIFACTS: Array<[RegExp, CanonicalArtifactKind]> = [
  [/^(?<phase>\d{2})-VERIFICATION\.md$/, "verification"],
  [/^(?<phase>\d{2})-REVIEW\.md$/, "review"],
  [/^(?<phase>\d{2})-CONTEXT\.md$/, "context"],
];
const PLAN_LIKE_MARKDOWN = /^(?<phase>\d{2})-.*PLAN.*\.md$/;

export function classifyArtifactName(filename: string): ArtifactClassification {
  const plan = PLAN_ARTIFACT.exec(filename);
  if (plan?.groups) return canonical(filename, "plan", plan.groups.phase, plan.groups.plan);

  const summary = SUMMARY_ARTIFACT.exec(filename);
  if (summary?.groups) return canonical(filename, "summary", summary.groups.phase, summary.groups.plan);

  for (const [pattern, kind] of PHASE_ARTIFACTS) {
    const match = pattern.exec(filename);
    if (match?.groups) return canonical(filename, kind, match.groups.phase);
  }

  const planLike = PLAN_LIKE_MARKDOWN.exec(filename);
  if (planLike?.groups) {
    return {
      canonical: false,
      filename,
      kind: "noncanonical",
      phase: planLike.groups.phase,
      reasonCode: "noncanonical-plan-like-file",
      evidence: {
        reasonCode: "noncanonical-plan-like-file",
        phase: planLike.groups.phase,
        artifact: "noncanonical",
        message: "Plan-like markdown does not match canonical NN-YY-PLAN.md naming.",
      },
    };
  }

  return { canonical: false, filename, kind: "ignored" };
}

function canonical(filename: string, kind: CanonicalArtifactKind, phase: string, plan?: string): CanonicalArtifactClassification {
  return { canonical: true, filename, kind, phase, ...(plan ? { plan } : {}) };
}
