import { accessSync, Stats } from 'node:fs';

declare const OFFICIAL_PACKAGE_NAME = "@opengsd/gsd-core";
interface OfficialPaths {
    commandsDir: string;
    workflowsDir: string;
    referencesDir: string;
    templatesDir: string;
    agentsDir: string;
    hooksDir: string;
    gsdTools: string;
    configDefaultsManifest: string;
    configSchemaManifest: string;
}
interface OfficialPackage {
    packageRoot: string;
    packageName: string;
    version: string;
    paths: OfficialPaths;
}
declare class OfficialPackageError extends Error {
    constructor(message: string);
}
declare function resolveOfficialPackage(options?: {
    startDir?: string;
    packageName?: string;
}): OfficialPackage;

type FrontmatterValue = string | string[];
type FrontmatterData = Record<string, FrontmatterValue>;
type ParsedMarkdown = {
    data: FrontmatterData;
    body: string;
};
declare function splitFrontmatter(input: string): ParsedMarkdown;
declare function writeFrontmatter(data: FrontmatterData, body: string): string;

declare function commandFileToPiPromptName(fileName: string): string;
declare function normalizeGsdSlashReferences(input: string): string;
declare function transformGsdRunLauncher(input: string): string;
declare function addPiSubagentGuidance(input: string): string;
/**
 * Split text into code-fenced and non-code segments.
 * Triple-backtick fenced regions are preserved as-is.
 *
 * Limitation (WR-01): Only triple-backtick code fences are protected.
 * 4-space indented code blocks are not detected because official GSD
 * workflows consistently use triple backticks. If indented code blocks
 * appear in custom content, wrap them in triple backticks first.
 */
declare function splitCodeFences(text: string): {
    segment: string;
    isCode: boolean;
}[];
/**
 * Rewrites AskUserQuestion calls in GSD workflow markdown to Pi-compatible
 * ask_user_question schema.
 *
 * Supported forms:
 * 1. AskUserQuestion("header", "question", ["A", "B"])
 * 2. AskUserQuestion("header", "question", ["A", "B"], multiSelect: true)
 * 3. AskUserQuestion("header", "question", [{ label: "A", description: "desc A" }])
 * 4. AskUserQuestion(header: "...", question: "...", options: [...], multiSelect: true/false)
 * 5. AskUserQuestion([{ header: "...", question: "...", ... }])
 * 6. Multi-line variants of all the above
 *
 * Idempotency: does not transform text already containing ask_user_question.
 * Code-fence safe: does not transform within ```...``` blocks.
 */
declare function transformAskUserQuestionForPi(input: string): string;
/**
 * Rewrites Skill(skill="gsd-xxx", args="yyy") calls to Pi-equivalent instructions.
 *
 * Pattern: Skill(skill="gsd-NAME", args="ARGS") →
 *   Use the /gsd-NAME skill (invoke via slash command /gsd-NAME ARGS in Pi) or read the corresponding workflow prompt to continue.
 *
 * Pattern: Skill(skill="gsd-NAME") (no args) →
 *   Use the /gsd-NAME skill (invoke via slash command /gsd-NAME in Pi) or read the corresponding workflow prompt to continue.
 *
 * Code-fence safe: does not transform within ```...``` blocks.
 */
declare function transformSkillDispatchForPi(input: string): string;
/**
 * Rewrites executable workflow dispatch syntax in both prose and code fences.
 * Workflow prompts use fenced pseudo-code as executable instructions, so this
 * transform intentionally does not preserve code-fenced regions.
 */
declare function transformWorkflowDispatchForPi(input: string): string;
/**
 * Rewrites subagent_type="general-purpose" to subagent_type="general" in prompt text.
 * Also rewrites Agent(subagent_type="xxx", prompt="yyy") to subagent({agent: "xxx", task: "yyy"}).
 *
 * Code-fence safe: does not transform within ```...``` blocks.
 */
declare function transformSubagentDispatchForPi(input: string): string;

declare const OFFICIAL_ROOT_PLACEHOLDER = "__PI_GSD_OFFICIAL_ROOT__";
type TransformOfficialAgentResult = {
    markdown: string;
    unsupportedTools: string[];
};
declare function transformOfficialAgentMarkdown(input: string): TransformOfficialAgentResult;
declare function materializeOfficialAgentPaths(input: string, officialRoot: string): string;

