export const RECONCILIATION_REASON_CODES = [
  "sketch-flag-drift",
  "completion-timestamp-drift",
  "roadmap-divergence",
  "stale-worker",
  "unregistered-milestone",
  "summary-count-mismatch",
  "noncanonical-plan-like-file",
  "unknown-drift",
  "partial-write",
] as const;

export type ReconciliationReasonCode = (typeof RECONCILIATION_REASON_CODES)[number];

export type CanonicalArtifactKind = "plan" | "summary" | "verification" | "review" | "context";

export type ReconciliationOptions = {
  apply?: boolean;
  phase?: string;
  now?: () => string;
  fileSystem?: ReconciliationFileSystem;
};

export type ReconciliationFileSystem = {
  exists(path: string): boolean;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
};

export type ReconciliationEvidence = {
  reasonCode: ReconciliationReasonCode;
  path?: string;
  paths?: string[];
  phase?: string;
  plan?: string;
  artifact?: CanonicalArtifactKind | "roadmap" | "state" | "journal" | "noncanonical";
  message: string;
  metadata?: Record<string, string | number | boolean>;
};

export type ReconciliationRepair = {
  kind?: "roadmap" | "state" | "journal";
  reasonCode: ReconciliationReasonCode;
  action: string;
  description: string;
  path?: string;
  before?: string;
  after?: string;
  phase?: string;
  plan?: string;
  evidence: ReconciliationEvidence[];
};

export type ReconciliationWrite = {
  kind?: "roadmap" | "state" | "journal";
  reasonCode: ReconciliationReasonCode;
  path: string;
  action: "create" | "update" | "delete";
};

export type ReconciliationBlocker = {
  reasonCode: ReconciliationReasonCode;
  message: string;
  evidence: ReconciliationEvidence[];
  phase?: string;
  artifact?: CanonicalArtifactKind | "state" | "roadmap" | "journal" | "noncanonical";
  repairPlan?: ReconciliationRepair[];
  written?: ReconciliationWrite[];
  suggestedNextAction?: "manual-review" | "rerun-reconcile" | "requires-recovery-classification";
};

export type CanonicalPhaseArtifacts = {
  phase: string;
  directory: string;
  plans: string[];
  summaries: string[];
  verifications: string[];
  reviews: string[];
  contexts: string[];
  noncanonical: ReconciliationEvidence[];
};

export type PlanningArtifactTotals = {
  plans: number;
  summaries: number;
  verifications: number;
  reviews: number;
  contexts: number;
  noncanonical: number;
};

export type PlanningArtifactScan = {
  phasesPath: string;
  phases: CanonicalPhaseArtifacts[];
  totals: PlanningArtifactTotals;
  evidence: ReconciliationEvidence[];
  blockers: ReconciliationBlocker[];
};

export type ReconciledStateSnapshot = {
  phasesPath: string;
  phases: CanonicalPhaseArtifacts[];
  totals: PlanningArtifactTotals;
};

export type ReconciliationReport = {
  ok: boolean;
  snapshot: ReconciledStateSnapshot;
  repairs: ReconciliationRepair[];
  blockers: ReconciliationBlocker[];
  written: ReconciliationWrite[];
  evidence: ReconciliationEvidence[];
};
