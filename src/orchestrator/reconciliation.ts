import { relative } from "node:path";
import {
  ReconciliationFailedError,
  reconcileBeforeDispatch as reconcilePlanningStateBeforeDispatch,
} from "../state-reconciliation/index.js";
import type { ReconciliationEvidence, ReconciliationReport } from "../state-reconciliation/types.js";
import type { GateResult, OrchestrationSnapshot, OrchestrationUnit, ReconcileBeforeDispatchResult } from "./types.js";

const maxEvidenceItems = 20;
const maxEvidenceLength = 240;

export function reconcileBeforeDispatch(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): ReconcileBeforeDispatchResult {
  if (snapshot.status !== "running") {
    return {
      ok: false,
      gate: "reconcileBeforeDispatch",
      reason: "ambiguous-dispatch",
      retryable: false,
      resumeHint: "Resume or start orchestration before dispatching the next Unit.",
      evidence: [`status:${snapshot.status}`],
    };
  }

  if (snapshot.currentUnit?.id !== unit.id) {
    return {
      ok: false,
      gate: "reconcileBeforeDispatch",
      reason: "ambiguous-dispatch",
      retryable: false,
      resumeHint: "Current Unit does not match the dispatch target; inspect orchestration state before continuing.",
      evidence: [`current:${snapshot.currentUnit?.id ?? "none"}`, `target:${unit.id}`],
    };
  }

  const basePath = snapshot.cwd ?? process.cwd();
  const report = reconcilePlanningStateBeforeDispatch(basePath);
  if (!report.ok) return toGateFailure(toReconciliationFailedError(report), basePath);

  return {
    ok: true,
    gate: "reconcileBeforeDispatch",
    evidence: [
      "native-state-reconciliation",
      `repairs:${report.repairs.length}`,
      `written:${report.written.length}`,
    ],
  };
}

export function toReconciliationFailedError(report: ReconciliationReport): ReconciliationFailedError {
  return new ReconciliationFailedError(report);
}

export function toGateFailure(error: ReconciliationFailedError, basePath = process.cwd()): GateResult {
  return {
    ok: false,
    gate: "reconcileBeforeDispatch",
    reason: error.reasonCode,
    retryable: false,
    resumeHint: `State reconciliation blocked dispatch: ${error.reasonCode}. Inspect structured blockers before continuing.`,
    evidence: boundedGateEvidence(error, basePath),
  };
}

function boundedGateEvidence(error: ReconciliationFailedError, basePath: string): string[] {
  const values = [
    `reason:${error.reasonCode}`,
    `suggestedNextAction:${error.suggestedNextAction}`,
    ...error.blockers.flatMap((blocker) => [
      `blocker:${blocker.reasonCode}`,
      ...blocker.evidence.flatMap((evidence) => evidenceToStrings(evidence, basePath)),
    ]),
  ];
  return [...new Set(values.map(truncateEvidence))].slice(0, maxEvidenceItems);
}

function evidenceToStrings(evidence: ReconciliationEvidence, basePath: string): string[] {
  const values = [`evidence:${evidence.reasonCode}`];
  if (evidence.path) values.push(`path:${safeRelativePath(basePath, evidence.path)}`);
  for (const path of evidence.paths ?? []) values.push(`path:${safeRelativePath(basePath, path)}`);
  if (evidence.phase) values.push(`phase:${evidence.phase}`);
  if (evidence.plan) values.push(`plan:${evidence.plan}`);
  return values;
}

function safeRelativePath(basePath: string, path: string): string {
  const rel = relative(basePath, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function truncateEvidence(value: string): string {
  return value.length <= maxEvidenceLength ? value : `${value.slice(0, maxEvidenceLength)}...`;
}
