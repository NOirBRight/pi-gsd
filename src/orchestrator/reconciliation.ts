import type { OrchestrationSnapshot, OrchestrationUnit, ReconcileBeforeDispatchResult } from "./types.js";

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

  return { ok: true, gate: "reconcileBeforeDispatch", evidence: ["phase-9-minimal-reconciliation"] };
}
