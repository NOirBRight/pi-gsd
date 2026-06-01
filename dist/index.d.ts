import { accessSync } from 'node:fs';

declare const OFFICIAL_PACKAGE_NAME = "@opengsd/gsd-core";
interface OfficialPaths {
    commandsDir: string;
    workflowsDir: string;
    referencesDir: string;
    templatesDir: string;
    agentsDir: string;
    hooksDir: string;
    gsdTools: string;
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

type UnitType = "discuss" | "research" | "plan" | "plan-check" | "execute" | "code-review" | "verify" | "ui-review" | "closeout" | "settings-gate" | "pause-for-user";
type UnitStatus = "pending" | "running" | "completed" | "failed" | "paused" | "stopped";
type WorkflowSettingSource = "default" | "config" | "override";
type OrchestrationMode = "auto" | "chain";
type StopReason = "gate-failed" | "ambiguous-dispatch" | "retry-budget-exhausted" | "dispatch-failed" | "stopped";
type OrchestrationUnit = {
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
        skip_discuss: boolean;
        worktrees: boolean;
        node_repair: boolean;
        node_repair_budget: number;
    };
    sources?: Partial<Record<keyof ResolvedWorkflowSettings["workflow"], WorkflowSettingSource>>;
};
type QueueBuildInput = {
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
} | {
    ok: false;
    gate: GateName;
    reason: StopReason | string;
    retryable: boolean;
    resumeHint: string;
    evidence?: string[];
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
    type: "orchestration_started" | "settings_resolved" | "unit_started" | "unit_ended" | "gate_passed" | "gate_failed" | "retry_scheduled" | "pause" | "resume" | "stop" | "start" | "unit-start" | "unit-end" | "gate-pass" | "gate-fail" | "retry";
    ts: string;
    phase: string;
    unitId?: string;
    status: UnitStatus;
    attempt: number;
    reason?: string;
    resumeHint?: string;
    evidence?: string[];
};
type OrchestrationSnapshot = {
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
type OrchestratorStatus = Pick<OrchestrationSnapshot, "status" | "currentUnit" | "remainingUnits" | "attempt" | "lastEvent" | "resumeHint">;
type OrchestratorSessionContext = {
    phase: string;
    mode: OrchestrationMode;
    cwd?: string;
    configPath?: string;
};
type OrchestratorResult = {
    ok: boolean;
    messages: string[];
    status?: OrchestratorStatus;
    snapshot?: OrchestrationSnapshot;
    written?: string[];
    events?: OrchestrationEvent[];
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

type GateOverrides = Partial<Record<Exclude<GateName, "artifact">, GateAdapter>>;

type AdvanceOptions = {
    gates?: GateOverrides;
    dispatch?: DispatchAdapter;
    postDispatchGate?: GateAdapter;
    now?: () => string;
};

type AutoOrchestratorDependencies = {
    settingsResolver?: (context: OrchestratorSessionContext) => ResolvedWorkflowSettings;
    queueBuilder?: (input: QueueBuildInput) => QueueBuildResult;
    dispatch?: DispatchAdapter;
    journal?: JournalAdapter;
    stateDigest?: StateDigestAdapter;
    gates?: AdvanceOptions["gates"];
    clock?: () => string;
};
declare function createAutoOrchestrator(deps?: AutoOrchestratorDependencies): AutoOrchestrator;
declare function start(sessionContext: OrchestratorSessionContext): OrchestratorResult;
declare function advance(): AdvanceResult;
declare function resume(): OrchestratorResult;
declare function stop(reason: string): OrchestratorResult;
declare function getStatus(): OrchestratorStatus;

export { type AclCheckOptions, type AclCheckResult, type AgentSyncScope, type AutoOrchestrator, type AutoOrchestratorDependencies, type DispatchAdapter, type DoctorOptions, type DoctorResult, type FrontmatterData, type FrontmatterValue, type GenerateAgentsOptions, type GenerateAgentsResult, type GenerateAllOptions, type GenerateAllResult, type GeneratePromptsOptions, type GeneratePromptsResult, type GenerateWorkflowsOptions, type GenerateWorkflowsResult, OFFICIAL_PACKAGE_NAME, OFFICIAL_ROOT_PLACEHOLDER, type OfficialPackage, OfficialPackageError, type OfficialPaths, type OrchestrationUnit, type OrchestratorResult, type OrchestratorSessionContext, type OrchestratorStatus, PI_SUBAGENTS_PACKAGE_NAME, type ParsedMarkdown, type PiSubagentsPackage, type SyncAgentsOptions, type SyncAgentsResult, type TransformOfficialAgentResult, addPiSubagentGuidance, advance, checkPiSubagentsTempAcl, commandFileToPiPromptName, createAutoOrchestrator, generateAgents, generateAll, generatePrompts, generateWorkflows, getStatus, materializeOfficialAgentPaths, normalizeGsdSlashReferences, resolveAgentTargetDir, resolveOfficialPackage, resolvePiSubagentsPackage, resume, rewriteOfficialClaudePaths, rewriteRuntimeMessageText, runDoctor, splitCodeFences, splitFrontmatter, start, stop, syncAgents, transformAskUserQuestionForPi, transformOfficialAgentMarkdown, transformSkillDispatchForPi, transformSubagentDispatchForPi, writeFrontmatter };
