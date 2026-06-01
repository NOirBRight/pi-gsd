import { buildUnitQueue, inferPhaseSignals, resolveWorkflowSettings } from "./settings.js";
import { advanceOrchestration, getSnapshotStatus, resumeOrchestration, startOrchestration, stopOrchestration, type AdvanceOptions } from "./state-machine.js";
import type { AutoOrchestrator, DispatchAdapter, OrchestrationEvent, OrchestrationSnapshot, OrchestratorResult, OrchestratorSessionContext, OrchestratorStatus, QueueBuildInput, QueueBuildResult, ResolvedWorkflowSettings, StateDigestAdapter, JournalAdapter } from "./types.js";

export type AutoOrchestratorDependencies = {
  settingsResolver?: (context: OrchestratorSessionContext) => ResolvedWorkflowSettings;
  queueBuilder?: (input: QueueBuildInput) => QueueBuildResult;
  phaseSignalResolver?: (context: OrchestratorSessionContext) => QueueBuildInput["phaseSignals"];
  dispatch?: DispatchAdapter;
  journal?: JournalAdapter;
  stateDigest?: StateDigestAdapter;
  gates?: AdvanceOptions["gates"];
  clock?: () => string;
};

export function createAutoOrchestrator(deps: AutoOrchestratorDependencies = {}): AutoOrchestrator {
  let snapshot: OrchestrationSnapshot | undefined;

  return {
    start(sessionContext) {
      const settings = (deps.settingsResolver ?? defaultSettingsResolver)(sessionContext);
      const phaseSignals = (deps.phaseSignalResolver ?? defaultPhaseSignalResolver)(sessionContext);
      const queue = (deps.queueBuilder ?? buildUnitQueue)({
        mode: sessionContext.mode,
        phase: sessionContext.phase,
        cwd: sessionContext.cwd,
        configPath: sessionContext.configPath,
        startAt: sessionContext.startAt,
        settings,
        phaseSignals,
      });

      if (queue.decision === "pause_for_user") {
        snapshot = startOrchestration({ phase: sessionContext.phase, mode: sessionContext.mode, settings: queue.settings, units: queue.units, now: deps.clock, cwd: sessionContext.cwd });
        const started = snapshot.lastEvent;
        snapshot = withLastEvent({ ...snapshot, status: "paused", resumeHint: queue.resumeHint }, settingsResolvedEvent(snapshot, deps.clock));
        return record({ ok: false, messages: [queue.resumeHint ?? "orchestration paused for user"], snapshot, status: getSnapshotStatus(snapshot), events: [started, snapshot.lastEvent].filter((event): event is OrchestrationEvent => Boolean(event)) }, snapshot, deps);
      }

      snapshot = startOrchestration({ phase: sessionContext.phase, mode: sessionContext.mode, settings: queue.settings, units: queue.units, now: deps.clock, cwd: sessionContext.cwd });
      const started = snapshot.lastEvent;
      snapshot = withLastEvent(snapshot, settingsResolvedEvent(snapshot, deps.clock));
      return record({ ok: true, messages: ["orchestration started"], snapshot, status: getSnapshotStatus(snapshot), events: [started, snapshot.lastEvent].filter((event): event is OrchestrationEvent => Boolean(event)) }, snapshot, deps);
    },

    advance() {
      if (!snapshot) return { ok: false, messages: ["orchestration has not started"], status: emptyStatus() };
      const result = advanceOrchestration(snapshot, { dispatch: deps.dispatch, gates: deps.gates, now: deps.clock });
      if (result.snapshot) snapshot = result.snapshot;
      return record(result, snapshot, deps);
    },

    resume() {
      if (!snapshot && deps.journal?.read) {
        const read = deps.journal.read();
        if (!read.ok || !read.journal) return { ok: false, messages: read.messages, status: emptyStatus() };
        snapshot = read.journal.snapshot;
      }
      if (!snapshot) return { ok: false, messages: ["orchestration has not started"], status: emptyStatus() };
      if (snapshot.status === "completed" || snapshot.status === "stopped") {
        return { ok: false, messages: [`cannot resume ${snapshot.status} orchestration`], snapshot, status: getSnapshotStatus(snapshot) };
      }
      const result = resumeOrchestration(snapshot, deps.clock);
      if (result.snapshot) snapshot = result.snapshot;
      return record(result, snapshot, deps);
    },

    stop(reason) {
      if (!snapshot) return { ok: false, messages: ["orchestration has not started"], status: emptyStatus() };
      const result = stopOrchestration(snapshot, reason, deps.clock);
      if (result.snapshot) snapshot = result.snapshot;
      return record(result, snapshot, deps);
    },

    getStatus() {
      return snapshot ? getSnapshotStatus(snapshot) : emptyStatus();
    },
  };
}

