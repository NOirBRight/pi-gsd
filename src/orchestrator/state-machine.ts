import { isSourceWritingUnit, releaseLeaseOwnership, type WorktreeSafetyDeps } from "../worktree-safety/index.js";
import { runPostDispatchGate, runPreDispatchGates, type GateOverrides } from "./gates.js";
import type { AdvanceResult, DispatchAdapter, GateAdapter, GateResult, OrchestrationEvent, OrchestrationMode, OrchestrationSnapshot, OrchestrationUnit, OrchestratorResult, OrchestratorStatus, ResolvedWorkflowSettings } from "./types.js";

const PLAN_CHECK_REVISION_CAP = 3;

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
  worktreeSafetyDeps?: Partial<WorktreeSafetyDeps>;
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
  const unitStarted = eventOf(snapshot, unit, "unit_started", "running", options.now);
  const preGate = runPreDispatchGates(snapshot, unit, options.gates);
  if (!preGate.ok) return handleGateFailure(snapshot, unit, preGate, options.now);

  const dispatch = options.dispatch ?? defaultDispatch;
  const dispatchResult = dispatch(unit, snapshot);
  if (!dispatchResult.ok) {
    const releaseGate = releaseLeaseAfterUnit(snapshot, unit, preGate, options.worktreeSafetyDeps);
    if (!releaseGate.ok) {
      const releaseFailure = handleGateFailure(snapshot, unit, releaseGate, options.now);
      return { ...releaseFailure, dispatched: unit, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit, options.now), ...(releaseFailure.events ?? [])].filter((event): event is OrchestrationEvent => Boolean(event)) };
    }
    const paused = pause(snapshot, unit, "dispatch-failed", dispatchResult.messages[0] ?? "Dispatch failed; inspect adapter output.", options.now, dispatchResult.messages);
    return { ok: false, messages: dispatchResult.messages, snapshot: paused, status: getSnapshotStatus(paused), dispatched: unit, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit, options.now), ...leaseEvents(releaseGate, snapshot, unit, options.now), paused.lastEvent].filter((event): event is OrchestrationEvent => Boolean(event)) };
  }

  const postGate = options.postDispatchGate ? options.postDispatchGate(snapshot, unit) : runPostDispatchGate(snapshot, unit, { cwd: snapshot.cwd, written: dispatchResult.written, messages: dispatchResult.messages, outcome: dispatchResult.outcome });
  if (!postGate.ok) {
    const revision = handlePlanCheckIssues(snapshot, unit, postGate, unitStarted, preGate, options.now);
    if (revision) return revision;

    const releaseGate = releaseLeaseAfterUnit(snapshot, unit, preGate, options.worktreeSafetyDeps);
    const failure = handleGateFailure(snapshot, unit, postGate, options.now);
    if (!releaseGate.ok) {
      const releaseFailure = handleGateFailure(snapshot, unit, releaseGate, options.now);
      return { ...releaseFailure, dispatched: unit, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit, options.now), ...(failure.events ?? []), ...(releaseFailure.events ?? [])].filter((event): event is OrchestrationEvent => Boolean(event)) };
    }
    return { ...failure, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit, options.now), ...(failure.events ?? []), ...leaseEvents(releaseGate, snapshot, unit, options.now)] };
  }

  const releaseGate = releaseLeaseAfterUnit(snapshot, unit, preGate, options.worktreeSafetyDeps);
  if (!releaseGate.ok) {
    const releaseFailure = handleGateFailure(snapshot, unit, releaseGate, options.now);
    const gatePassed = [...evidenceOf(preGate), ...evidenceOf(postGate)].map((evidence) => ({
      type: "gate_passed" as const,
      ts: timestamp(options.now),
      phase: snapshot.phase,
      unitId: unit.id,
      status: "completed" as const,
      attempt: snapshot.attempt,
      evidence: [evidence],
    }));
    return { ...releaseFailure, dispatched: unit, events: [unitStarted, ...gatePassed, ...leaseEvents(preGate, snapshot, unit, options.now), ...leaseEvents(postGate, snapshot, unit, options.now), ...(releaseFailure.events ?? [])].filter((event): event is OrchestrationEvent => Boolean(event)) };
  }
  const [nextUnit, ...remainingUnits] = snapshot.remainingUnits;
  const status = nextUnit ? "running" : "completed";
  const advanced: OrchestrationSnapshot = withEvent({
    ...snapshot,
    status,
    currentUnit: nextUnit ? { ...nextUnit, status: "running" } : undefined,
    remainingUnits,
    attempt: 0,
    loopState: unit.type === "plan-check" ? undefined : snapshot.loopState,
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

  const gatePassed = [...evidenceOf(preGate), ...evidenceOf(postGate)].map((evidence) => ({
    type: "gate_passed" as const,
    ts: timestamp(options.now),
    phase: snapshot.phase,
    unitId: unit.id,
    status: "completed" as const,
    attempt: snapshot.attempt,
    evidence: [evidence],
  }));
  const completed = status === "completed" ? eventOf({ ...advanced, currentUnit: unit }, unit, "orchestration_completed", "completed", options.now) : undefined;

  return { ok: true, messages: dispatchResult.messages, snapshot: completed ? withEvent(advanced, completed) : advanced, status: getSnapshotStatus(completed ? withEvent(advanced, completed) : advanced), dispatched: unit, events: [unitStarted, ...gatePassed, ...leaseEvents(preGate, snapshot, unit, options.now), ...leaseEvents(postGate, snapshot, unit, options.now), ...leaseEvents(releaseGate, snapshot, unit, options.now), advanced.lastEvent, completed].filter((event): event is OrchestrationEvent => Boolean(event)) };
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

function handlePlanCheckIssues(
  snapshot: OrchestrationSnapshot,
  unit: OrchestrationUnit,
  gate: Extract<GateResult, { ok: false }>,
  unitStarted: OrchestrationEvent,
  preGate: GateResult,
  now?: () => string,
): AdvanceResult | undefined {
  if (unit.type !== "plan-check" || !hasPlanCheckIssues(gate)) return undefined;

  const currentIteration = snapshot.loopState?.planCheckIterations ?? 1;
  if (currentIteration >= PLAN_CHECK_REVISION_CAP) {
    const resumeHint = "Plan checker reached maximum iterations. Provide guidance and retry, force proceed, or abandon.";
    const paused = pause(snapshot, unit, "plan-check-iteration-cap", resumeHint, now, gate.evidence, gate.recoveryDecision);
    const gateFailed: OrchestrationEvent = {
      type: "gate_failed",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit.id,
      status: "failed",
      attempt: snapshot.attempt,
      reason: "plan-check-iteration-cap",
      resumeHint,
      evidence: gate.evidence,
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision?.class,
      action: gate.recoveryDecision?.action,
    };
    return {
      ok: false,
      messages: [resumeHint],
      snapshot: paused,
      status: getSnapshotStatus(paused),
      dispatched: unit,
      events: [unitStarted, gateFailed, paused.lastEvent, ...leaseEvents(preGate, snapshot, unit, now)].filter((event): event is OrchestrationEvent => Boolean(event)),
    };
  }

  const revisionNumber = currentIteration;
  const revisionUnit: OrchestrationUnit = {
    id: `${snapshot.phase}:plan:revision-${revisionNumber}`,
    type: "plan",
    status: "running",
    phase: snapshot.phase,
    label: "Plan Revision",
    required: true,
    source: unit.source,
    metadata: { args: "--auto --revision", revision: revisionNumber },
  };
  const recheckUnit: OrchestrationUnit = { ...unit, status: "pending" };
  const scheduled = withEvent({
    ...snapshot,
    status: "running",
    currentUnit: revisionUnit,
    remainingUnits: [recheckUnit, ...snapshot.remainingUnits],
    attempt: 0,
    loopState: {
      ...snapshot.loopState,
      planCheckIterations: currentIteration + 1,
    },
    resumeHint: undefined,
  }, {
    type: "retry_scheduled",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: revisionUnit.id,
    status: "running",
    attempt: 0,
    reason: "plan-check-issues-found",
    resumeHint: `Plan checker found issues; scheduled revision ${revisionNumber}/${PLAN_CHECK_REVISION_CAP}.`,
    evidence: gate.evidence,
  });

  return {
    ok: true,
    messages: [`plan revision scheduled: ${revisionNumber}`],
    snapshot: scheduled,
    status: getSnapshotStatus(scheduled),
    dispatched: unit,
    events: [unitStarted, scheduled.lastEvent, ...leaseEvents(preGate, snapshot, unit, now)].filter((event): event is OrchestrationEvent => Boolean(event)),
  };
}

function hasPlanCheckIssues(gate: Extract<GateResult, { ok: false }>) {
  return (gate.evidence ?? []).some((item) => {
    const normalized = item.toLowerCase();
    return normalized === "marker:issues_found"
      || normalized === "status:issues_found"
      || normalized === "field:status:issues_found";
  });
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
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision?.class,
      action: gate.recoveryDecision?.action,
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
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision?.class,
      action: gate.recoveryDecision?.action,
    };
    return { ok: true, messages: [`retry scheduled: ${gate.reason}`], snapshot: retrying, status: getSnapshotStatus(retrying), events: [gateFailed, retrying.lastEvent, ...leaseEvents(gate, snapshot, unit, now)].filter((event): event is OrchestrationEvent => Boolean(event)) };
  }

  const reason = gate.retryable ? "retry-budget-exhausted" : gate.reason;
  if (gate.recoveryDecision?.action === "stop") {
    const stopped = stopFromGate(snapshot, unit, String(reason), gate.resumeHint, now, gate.evidence, gate.recoveryDecision);
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
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision.class,
      action: gate.recoveryDecision.action,
    };
    return { ok: false, messages: [gate.resumeHint], snapshot: stopped, status: getSnapshotStatus(stopped), events: [gateFailed, stopped.lastEvent, ...leaseEvents(gate, snapshot, unit, now)].filter((event): event is OrchestrationEvent => Boolean(event)) };
  }
  const paused = pause(snapshot, unit, String(reason), gate.resumeHint, now, gate.evidence, gate.recoveryDecision);
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
    recoveryDecision: gate.recoveryDecision,
    exitReason: gate.recoveryDecision?.class,
    action: gate.recoveryDecision?.action,
  };
  return { ok: false, messages: [gate.resumeHint], snapshot: paused, status: getSnapshotStatus(paused), events: [gateFailed, paused.lastEvent, ...leaseEvents(gate, snapshot, unit, now)].filter((event): event is OrchestrationEvent => Boolean(event)) };
}

