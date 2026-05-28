declare const OFFICIAL_PACKAGE_NAME = "@opengsd/get-shit-done-redux";
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
};
declare function generatePrompts(options: GeneratePromptsOptions): GeneratePromptsResult;
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

type DoctorOptions = {
    startDir?: string;
    generatedPromptsDir: string;
    generatedAgentsDir?: string;
    agentSyncScope?: AgentSyncScope;
    piSubagentsResolver?: typeof resolvePiSubagentsPackage;
};
type DoctorResult = {
    ok: boolean;
    messages: string[];
};
declare function runDoctor(options: DoctorOptions): DoctorResult;

declare function rewriteOfficialClaudePaths(input: string, officialRoot: string): string;
declare function rewriteRuntimeMessageText(input: string, officialRoot: string): string;

export { type AgentSyncScope, type DoctorOptions, type DoctorResult, type FrontmatterData, type FrontmatterValue, type GenerateAgentsOptions, type GenerateAgentsResult, type GenerateAllOptions, type GenerateAllResult, type GeneratePromptsOptions, type GeneratePromptsResult, OFFICIAL_PACKAGE_NAME, OFFICIAL_ROOT_PLACEHOLDER, type OfficialPackage, OfficialPackageError, type OfficialPaths, PI_SUBAGENTS_PACKAGE_NAME, type ParsedMarkdown, type PiSubagentsPackage, type SyncAgentsOptions, type SyncAgentsResult, type TransformOfficialAgentResult, addPiSubagentGuidance, commandFileToPiPromptName, generateAgents, generateAll, generatePrompts, materializeOfficialAgentPaths, normalizeGsdSlashReferences, resolveAgentTargetDir, resolveOfficialPackage, resolvePiSubagentsPackage, rewriteOfficialClaudePaths, rewriteRuntimeMessageText, runDoctor, splitFrontmatter, syncAgents, transformOfficialAgentMarkdown, writeFrontmatter };
