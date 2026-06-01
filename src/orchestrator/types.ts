export type UnitType =
  | "discuss"
  | "research"
  | "plan"
  | "plan-check"
  | "execute"
  | "code-review"
  | "verify"
  | "ui-review"
  | "closeout"
  | "settings-gate"
  | "pause-for-user";

export type UnitStatus = "pending" | "running" | "completed" | "failed" | "paused" | "stopped";

export type WorkflowSettingSource = "default" | "config" | "override";

export type OrchestrationMode = "auto" | "chain";

export type StopReason = "gate-failed" | "ambiguous-dispatch" | "retry-budget-exhausted" | "dispatch-failed" | "stopped";

export type OrchestrationUnit = {
  id: string;
  type: UnitType;
  status: UnitStatus;
  phase: string;
  label: string;
  required: boolean;
  source: WorkflowSettingSource | "phase-signal";
  metadata?: Record<string, string | number | boolean>;
  resumeHint?: string;
};

export type ResolvedWorkflowSettings = {
  workflow: {
    _auto_chain_active: boolean;
    auto_advance: boolean;
    research: boolean;
    plan_check: boolean;
    verifier: boolean;
    ui_phase: boolean;
    ui_review: boolean;
    code_review: boolean;
    skip_discuss: boolean;
    worktrees: boolean;
    node_repair: boolean;
    node_repair_budget: number;
  };
  sources?: Partial<Record<keyof ResolvedWorkflowSettings["workflow"], WorkflowSettingSource>>;
};

export type QueueBuildInput = {
  mode: OrchestrationMode;
  phase: string;
  cwd?: string;
  configPath?: string;
  settings?: ResolvedWorkflowSettings;
  phaseSignals?: {
    isUiPhase?: boolean;
    requiresUiReview?: boolean;
  };
};

export type QueueBuildResult = {
  decision: "dispatch" | "pause_for_user";
  units: OrchestrationUnit[];
  settings: ResolvedWorkflowSettings;
  resumeHint?: string;
};

export type GateName =
  | "reconcileBeforeDispatch"
  | "decideDispatch"
  | "validateToolContract"
  | "prepareUnitRoot"
  | "persistRuntimeState"
  | "artifact";

export type GateResult =
  | { ok: true; gate: GateName; evidence: string[]; retryable?: false }
  | { ok: false; gate: GateName; reason: StopReason | string; retryable: boolean; resumeHint: string; evidence?: string[] };

export type GateAdapter = (snapshot: OrchestrationSnapshot, unit: OrchestrationUnit) => GateResult;

export type DispatchAdapter = (unit: OrchestrationUnit, snapshot: OrchestrationSnapshot) => OrchestratorResult;

export type JournalAdapter = {
  append: (event: OrchestrationEvent, snapshot: OrchestrationSnapshot) => OrchestratorResult;
  read?: () => { ok: boolean; messages: string[]; journal?: { snapshot: OrchestrationSnapshot; events: OrchestrationEvent[] } };
};

export type StateDigestAdapter = {
  write: (snapshot: OrchestrationSnapshot) => OrchestratorResult;
};

export type OrchestrationEvent = {
  type:
    | "orchestration_started"
    | "settings_resolved"
    | "unit_started"
    | "unit_ended"
    | "gate_passed"
    | "gate_failed"
    | "retry_scheduled"
    | "pause"
    | "resume"
    | "stop"
    | "start"
    | "unit-start"
    | "unit-end"
    | "gate-pass"
    | "gate-fail"
    | "retry";
  ts: string;
  phase: string;
  unitId?: string;
  status: UnitStatus;
  attempt: number;
  reason?: string;
  resumeHint?: string;
  evidence?: string[];
};

export type OrchestrationSnapshot = {
  version: 1;
  phase: string;
  mode: OrchestrationMode;
  status: "idle" | "running" | "paused" | "stopped" | "completed";
  currentUnit?: OrchestrationUnit;
  remainingUnits: OrchestrationUnit[];
  attempt: number;
  lastEvent?: OrchestrationEvent;
  resumeHint?: string;
  settings: ResolvedWorkflowSettings;
  cwd?: string;
};

export type OrchestratorStatus = Pick<OrchestrationSnapshot, "status" | "currentUnit" | "remainingUnits" | "attempt" | "lastEvent" | "resumeHint">;

export type OrchestratorSessionContext = {
  phase: string;
  mode: OrchestrationMode;
  cwd?: string;
  configPath?: string;
};

export type OrchestratorResult = {
  ok: boolean;
  messages: string[];
  status?: OrchestratorStatus;
  snapshot?: OrchestrationSnapshot;
  written?: string[];
  events?: OrchestrationEvent[];
};

export type AdvanceResult = OrchestratorResult & {
  dispatched?: OrchestrationUnit;
};

export type AutoOrchestrator = {
  start: (sessionContext: OrchestratorSessionContext) => OrchestratorResult;
  advance: () => AdvanceResult;
  resume: () => OrchestratorResult;
  stop: (reason: string) => OrchestratorResult;
  getStatus: () => OrchestratorStatus;
};

export type ReconcileBeforeDispatchResult = GateResult;
