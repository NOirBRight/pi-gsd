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

type GeneratePromptsOptions = {
    officialRoot: string;
    outDir: string;
};
type GeneratePromptsResult = {
    written: string[];
};
declare function generatePrompts(options: GeneratePromptsOptions): GeneratePromptsResult;

type DoctorOptions = {
    startDir?: string;
    generatedPromptsDir: string;
};
type DoctorResult = {
    ok: boolean;
    messages: string[];
};
declare function runDoctor(options: DoctorOptions): DoctorResult;

declare function rewriteOfficialClaudePaths(input: string, officialRoot: string): string;
declare function rewriteRuntimeMessageText(input: string, officialRoot: string): string;

export { type DoctorOptions, type DoctorResult, type FrontmatterData, type FrontmatterValue, type GeneratePromptsOptions, type GeneratePromptsResult, OFFICIAL_PACKAGE_NAME, type OfficialPackage, OfficialPackageError, type OfficialPaths, type ParsedMarkdown, commandFileToPiPromptName, generatePrompts, normalizeGsdSlashReferences, resolveOfficialPackage, rewriteOfficialClaudePaths, rewriteRuntimeMessageText, runDoctor, splitFrontmatter, writeFrontmatter };