type AgentSyncScope = "project" | "user";
type SyncAgentsOptions = {
    generatedAgentsDir: string;
    cwd: string;
    officialRoot: string;
    scope: AgentSyncScope;
    dryRun?: boolean;
    check?: boolean;
};
type SyncAgentsResult = {
    ok: boolean;
    messages: string[];
    written: string[];
};
declare function syncAgents(options: SyncAgentsOptions): SyncAgentsResult;
declare function resolveAgentTargetDir(cwd: string, scope: AgentSyncScope): string;

type GenerateAgentsOptions = {
    officialRoot: string;
    outDir: string;
    safeRoot?: string;
};
type GenerateAgentsResult = {
    written: string[];
};
declare function generateAgents(options: GenerateAgentsOptions): GenerateAgentsResult;

type GeneratePromptsOptions = {
    officialRoot: string;
    outDir: string;
    safeRoot?: string;
};
type GeneratePromptsResult = {
    written: string[];
};
type GenerateAllOptions = {
    officialRoot: string;
    promptsDir: string;
    agentsDir: string;
    safeRoot?: string;
};
type GenerateAllResult = {
    prompts: GeneratePromptsResult;
    agents: GenerateAgentsResult;
    workflows?: GenerateWorkflowsResult;
};
type GenerateWorkflowsOptions = {
    officialRoot: string;
    outDir: string;
    safeRoot?: string;
};
type GenerateWorkflowsResult = {
    written: string[];
};
declare function generatePrompts(options: GeneratePromptsOptions): GeneratePromptsResult;
/**
 * Generate transformed workflow files from the upstream package.
 *
 * This is critical for Pi runtime: GSD command prompts (thin wrappers) delegate
 * to workflow files via "Read and execute" instructions. If workflow files remain
 * untransformed, the agent reads raw AskUserQuestion(), Skill(), and general-purpose
 * subagent syntax — bypassing all Phase 4 runtime adaptations.
 *
 * Workflow files are transformed with the same pipeline as command prompts:
 * normalizeGsdSlashReferences → addPiSubagentGuidance → transformAskUserQuestionForPi
 * → transformSubagentDispatchForPi → transformSkillDispatchForPi → transformLazyLoadReferences
 *
 * Additionally, internal path references (Read and execute `node_modules/.../workflows/...`
 * and `node_modules/.../references/...`) are rewritten to point to the generated copies,
 * so the agent follows transformed content throughout the workflow chain.
 */
declare function generateWorkflows(options: GenerateWorkflowsOptions): GenerateWorkflowsResult;
declare function generateAll(options: GenerateAllOptions): GenerateAllResult;
declare function writeOfficialVersionStamp(options: {
    officialRoot: string;
    generatedRoot: string;
}): void;

declare const PI_SUBAGENTS_PACKAGE_NAME = "pi-subagents";
type PiSubagentsPackage = {
    packageRoot: string;
    packageName: string;
    version: string;
};
declare function resolvePiSubagentsPackage(options?: {
    startDir?: string;
}): PiSubagentsPackage;

type RpivPackage = {
    packageRoot: string;
    packageName: string;
    version: string;
};
/**
 * Resolves the @juicesharp/rpiv-ask-user-question package.
 * Throws if the package cannot be found or has no valid version.
 */
declare function resolveRpivPackage(options?: {
    startDir?: string;
}): RpivPackage;

type AclCheckOptions = {
    /** Override the temp root path (defaults to buildPiSubagentsTempRoot()) */
    tempRoot?: string;
    /** Override filesystem operations (for testing ACL failure scenarios) */
    fs?: {
        accessSync: typeof accessSync;
    };
};
type AclCheckResult = {
    ok: boolean;
    messages: string[];
};
type DoctorOptions = {
    startDir?: string;
    generatedPromptsDir: string;
    generatedAgentsDir?: string;
    generatedWorkflowsDir?: string;
    agentSyncScope?: AgentSyncScope;
    piSubagentsResolver?: typeof resolvePiSubagentsPackage;
    /** Override ACL checker (for testing) — defaults to checkPiSubagentsTempAcl */
    aclChecker?: () => AclCheckResult;
    /** Override rpiv resolver (for testing) — defaults to resolveRpivPackage */
    rpivResolver?: typeof resolveRpivPackage;
};
type DoctorResult = {
    ok: boolean;
    messages: string[];
};
/**
 * Checks ACL integrity of pi-subagents temp directories.
 * For each subdir in TEMP_DIR_SUBDIRS: verifies read/write access via accessSync.
 * If any throws EACCES/EPERM, reports CORRUPTED with repair instructions.
 * If all accessible, reports ok. Never throws — wraps in try/catch.
 */