const singleton = createAutoOrchestrator();

export function start(sessionContext: OrchestratorSessionContext): OrchestratorResult {
  return singleton.start(sessionContext);
}

export function advance() {
  return singleton.advance();
}

export function resume(): OrchestratorResult {
  return singleton.resume();
}

export function stop(reason: string): OrchestratorResult {
  return singleton.stop(reason);
}

export function getStatus(): OrchestratorStatus {
  return singleton.getStatus();
}

function defaultSettingsResolver(context: OrchestratorSessionContext) {
  return resolveWorkflowSettings({ cwd: context.cwd, configPath: context.configPath });
}

function defaultPhaseSignalResolver(context: OrchestratorSessionContext) {
  return inferPhaseSignals({ cwd: context.cwd, phase: context.phase });
}

function record<T extends OrchestratorResult>(result: T, snapshot: OrchestrationSnapshot | undefined, deps: AutoOrchestratorDependencies): T {
  if (!snapshot) return result;
  const written: string[] = [...(result.written ?? [])];
  const events = result.events ?? (snapshot.lastEvent ? [snapshot.lastEvent] : []);
  const messages = [...result.messages];
  let ok = result.ok;
  if (deps.journal) {
    for (const event of events) {
      const journalResult = deps.journal.append(event, snapshot);
      messages.push(...journalResult.messages);
      if (!journalResult.ok) ok = false;
      if (journalResult.written) written.push(...journalResult.written);
    }
  }
  if (deps.stateDigest) {
    const digestResult = deps.stateDigest.write(snapshot);
    messages.push(...digestResult.messages);
    if (digestResult.written) written.push(...digestResult.written);
  }
  return { ...result, ok, messages, ...(written.length > 0 ? { written } : {}) };
}

function emptyStatus(): OrchestratorStatus {
  return { status: "idle", remainingUnits: [], attempt: 0, currentUnit: undefined, lastEvent: undefined, resumeHint: undefined };
}

function settingsResolvedEvent(snapshot: OrchestrationSnapshot, now?: () => string): OrchestrationEvent {
  return {
    type: "settings_resolved",
    ts: now ? now() : new Date().toISOString(),
    phase: snapshot.phase,
    unitId: snapshot.currentUnit?.id,
    status: snapshot.currentUnit?.status ?? "completed",
    attempt: snapshot.attempt,
    evidence: [
      `auto_advance:${snapshot.settings.workflow.auto_advance}`,
      `node_repair_budget:${snapshot.settings.workflow.node_repair_budget}`,
    ],
  };
}

function withLastEvent(snapshot: OrchestrationSnapshot, event: OrchestrationEvent): OrchestrationSnapshot {
  return { ...snapshot, lastEvent: event };
}

function snapshotEvent(snapshot: OrchestrationSnapshot, type: OrchestrationEvent["type"]): OrchestrationEvent | undefined {
  if (!snapshot.lastEvent) return undefined;
  return { ...snapshot.lastEvent, type };
}

export type { AutoOrchestrator, DispatchAdapter, OrchestrationUnit, OrchestratorResult, OrchestratorSessionContext, OrchestratorStatus } from "./types.js";
