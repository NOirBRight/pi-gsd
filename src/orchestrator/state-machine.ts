import { runPostDispatchGate, runPreDispatchGates, type GateOverrides } from "./gates.js";
import type { AdvanceResult, DispatchAdapter, GateAdapter, GateResult, OrchestrationEvent, OrchestrationMode, OrchestrationSnapshot, OrchestrationUnit, OrchestratorResult, OrchestratorStatus, ResolvedWorkflowSettings } from "./types.js";

export type StartInput = {
  phase: string;
  mode: OrchestrationMode;
  settings: ResolvedWorkflowSettings;
  units: OrchestrationUnit[];
  now?: () => string;
  cwd?: string;
};

export type AdvanceOptions = {
  gates?: GateOverrides;
  dispatch?: DispatchAdapter;
  postDispatchGate?: GateAdapter;
  now?: () => string;
};

export function startOrchestration(input: StartInput): OrchestrationSnapshot {
  const [currentUnit, ...remainingUnits] = input.units;
  const snapshot: OrchestrationSnapshot = {
    version: 1,
    phase: input.phase,
    mode: input.mode,
    status: currentUnit ? "running" : "completed",
    currentUnit: currentUnit ? { ...currentUnit, status: "running" } : undefined,
    remainingUnits,
    attempt: 0,
    settings: input.settings,
    cwd: input.cwd,
  };
  return withEvent(snapshot, {
    type: "orchestration_started",
    ts: timestamp(input.now),
    phase: input.phase,
    unitId: currentUnit?.id,
    status: snapshot.status === "running" ? "running" : "completed",
    attempt: 0,
    evidence: [`units:${input.units.length}`],
  });
}

export function advanceOrchestration(snapshot: OrchestrationSnapshot, options: AdvanceOptions = {}): AdvanceResult {
  if (!snapshot.currentUnit) {
    const completed = { ...snapshot, status: "completed" as const };
    return { ok: true, messages: ["orchestration complete"], snapshot: completed, status: getSnapshotStatus(completed) };
  }

  const unit = snapshot.currentUnit;
  const preGate = runPreDispatchGates(snapshot, unit, options.gates);
  if (!preGate.ok) return handleGateFailure(snapshot, unit, preGate, options.now);

  const dispatch = options.dispatch ?? defaultDispatch;
  const dispatchResult = dispatch(unit, snapshot);
  if (!dispatchResult.ok) {
    const paused = pause(snapshot, unit, "dispatch-failed", dispatchResult.messages[0] ?? "Dispatch failed; inspect adapter output.", options.now, dispatchResult.messages);
    return { ok: false, messages: dispatchResult.messages, snapshot: paused, status: getSnapshotStatus(paused), dispatched: unit };
  }

  const postGate = options.postDispatchGate ? options.postDispatchGate(snapshot, unit) : runPostDispatchGate(snapshot, unit, { cwd: snapshot.cwd });
  if (!postGate.ok) return handleGateFailure(snapshot, unit, postGate, options.now);

  const [nextUnit, ...remainingUnits] = snapshot.remainingUnits;
  const status = nextUnit ? "running" : "completed";
  const advanced: OrchestrationSnapshot = withEvent({
    ...snapshot,
    status,
    currentUnit: nextUnit ? { ...nextUnit, status: "running" } : undefined,
    remainingUnits,
    attempt: 0,
    resumeHint: undefined,
  }, {
    type: "unit_ended",
    ts: timestamp(options.now),
    phase: snapshot.phase,
    unitId: unit.id,
    status: "completed",
    attempt: snapshot.attempt,
    evidence: [...evidenceOf(preGate), ...evidenceOf(postGate)],
  });

  const gatePassed: OrchestrationEvent = {
    type: "gate_passed",
    ts: timestamp(options.now),
    phase: snapshot.phase,
    unitId: unit.id,
    status: "completed",
    attempt: snapshot.attempt,
    evidence: [...evidenceOf(preGate), ...evidenceOf(postGate)],
  };

  return { ok: true, messages: dispatchResult.messages, snapshot: advanced, status: getSnapshotStatus(advanced), dispatched: unit, events: [gatePassed, advanced.lastEvent].filter((event): event is OrchestrationEvent => Boolean(event)) };
}

