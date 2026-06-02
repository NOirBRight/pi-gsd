import type { ReconciliationBlocker, ReconciliationEvidence, ReconciliationReasonCode, ReconciliationWrite } from "../state-reconciliation/types.js";

export const RECOVERY_CLASSES = [
  "transient-external-failure",
  "repairable-state-drift",
  "unrepaired-state-drift",
  "worktree-invalid",
  "dispatch-contract-invalid",
  "artifact-gate-failed",
  "user-input-required",
  "internal-invariant-violation",
] as const;

export type RecoveryClass = (typeof RECOVERY_CLASSES)[number];

export const RECOVERY_ACTION_VALUES = ["retry", "pause-with-remediation", "self-heal", "stop"] as const;
export type RecoveryAction = (typeof RECOVERY_ACTION_VALUES)[number];

export const RECOVERY_ACTIONS = {
  "transient-external-failure": "retry",
  "repairable-state-drift": "self-heal",
  "unrepaired-state-drift": "pause-with-remediation",
  "worktree-invalid": "stop",
  "dispatch-contract-invalid": "stop",
  "artifact-gate-failed": "pause-with-remediation",
  "user-input-required": "pause-with-remediation",
  "internal-invariant-violation": "stop",
} as const satisfies Record<RecoveryClass, RecoveryAction>;

export type RecoveryDecisionEvidence = {
  reasonCode?: ReconciliationReasonCode | string;
  unitId?: string;
  unitType?: string;
  phase?: string;
  branch?: string;
  expectedBranch?: string;
  root?: string;
  expectedProjectRoot?: string;
  actualCwd?: string;
  resolvedUnitRoot?: string;
  paths?: string[];
  attempt?: number;
  written?: ReconciliationWrite[];
  messages?: string[];
  blockers?: ReconciliationBlocker[];
  reconciliationEvidence?: ReconciliationEvidence[];
  journalEvents?: object[];
  [key: string]: string | number | boolean | object | string[] | object[] | undefined;
};

export type RecoveryDecision = {
  class: RecoveryClass;
  action: RecoveryAction;
  reasonCode?: ReconciliationReasonCode | string;
  message: string;
  remediation: string;
  evidence?: RecoveryDecisionEvidence;
};

export type ReconciliationRecoveryInput = {
  kind: "reconciliation";
  reasonCode: ReconciliationReasonCode;
  blockers?: ReconciliationBlocker[];
  written?: ReconciliationWrite[];
  evidence?: ReconciliationEvidence[];
};

export type GateRecoveryInput = {
  kind: "gate";
  gate: string;
  reason?: string;
  retryable?: boolean;
  evidence?: RecoveryDecisionEvidence;
};

export type DispatchRecoveryInput = {
  kind: "dispatch";
  reason?: string;
  evidence?: RecoveryDecisionEvidence;
};

export type ArtifactGateRecoveryInput = {
  kind: "artifact-gate";
  reason?: string;
  evidence?: RecoveryDecisionEvidence;
};

export type WorktreeRecoveryInput = {
  kind: "worktree";
  reasonCode: string;
  message?: string;
  remediation?: string;
  evidence?: RecoveryDecisionEvidence;
  class?: RecoveryClass;
};

export type ExternalRecoveryInput = {
  kind: "external";
  reasonCode: "provider-network" | "missing-auth" | "user-input" | "internal" | string;
  message?: string;
  evidence?: RecoveryDecisionEvidence;
};

export type RecoveryFailureKind = RecoveryFailureInput["kind"];

export type RecoveryFailureInput =
  | ReconciliationRecoveryInput
  | GateRecoveryInput
  | DispatchRecoveryInput
  | ArtifactGateRecoveryInput
  | WorktreeRecoveryInput
  | ExternalRecoveryInput;