function pause(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, reason: string, resumeHint: string, now?: () => string, evidence?: string[], recoveryDecision?: Extract<GateResult, { ok: false }>["recoveryDecision"]): OrchestrationSnapshot {
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
    recoveryDecision,
    exitReason: recoveryDecision?.class,
    action: recoveryDecision?.action,
  });
}

function stopFromGate(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, reason: string, resumeHint: string, now?: () => string, evidence?: string[], recoveryDecision?: Extract<GateResult, { ok: false }>["recoveryDecision"]): OrchestrationSnapshot {
  return withEvent({ ...snapshot, status: "stopped", resumeHint }, {
    type: "stop",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit.id,
    status: "stopped",
    attempt: snapshot.attempt,
    reason,
    resumeHint,
    evidence,
    recoveryDecision,
    exitReason: recoveryDecision?.class,
    action: recoveryDecision?.action,
  });
}

function releaseLeaseAfterUnit(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, ownershipGate: GateResult, worktreeSafetyDeps?: Partial<WorktreeSafetyDeps>): GateResult {
  if (!isSourceWritingUnit(unit.type) || snapshot.settings.workflow.worktrees === false || !snapshot.cwd) {
    return { ok: true, gate: "prepareUnitRoot", evidence: [] };
  }

  const acquired = ownershipGate.journalEvents?.find((event) => event.type === "lease_acquired" || event.type === "lease_stale_reclaimed");
  const branch = acquired?.branch ?? branchFromGateEvidence(ownershipGate) ?? (typeof unit.metadata?.expectedBranch === "string" ? unit.metadata.expectedBranch : undefined);
  const result = releaseLeaseOwnership({
    unitType: unit.type,
    unitId: unit.id,
    phase: unit.phase,
    projectRoot: snapshot.cwd,
    unitRoot: snapshot.cwd,
    expectedBranch: branch,
    workflow: { worktrees: snapshot.settings.workflow.worktrees },
    attempt: snapshot.attempt,
    deps: worktreeSafetyDeps,
  }, snapshot.cwd, branch);

  if (result.ok) {
    return { ok: true, gate: "prepareUnitRoot", evidence: ["lease released"], journalEvents: result.journalEvents };
  }

  return {
    ok: false,
    gate: "prepareUnitRoot",
    reason: result.decision.class,
    retryable: false,
    resumeHint: result.decision.remediation,
    evidence: evidenceFromRecoveryDecision(result.decision),
    recoveryDecision: result.decision,
    exitReason: result.decision.class,
  };
}

