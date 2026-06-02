import type { ReconciliationReasonCode } from "../state-reconciliation/types.js";
import { RECOVERY_ACTIONS, type RecoveryClass, type RecoveryDecision, type RecoveryFailureInput } from "./types.js";

export const RECONCILIATION_REASON_TO_RECOVERY_CLASS = {
  "sketch-flag-drift": "repairable-state-drift",
  "completion-timestamp-drift": "repairable-state-drift",
  "roadmap-divergence": "repairable-state-drift",
  "stale-worker": "unrepaired-state-drift",
  "unregistered-milestone": "unrepaired-state-drift",
  "summary-count-mismatch": "unrepaired-state-drift",
  "noncanonical-plan-like-file": "unrepaired-state-drift",
  "unknown-drift": "unrepaired-state-drift",
  "partial-write": "internal-invariant-violation",
} as const satisfies Record<ReconciliationReasonCode, RecoveryClass>;

export function classifyFailure(input: RecoveryFailureInput): RecoveryDecision {
  switch (input.kind) {
    case "reconciliation": {
      const klass = RECONCILIATION_REASON_TO_RECOVERY_CLASS[input.reasonCode];
      const written = input.written?.length ? input.written : input.blockers?.flatMap((blocker) => blocker.written ?? []);
      return decision(klass, `State reconciliation failed: ${input.reasonCode}.`, remediationFor(klass), {
        reasonCode: input.reasonCode,
        blockers: input.blockers,
        written,
        reconciliationEvidence: input.evidence,
      });
    }
    case "artifact-gate":
      return decision("artifact-gate-failed", input.reason ?? "Artifact gate failed.", "Create or repair the required artifact before continuing.", input.evidence);
    case "dispatch":
      return decision("dispatch-contract-invalid", input.reason ?? "Dispatch contract was invalid.", "Inspect the dispatch contract and generated resources before retrying.", input.evidence);
    case "gate":
      return decision(input.retryable ? "transient-external-failure" : "dispatch-contract-invalid", input.reason ?? `Gate ${input.gate} failed.`, input.retryable ? "Retry after the transient dependency recovers." : "Inspect the gate input and dispatch contract.", input.evidence);
    case "worktree":
      return decision(input.class ?? "worktree-invalid", input.message ?? `Worktree safety check failed: ${input.reasonCode}.`, input.remediation ?? remediationFor(input.class ?? "worktree-invalid"), { ...input.evidence, reasonCode: input.reasonCode });
    case "external":
      if (input.reasonCode === "provider-network") return decision("transient-external-failure", input.message ?? "Provider or network failure.", "Retry after the external dependency recovers.", input.evidence);
      if (input.reasonCode === "missing-auth" || input.reasonCode === "user-input") return decision("user-input-required", input.message ?? "User input is required.", "Provide the missing user input or authentication, then resume.", input.evidence);
      return decision("internal-invariant-violation", input.message ?? "Unmodeled external failure shape.", remediationFor("internal-invariant-violation"), input.evidence);
  }
}

function decision(klass: RecoveryClass, message: string, remediation: string, evidence?: RecoveryDecision["evidence"]): RecoveryDecision {
  return {
    class: klass,
    action: RECOVERY_ACTIONS[klass],
    reasonCode: evidence?.reasonCode,
    message,
    remediation,
    evidence,
  };
}

function remediationFor(klass: RecoveryClass): string {
  switch (klass) {
    case "transient-external-failure": return "Retry after the transient dependency recovers.";
    case "repairable-state-drift": return "Run deterministic state reconciliation repair, then retry dispatch.";
    case "unrepaired-state-drift": return "Inspect planning state drift and remediate before resuming.";
    case "worktree-invalid": return "Repair or recreate the expected worktree/root before source-writing dispatch.";
    case "dispatch-contract-invalid": return "Fix the dispatch contract before continuing.";
    case "artifact-gate-failed": return "Create or repair the required artifact before continuing.";
    case "user-input-required": return "Provide the required user input before resuming.";
    case "internal-invariant-violation": return "Stop and inspect the invariant violation before continuing.";
  }
}