export function resumeOrchestration(snapshot: OrchestrationSnapshot, now?: () => string): OrchestratorResult {
  const resumed = withEvent({ ...snapshot, status: "running", resumeHint: undefined }, {
    type: "resume",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: snapshot.currentUnit?.id,
    status: "running",
    attempt: snapshot.attempt,
  });
  return { ok: true, messages: ["orchestration resumed"], snapshot: resumed, status: getSnapshotStatus(resumed) };
}

export function stopOrchestration(snapshot: OrchestrationSnapshot, reason = "stopped", now?: () => string): OrchestratorResult {
  const stopped = withEvent({ ...snapshot, status: "stopped", resumeHint: reason }, {
    type: "stop",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: snapshot.currentUnit?.id,
    status: "stopped",
    attempt: snapshot.attempt,
    reason,
  });
  return { ok: true, messages: [`orchestration stopped: ${reason}`], snapshot: stopped, status: getSnapshotStatus(stopped) };
}

export function getSnapshotStatus(snapshot: OrchestrationSnapshot): OrchestratorStatus {
  return {
    status: snapshot.status,
    currentUnit: snapshot.currentUnit,
    remainingUnits: snapshot.remainingUnits,
    attempt: snapshot.attempt,
    lastEvent: snapshot.lastEvent,
    resumeHint: snapshot.resumeHint,
  };
}

function handleGateFailure(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, gate: Extract<GateResult, { ok: false }>, now?: () => string): AdvanceResult {
  if (gate.retryable && snapshot.settings.workflow.node_repair && snapshot.attempt < snapshot.settings.workflow.node_repair_budget) {
    const retrying = withEvent({ ...snapshot, attempt: snapshot.attempt + 1 }, {
      type: "retry_scheduled",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit.id,
      status: "running",
      attempt: snapshot.attempt + 1,
      reason: gate.reason,
      resumeHint: gate.resumeHint,
      evidence: gate.evidence,
    });
    const gateFailed: OrchestrationEvent = {
      type: "gate_failed",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit.id,
      status: "failed",
      attempt: snapshot.attempt,
      reason: gate.reason,
      resumeHint: gate.resumeHint,
      evidence: gate.evidence,
    };
    return { ok: true, messages: [`retry scheduled: ${gate.reason}`], snapshot: retrying, status: getSnapshotStatus(retrying), events: [gateFailed, retrying.lastEvent].filter((event): event is OrchestrationEvent => Boolean(event)) };
  }

  const reason = gate.retryable ? "retry-budget-exhausted" : gate.reason;
  const paused = pause(snapshot, unit, reason, gate.resumeHint, now, gate.evidence);
  const gateFailed: OrchestrationEvent = {
    type: "gate_failed",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit.id,
    status: "failed",
    attempt: snapshot.attempt,
    reason,
    resumeHint: gate.resumeHint,
    evidence: gate.evidence,
  };
  return { ok: false, messages: [gate.resumeHint], snapshot: paused, status: getSnapshotStatus(paused), events: [gateFailed, paused.lastEvent].filter((event): event is OrchestrationEvent => Boolean(event)) };
}

function pause(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, reason: string, resumeHint: string, now?: () => string, evidence?: string[]): OrchestrationSnapshot {
  return withEvent({ ...snapshot, status: "paused", resumeHint }, {
    type: "pause",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit.id,
    status: "paused",
    attempt: snapshot.attempt,
    reason,
    resumeHint,
    evidence,
  });
}

function withEvent(snapshot: OrchestrationSnapshot, event: OrchestrationEvent): OrchestrationSnapshot {
  return { ...snapshot, lastEvent: event };
}

function timestamp(now?: () => string) {
  return now ? now() : new Date().toISOString();
}

function evidenceOf(result: GateResult) {
  return result.evidence ?? [];
}

function defaultDispatch(unit: OrchestrationUnit): OrchestratorResult {
  return { ok: true, messages: [`dispatch seam accepted ${unit.type}`] };
}