function branchFromGateEvidence(gate: GateResult): string | undefined {
  return gate.evidence?.find((item) => item.startsWith("branch:"))?.slice("branch:".length);
}

function evidenceFromRecoveryDecision(decision: NonNullable<Extract<GateResult, { ok: false }>["recoveryDecision"]>): string[] {
  const evidence = decision.evidence ?? {};
  return [
    `class:${decision.class}`,
    `action:${decision.action}`,
    evidence.reasonCode ? `reasonCode:${String(evidence.reasonCode)}` : undefined,
    evidence.unitId ? `unitId:${evidence.unitId}` : undefined,
    evidence.root ? `root:${evidence.root}` : undefined,
    evidence.branch ? `branch:${evidence.branch}` : undefined,
    ...(Array.isArray(evidence.messages) ? evidence.messages : []),
  ].filter((item): item is string => Boolean(item));
}

function leaseEvents(gate: GateResult, snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, now?: () => string): OrchestrationEvent[] {
  return (gate.journalEvents ?? []).map((event) => ({
    type: event.type as OrchestrationEvent["type"],
    ts: event.ts ?? timestamp(now),
    phase: event.phase ?? snapshot.phase,
    unitId: event.unitId ?? unit.id,
    status: "running" as const,
    attempt: event.attempt ?? snapshot.attempt,
    reason: event.reasonCode,
    action: event.action,
    recoveryClass: event.recoveryClass as OrchestrationEvent["recoveryClass"],
    root: event.root,
    branch: event.branch,
    paths: event.paths,
    written: event.written,
    message: event.message,
  }));
}

function eventOf(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, type: OrchestrationEvent["type"], status: OrchestrationEvent["status"], now?: () => string): OrchestrationEvent {
  return { type, ts: timestamp(now), phase: snapshot.phase, unitId: unit.id, status, attempt: snapshot.attempt };
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