declare function checkPiSubagentsTempAcl(options?: AclCheckOptions): AclCheckResult;
declare function runDoctor(options: DoctorOptions): DoctorResult;

declare function rewriteOfficialClaudePaths(input: string, officialRoot: string): string;
declare function rewriteRuntimeMessageText(input: string, officialRoot: string): string;

declare const RECONCILIATION_REASON_CODES: readonly ["sketch-flag-drift", "completion-timestamp-drift", "roadmap-divergence", "stale-worker", "unregistered-milestone", "summary-count-mismatch", "noncanonical-plan-like-file", "unknown-drift", "partial-write"];
type ReconciliationReasonCode = (typeof RECONCILIATION_REASON_CODES)[number];
type ReconciliationSuggestedNextAction = "manual-review" | "rerun-reconcile" | "requires-recovery-classification";
type CanonicalArtifactKind = "plan" | "summary" | "verification" | "review" | "context";
type ReconciliationEvidence = {
    reasonCode: ReconciliationReasonCode;
    path?: string;
    paths?: string[];
    phase?: string;
    plan?: string;
    artifact?: CanonicalArtifactKind | "roadmap" | "state" | "journal" | "noncanonical";
    message: string;
    metadata?: Record<string, string | number | boolean>;
};
type ReconciliationRepair = {
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
type ReconciliationWrite = {
    kind?: "roadmap" | "state" | "journal";
    reasonCode: ReconciliationReasonCode;
    path: string;
    action: "create" | "update" | "delete";
};
type ReconciliationBlocker = {
    reasonCode: ReconciliationReasonCode;
    message: string;
    evidence: ReconciliationEvidence[];
    phase?: string;
    artifact?: CanonicalArtifactKind | "state" | "roadmap" | "journal" | "noncanonical";
    repairPlan?: ReconciliationRepair[];
    written?: ReconciliationWrite[];
    suggestedNextAction?: ReconciliationSuggestedNextAction;
};

declare const RECOVERY_CLASSES: readonly ["transient-external-failure", "repairable-state-drift", "unrepaired-state-drift", "worktree-invalid", "dispatch-contract-invalid", "artifact-gate-failed", "user-input-required", "internal-invariant-violation"];
type RecoveryClass = (typeof RECOVERY_CLASSES)[number];
declare const RECOVERY_ACTION_VALUES: readonly ["retry", "pause-with-remediation", "self-heal", "stop"];
type RecoveryAction = (typeof RECOVERY_ACTION_VALUES)[number];
declare const RECOVERY_ACTIONS: {
    readonly "transient-external-failure": "retry";
    readonly "repairable-state-drift": "self-heal";
    readonly "unrepaired-state-drift": "pause-with-remediation";
    readonly "worktree-invalid": "stop";
    readonly "dispatch-contract-invalid": "stop";
    readonly "artifact-gate-failed": "pause-with-remediation";
    readonly "user-input-required": "pause-with-remediation";
    readonly "internal-invariant-violation": "stop";
};
type RecoveryDecisionEvidence = {
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
type RecoveryDecision = {
    class: RecoveryClass;
    action: RecoveryAction;
    reasonCode?: ReconciliationReasonCode | string;
    message: string;
    remediation: string;
    evidence?: RecoveryDecisionEvidence;
};
type ReconciliationRecoveryInput = {
    kind: "reconciliation";
    reasonCode: ReconciliationReasonCode;
    blockers?: ReconciliationBlocker[];
    written?: ReconciliationWrite[];
    evidence?: ReconciliationEvidence[];
};
type GateRecoveryInput = {
    kind: "gate";
    gate: string;
    reason?: string;
    retryable?: boolean;
    evidence?: RecoveryDecisionEvidence;
};
type DispatchRecoveryInput = {
    kind: "dispatch";
    reason?: string;
    evidence?: RecoveryDecisionEvidence;
};
type ArtifactGateRecoveryInput = {
    kind: "artifact-gate";
    reason?: string;
    evidence?: RecoveryDecisionEvidence;
};
type WorktreeRecoveryInput = {
    kind: "worktree";
    reasonCode: string;
    message?: string;
    remediation?: string;
    evidence?: RecoveryDecisionEvidence;
    class?: RecoveryClass;
};
type ExternalRecoveryInput = {
    kind: "external";
    reasonCode: "provider-network" | "missing-auth" | "user-input" | "internal" | string;
    message?: string;
    evidence?: RecoveryDecisionEvidence;
};
type RecoveryFailureKind = RecoveryFailureInput["kind"];
type RecoveryFailureInput = ReconciliationRecoveryInput | GateRecoveryInput | DispatchRecoveryInput | ArtifactGateRecoveryInput | WorktreeRecoveryInput | ExternalRecoveryInput;

type LeaseJournalEvent = {
    type: "lease_acquired" | "lease_released" | "lease_stale_reclaimed";
    event?: "lease_acquired" | "lease_released" | "lease_stale_reclaimed";
    ts?: string;
    phase?: string;
    unitId: string;
    root?: string;
    paths?: string[];
    branch?: string;
    attempt?: number;
    action?: string;
    recoveryClass?: string;
    reasonCode?: string;
    written?: string[];
    message?: string;
    host?: string;
    pid?: number;
};
type WorktreeEvidence = RecoveryDecisionEvidence & {
    root?: string;
    branch?: string;
    expectedBranch?: string;
    journalEvents?: LeaseJournalEvent[];
};
type PrepareUnitRootResult = {
    ok: true;
    root: string;
    evidence: WorktreeEvidence;
} | {
    ok: false;
    decision: RecoveryDecision;
};
type WorktreeLeaseRecord = {
    unitId: string;
    sessionId?: string;
    phase?: string;
    branch?: string;
    root?: string;
    host?: string;
    pid?: number;
    updatedAt?: string;
};
type LeaseOwnershipEvidence = {
    expected?: Partial<WorktreeLeaseRecord>;
    actual?: Partial<WorktreeLeaseRecord>;
    provenInactive?: boolean;
    incomplete?: boolean;
    contradictory?: boolean;
};
type WorktreeLeaseCheck = {
    ok: true;
    record?: WorktreeLeaseRecord;
    journalEvents?: LeaseJournalEvent[];
    selfHealed?: boolean;
} | {
    ok: false;
    decision: RecoveryDecision;
};
type GitProbeDeps = {
    existsSync(path: string): boolean;
    lstatSync(path: string): Pick<Stats, "isFile" | "isDirectory">;
    readFileSync(path: string): string;
    writeFileSync(path: string, content: string): void;
    unlinkSync(path: string): void;
    mkdirSync(path: string, options?: {
        recursive?: boolean;
    }): void;
    cwd(): string;
    env(name: string): string | undefined;
    currentBranch(root: string): string | undefined;
    now(): string;
    hostname(): string;
    pid(): number;
    isProcessAlive?(pid: number, host?: string): boolean | undefined;
};
type WorktreeSafetyDeps = GitProbeDeps;
type PrepareUnitRootInput = {
    unitType: UnitType;
    unitId: string;
    phase?: string;
    projectRoot?: string;
    unitRoot?: string;
    expectedBranch?: string;
    workflow?: {
        worktrees?: boolean;
    };
    sessionId?: string;
    attempt?: number;
    leasePath?: string;
    deps?: Partial<WorktreeSafetyDeps>;
};
type PrepareUnitRootOptions = Omit<PrepareUnitRootInput, "unitType" | "unitId">;

type UnitType = "discuss" | "research" | "plan" | "plan-check" | "execute" | "code-review" | "verify" | "ui-review" | "security-review" | "nyquist-validation" | "ai-integration" | "ui-safety-gate" | "closeout" | "settings-gate" | "pause-for-user";
type UnitStatus = "pending" | "running" | "completed" | "failed" | "paused" | "stopped";
type WorkflowSettingSource = "default" | "config" | "override";
type OrchestrationMode = "auto" | "chain";
type StopReason = "gate-failed" | "ambiguous-dispatch" | "retry-budget-exhausted" | "dispatch-failed" | "stopped" | RecoveryClass;
type OrchestrationUnit = {
    id: string;
    type: UnitType;
    status: UnitStatus;
    phase: string;
    label: string;
    required: boolean;
    source: WorkflowSettingSource | "phase-signal";
    metadata?: {
        args?: string;
        setting?: string;
        expectedBranch?: string;
        [key: string]: string | number | boolean | undefined;
    };
    resumeHint?: string;
};
type ResolvedWorkflowSettings = {
    workflow: {
        _auto_chain_active: boolean;
        auto_advance: boolean;
        research: boolean;
        plan_check: boolean;
        verifier: boolean;
        ui_phase: boolean;
        ui_review: boolean;
        code_review: boolean;
        code_review_depth?: "quick" | "standard" | "deep" | string;
        code_review_command?: string | null;
        plan_review_convergence?: boolean;
        max_discuss_passes?: number;
        plan_bounce?: boolean;
        plan_bounce_passes?: number;
        post_planning_gaps?: boolean;
        security_enforcement?: boolean;
        nyquist_validation?: boolean;
        ai_integration_phase?: boolean;
        ui_safety_gate?: boolean;
        auto_prune_state?: boolean;
        research_before_questions?: boolean;
        skip_discuss: boolean;
        worktrees: boolean;
        node_repair: boolean;
        node_repair_budget: number;
        state_reconciliation_apply?: boolean;
        subagent_timeout?: number;
        inline_plan_threshold?: number;
    };
    rawWorkflow?: Record<string, unknown>;
    workflowMetadata?: {
        officialPackage?: string;
        officialVersion?: string;
        officialRoot?: string;
        schemaKeys?: string[];
    };
    sources?: Partial<Record<keyof ResolvedWorkflowSettings["workflow"], WorkflowSettingSource>>;
    settingsSource?: {
        path?: string;
        kind: string;
        hash?: string;
        mtimeMs?: number;
    };
};
type QueueBuildInput = {
    mode: OrchestrationMode;
    phase: string;
    cwd?: string;
    configPath?: string;
    startAt?: UnitType;
    settings?: ResolvedWorkflowSettings;
    phaseSignals?: {
        isUiPhase?: boolean;
        requiresUiReview?: boolean;
        requiresSecurityReview?: boolean;
        requiresNyquistValidation?: boolean;
        isAiPhase?: boolean;
    };
};
type QueueBuildResult = {
    decision: "dispatch" | "pause_for_user";
    units: OrchestrationUnit[];
    settings: ResolvedWorkflowSettings;
    resumeHint?: string;
};
type GateName = "reconcileBeforeDispatch" | "decideDispatch" | "validateToolContract" | "prepareUnitRoot" | "persistRuntimeState" | "artifact";
type GateResult = {
    ok: true;
    gate: GateName;
    evidence: string[];
    retryable?: false;
    journalEvents?: LeaseJournalEvent[];
} | {
    ok: false;
    gate: GateName;
    reason: StopReason | string;
    retryable: boolean;
    resumeHint: string;
    evidence?: string[];
    recoveryDecision?: RecoveryDecision;
    exitReason?: RecoveryClass;
    journalEvents?: LeaseJournalEvent[];
};
type GateAdapter = (snapshot: OrchestrationSnapshot, unit: OrchestrationUnit) => GateResult;
type DispatchAdapter = (unit: OrchestrationUnit, snapshot: OrchestrationSnapshot) => OrchestratorResult;
type JournalAdapter = {
    append: (event: OrchestrationEvent, snapshot: OrchestrationSnapshot) => OrchestratorResult;
    read?: () => {
        ok: boolean;
        messages: string[];
        journal?: {
            snapshot: OrchestrationSnapshot;
            events: OrchestrationEvent[];
        };
    };
};
type StateDigestAdapter = {
    write: (snapshot: OrchestrationSnapshot) => OrchestratorResult;
};
type OrchestrationEvent = {
    type: "orchestration_started" | "settings_resolved" | "unit_started" | "unit_ended" | "gate_passed" | "gate_failed" | "retry_scheduled" | "pause" | "resume" | "stop" | "orchestration_completed" | "start" | "unit-start" | "unit-end" | "gate-pass" | "gate-fail" | "retry" | "lease_acquired" | "lease_released" | "lease_stale_reclaimed";
    ts: string;
    phase: string;
    unitId?: string;
    status: UnitStatus;
    attempt: number;
    reason?: string;
    resumeHint?: string;
    evidence?: string[];
    recoveryDecision?: RecoveryDecision;
    exitReason?: RecoveryClass;
    action?: string;
    journalEvents?: LeaseJournalEvent[];
    recoveryClass?: RecoveryClass;
    root?: string;
    branch?: string;
    paths?: string[];
    written?: string[];
    message?: string;
};
type OrchestrationSnapshot = {
    version: 1;
    phase: string;
    mode: OrchestrationMode;
    status: "idle" | "running" | "paused" | "stopped" | "completed";
    currentUnit?: OrchestrationUnit;
    remainingUnits: OrchestrationUnit[];
    attempt: number;
    loopState?: {
        planCheckIterations?: number;
        previousIssueCount?: number;
    };
    lastEvent?: OrchestrationEvent;
    resumeHint?: string;
    settings: ResolvedWorkflowSettings;
    cwd?: string;
};
type OrchestratorStatus = Pick<OrchestrationSnapshot, "status" | "currentUnit" | "remainingUnits" | "attempt" | "lastEvent" | "resumeHint">;
type OrchestratorSessionContext = {
    phase: string;
    mode: OrchestrationMode;
    cwd?: string;
    configPath?: string;
    startAt?: UnitType;
};
type OrchestratorResult = {
    ok: boolean;
    messages: string[];
    status?: OrchestratorStatus;
    snapshot?: OrchestrationSnapshot;
    written?: string[];
    events?: OrchestrationEvent[];
    outcome?: OrchestrationOutcome;
};
type OrchestrationOutcome = {
    status?: string;
    marker?: string;
    verdict?: string;
    data?: Record<string, string | number | boolean>;
};
type AdvanceResult = OrchestratorResult & {
    dispatched?: OrchestrationUnit;
};
type AutoOrchestrator = {
    start: (sessionContext: OrchestratorSessionContext) => OrchestratorResult;
    advance: () => AdvanceResult;
    resume: () => OrchestratorResult;
    stop: (reason: string) => OrchestratorResult;
    getStatus: () => OrchestratorStatus;
};

declare function readCurrentBranch(root: string): string | undefined;
declare function hasGitMarker(root: string, deps?: Pick<WorktreeSafetyDeps, "existsSync">): boolean;
declare const defaultWorktreeSafetyDeps: WorktreeSafetyDeps;

declare function readLeaseRecord(root: string, leasePath: string | undefined, deps?: WorktreeSafetyDeps): WorktreeLeaseRecord | undefined;
declare function checkLeaseOwnership(input: PrepareUnitRootInput, root: string, branch?: string, deps?: WorktreeSafetyDeps): WorktreeLeaseCheck;
declare function releaseLeaseOwnership(input: PrepareUnitRootInput, root: string, branch?: string, deps?: WorktreeSafetyDeps): WorktreeLeaseCheck;
declare function reclaimStaleLeaseIfSafe(record: WorktreeLeaseRecord, expected: WorktreeLeaseRecord, path: string, deps?: WorktreeSafetyDeps, attempt?: number): WorktreeLeaseCheck;
declare function leaseAcquiredEvent(record: WorktreeLeaseRecord, path?: string, attempt?: number): LeaseJournalEvent;
declare function leaseReleasedEvent(record: WorktreeLeaseRecord, path?: string, attempt?: number): LeaseJournalEvent;
declare function leaseStaleReclaimedEvent(record: WorktreeLeaseRecord, path?: string, attempt?: number): LeaseJournalEvent;

declare function isSourceWritingUnit(unitType: UnitType): boolean;
declare function resolveExpectedUnitRoot(input: PrepareUnitRootInput, deps: WorktreeSafetyDeps): string;
declare function prepareUnitRoot(unitType: UnitType, unitId: string, options?: PrepareUnitRootOptions): PrepareUnitRootResult;
declare function prepareUnitRoot(input: PrepareUnitRootInput): PrepareUnitRootResult;

type GateOverrides = Partial<Record<Exclude<GateName, "artifact">, GateAdapter>>;

type AdvanceOptions = {
    gates?: GateOverrides;
    dispatch?: DispatchAdapter;
    postDispatchGate?: GateAdapter;
    now?: () => string;
    worktreeSafetyDeps?: Partial<WorktreeSafetyDeps>;
};

type AutoOrchestratorDependencies = {
    settingsResolver?: (context: OrchestratorSessionContext) => ResolvedWorkflowSettings;
    queueBuilder?: (input: QueueBuildInput) => QueueBuildResult;
    phaseSignalResolver?: (context: OrchestratorSessionContext) => QueueBuildInput["phaseSignals"];
    dispatch?: DispatchAdapter;
    journal?: JournalAdapter;
    stateDigest?: StateDigestAdapter;
    gates?: AdvanceOptions["gates"];
    worktreeSafetyDeps?: Partial<WorktreeSafetyDeps>;
    clock?: () => string;
};
declare function createAutoOrchestrator(deps?: AutoOrchestratorDependencies): AutoOrchestrator;
declare function start(sessionContext: OrchestratorSessionContext): OrchestratorResult;
declare function advance(): AdvanceResult;
declare function resume(): OrchestratorResult;
declare function stop(reason: string): OrchestratorResult;
declare function getStatus(): OrchestratorStatus;

declare const RECONCILIATION_REASON_TO_RECOVERY_CLASS: {
    readonly "sketch-flag-drift": "repairable-state-drift";
    readonly "completion-timestamp-drift": "repairable-state-drift";
    readonly "roadmap-divergence": "repairable-state-drift";
    readonly "stale-worker": "unrepaired-state-drift";
    readonly "unregistered-milestone": "unrepaired-state-drift";
    readonly "summary-count-mismatch": "unrepaired-state-drift";
    readonly "noncanonical-plan-like-file": "unrepaired-state-drift";
    readonly "unknown-drift": "unrepaired-state-drift";
    readonly "partial-write": "internal-invariant-violation";
};
declare function classifyFailure(input: RecoveryFailureInput): RecoveryDecision;

export { type AclCheckOptions, type AclCheckResult, type AgentSyncScope, type ArtifactGateRecoveryInput, type AutoOrchestrator, type AutoOrchestratorDependencies, type DispatchAdapter, type DispatchRecoveryInput, type DoctorOptions, type DoctorResult, type ExternalRecoveryInput, type FrontmatterData, type FrontmatterValue, type GateRecoveryInput, type GenerateAgentsOptions, type GenerateAgentsResult, type GenerateAllOptions, type GenerateAllResult, type GeneratePromptsOptions, type GeneratePromptsResult, type GenerateWorkflowsOptions, type GenerateWorkflowsResult, type GitProbeDeps, type LeaseJournalEvent, type LeaseOwnershipEvidence, OFFICIAL_PACKAGE_NAME, OFFICIAL_ROOT_PLACEHOLDER, type OfficialPackage, OfficialPackageError, type OfficialPaths, type OrchestrationUnit, type OrchestratorResult, type OrchestratorSessionContext, type OrchestratorStatus, PI_SUBAGENTS_PACKAGE_NAME, type ParsedMarkdown, type PiSubagentsPackage, type PrepareUnitRootInput, type PrepareUnitRootOptions, type PrepareUnitRootResult, RECONCILIATION_REASON_TO_RECOVERY_CLASS, RECOVERY_ACTIONS, RECOVERY_ACTION_VALUES, RECOVERY_CLASSES, type ReconciliationRecoveryInput, type RecoveryAction, type RecoveryClass, type RecoveryDecision, type RecoveryDecisionEvidence, type RecoveryFailureInput, type RecoveryFailureKind, type SyncAgentsOptions, type SyncAgentsResult, type TransformOfficialAgentResult, type WorktreeEvidence, type WorktreeLeaseCheck, type WorktreeLeaseRecord, type WorktreeRecoveryInput, type WorktreeSafetyDeps, addPiSubagentGuidance, advance, checkLeaseOwnership, checkPiSubagentsTempAcl, classifyFailure, commandFileToPiPromptName, createAutoOrchestrator, defaultWorktreeSafetyDeps, generateAgents, generateAll, generatePrompts, generateWorkflows, getStatus, hasGitMarker, isSourceWritingUnit, leaseAcquiredEvent, leaseReleasedEvent, leaseStaleReclaimedEvent, materializeOfficialAgentPaths, normalizeGsdSlashReferences, prepareUnitRoot, readCurrentBranch, readLeaseRecord, reclaimStaleLeaseIfSafe, releaseLeaseOwnership, resolveAgentTargetDir, resolveExpectedUnitRoot, resolveOfficialPackage, resolvePiSubagentsPackage, resume, rewriteOfficialClaudePaths, rewriteRuntimeMessageText, runDoctor, splitCodeFences, splitFrontmatter, start, stop, syncAgents, transformAskUserQuestionForPi, transformGsdRunLauncher, transformOfficialAgentMarkdown, transformSkillDispatchForPi, transformSubagentDispatchForPi, transformWorkflowDispatchForPi, writeFrontmatter, writeOfficialVersionStamp };
