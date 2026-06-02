import type {
  ReconciliationEvidence,
  ReconciliationFailureContext,
  ReconciliationReasonCode,
  ReconciliationRepair,
  ReconciliationReport,
  ReconciliationSuggestedNextAction,
} from "./types.js";

export class ReconciliationFailedError extends Error implements ReconciliationFailureContext {
  static readonly suggestedNextActions = [
    "manual-review",
    "rerun-reconcile",
    "requires-recovery-classification",
  ] as const satisfies readonly ReconciliationSuggestedNextAction[];

  readonly reasonCode: ReconciliationReasonCode;
  readonly blockers: ReconciliationFailureContext["blockers"];
  readonly repairPlan: ReconciliationRepair[];
  readonly evidence: ReconciliationEvidence[];
  readonly suggestedNextAction: ReconciliationSuggestedNextAction;
  readonly report: ReconciliationReport;

  constructor(report: ReconciliationReport) {
    const firstBlocker = report.blockers[0];
    const reasonCode = firstBlocker?.reasonCode ?? "unknown-drift";
    super(`State reconciliation failed: ${reasonCode}`);
    this.name = "ReconciliationFailedError";
    this.reasonCode = reasonCode;
    this.blockers = report.blockers;
    this.repairPlan = firstBlocker?.repairPlan?.length ? firstBlocker.repairPlan : report.repairs;
    this.evidence = uniqueEvidence([
      ...report.evidence,
      ...report.blockers.flatMap((blocker) => blocker.evidence),
    ]);
    this.suggestedNextAction = firstBlocker?.suggestedNextAction ?? suggestedActionFor(reasonCode);
    this.report = report;
  }
}

function uniqueEvidence(evidence: ReconciliationEvidence[]): ReconciliationEvidence[] {
  const seen = new Set<string>();
  const result: ReconciliationEvidence[] = [];
  for (const item of evidence) {
    const key = JSON.stringify({
      reasonCode: item.reasonCode,
      path: item.path,
      paths: item.paths,
      phase: item.phase,
      plan: item.plan,
      artifact: item.artifact,
      message: item.message,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function suggestedActionFor(reasonCode: ReconciliationReasonCode): ReconciliationSuggestedNextAction {
  if (reasonCode === "partial-write") return "rerun-reconcile";
  if (reasonCode === "stale-worker") return "requires-recovery-classification";
  return "manual-review";
}
