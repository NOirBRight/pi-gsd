import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { splitFrontmatter, writeFrontmatter } from "./frontmatter.js";
import {
  addPiSubagentGuidance,
  commandFileToPiPromptName,
  normalizeGsdSlashReferences,
  transformAskUserQuestionForPi,
  transformGsdRunLauncher,
  transformSkillDispatchForPi,
  transformSubagentDispatchForPi,
  transformWorkflowDispatchForPi,
} from "./prompt-transform.js";
import { OFFICIAL_PACKAGE_NAME } from "./official.js";
import { compileOrchestrationContract, writeOrchestrationContractSnapshot } from "./orchestration-contract/index.js";
import { compileToolContracts, writeToolContractSnapshot } from "./tool-contract/index.js";
import { generateAgents, type GenerateAgentsResult } from "./agent-generator.js";
import { assertSafeOutDir } from "./safe-output.js";
import { rewriteWorkflowPaths } from "./rewrite-workflow-paths.js";

export type GeneratePromptsOptions = {
  officialRoot: string;
  outDir: string;
  safeRoot?: string;
};

export type GeneratePromptsResult = {
  written: string[];
};

export type GenerateAllOptions = {
  officialRoot: string;
  promptsDir: string;
  agentsDir: string;
  safeRoot?: string;
};

export type GenerateAllResult = {
  prompts: GeneratePromptsResult;
  agents: import("./agent-generator.js").GenerateAgentsResult;
  workflows?: GenerateWorkflowsResult;
};

export type GenerateWorkflowsOptions = {
  officialRoot: string;
  outDir: string;
  safeRoot?: string;
};

export type GenerateWorkflowsResult = {
  written: string[];
};

/**
 * Apply all prompt transforms to a body string.
 * This is the same pipeline used for command prompts and workflow files.
 */
function applyPromptTransforms(body: string, _packageName: string): string {
  return transformSkillDispatchForPi(
    transformSubagentDispatchForPi(
      transformAskUserQuestionForPi(
        addPiSubagentGuidance(normalizeGsdSlashReferences(transformGsdRunLauncher(body))),
      ),
    ),
  );
}

/**
 * Workflow files contain executable pseudo-code inside markdown fences, so
 * dispatch transforms intentionally run across the full workflow body.
 */
function applyWorkflowTransforms(body: string, packageName: string, workflowPath: string): string {
  const transformed = normalizeWorkflowDispatchInstructionPhrases(applyEscapedWorkflowDispatchTransforms(
    applyPromptTransforms(transformWorkflowDispatchForPi(body), packageName),
  ));
  return workflowPath === "workflows/code-review-fix.md" ? fixReviewFixReportPathEnv(transformed) : transformed;
}

function applyEscapedWorkflowDispatchTransforms(body: string): string {
  return body.replace(/\b(?:Skill|Workflow|SlashCommand|Agent)\((?:[^()\\]|\\.)*\)/g, (call) => {
    const normalized = call.replace(/\\"/g, '"').replace(/\\'/g, "'");
    const transformed = transformWorkflowDispatchForPi(normalized);
    return transformed === normalized ? call : transformed;
  });
}

function normalizeWorkflowDispatchInstructionPhrases(body: string): string {
  return body.replace(/\binvoke Invoke\s+/g, "invoke ");
}

function fixReviewFixReportPathEnv(body: string): string {
  return body.replace(/\bREVIEW_PATH="\$\{REVIEW_PATH\}" node -e/g, 'REVIEW_PATH="${REVIEW_PATH}" FIX_REPORT_PATH="${FIX_REPORT_PATH}" node -e');
}

export function generatePrompts(options: GeneratePromptsOptions): GeneratePromptsResult {
  const officialRoot = resolve(options.officialRoot);
  const outDir = resolve(options.outDir);

  assertSafeOutDir({ officialRoot, outDir, safeRoot: options.safeRoot });

  const commandsDir = join(officialRoot, "commands", "gsd");
  const fileNames = readdirSync(commandsDir)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const written = fileNames.map((fileName) => {
    const source = readFileSync(join(commandsDir, fileName), "utf8");
    const parsed = splitFrontmatter(source);
    const targetPath = join(outDir, commandFileToPiPromptName(fileName));
    const body = applyPromptTransforms(rewriteWorkflowPaths(parsed.body, OFFICIAL_PACKAGE_NAME), OFFICIAL_PACKAGE_NAME);

    writeFileSync(targetPath, writeFrontmatter(parsed.data, body), "utf8");
    return targetPath;
  });

  return { written };
}

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
export function generateWorkflows(options: GenerateWorkflowsOptions): GenerateWorkflowsResult {
  const officialRoot = resolve(options.officialRoot);
  const outDir = resolve(options.outDir);

  assertSafeOutDir({ officialRoot, outDir, safeRoot: options.safeRoot });

  const workflowsDir = join(officialRoot, "get-shit-done", "workflows");
  const referencesDir = join(officialRoot, "get-shit-done", "references");
  const templatesDir = join(officialRoot, "get-shit-done", "templates");

  // Collect all .md files from workflows/, references/, and templates/
  const sourceDirs: Array<{ dir: string; prefix: string }> = [
    { dir: workflowsDir, prefix: "workflows" },
    { dir: referencesDir, prefix: "references" },
    { dir: templatesDir, prefix: "templates" },
  ];

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const written: string[] = [];

  for (const { dir, prefix } of sourceDirs) {
    if (!existsSync(dir)) continue;

    // Recursively find .md files
    const files = readdirSync(dir, { recursive: true })
      .filter((f) => typeof f === "string" && f.endsWith(".md"))
      .map((f) => String(f))
      .sort();

    for (const relativePath of files) {
      const sourcePath = join(dir, relativePath);
      const source = readFileSync(sourcePath, "utf8");

      // Rewrite internal paths first, then apply workflow-specific dispatch transforms.
      const pathRewritten = rewriteWorkflowPaths(source, OFFICIAL_PACKAGE_NAME);
      const transformed = applyWorkflowTransforms(pathRewritten, OFFICIAL_PACKAGE_NAME, `${prefix}/${relativePath.replace(/\\/g, "/")}`);

      // Write to generated/workflows/{prefix}/{relativePath}
      const targetPath = join(outDir, prefix, relativePath);
      const targetDir = dirname(targetPath);
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetPath, transformed, "utf8");
      written.push(targetPath);
    }
  }

  return { written };
}

export function generateAll(options: GenerateAllOptions): GenerateAllResult {
  const prompts = generatePrompts({ officialRoot: options.officialRoot, outDir: options.promptsDir, safeRoot: options.safeRoot });
  const agents = generateAgents({ officialRoot: options.officialRoot, outDir: options.agentsDir, safeRoot: options.safeRoot });
  const workflowsDir = join(dirname(options.promptsDir), "workflows");
  const workflows = generateWorkflows({ officialRoot: options.officialRoot, outDir: workflowsDir, safeRoot: options.safeRoot });
  const projectRoot = options.safeRoot ?? dirname(resolve(options.promptsDir));
  writeOfficialVersionStamp({
    officialRoot: resolve(options.officialRoot),
    generatedRoot: dirname(resolve(options.promptsDir)),
  });
  // Compile and write the deterministic Tool Contract snapshot after prompts,
  // agents, and workflows are generated (D-01, D-04). This is the single
  // runtime source of truth for the pre-dispatch validateToolContract gate.
  // `safeRoot` is the project root (the cwd that owns the `generated/`
  // directory), so the snapshot lands at `<projectRoot>/generated/tool-contracts.json`.
  const contractSnapshot = compileToolContracts({ cwd: projectRoot });
  writeToolContractSnapshot(contractSnapshot, { cwd: projectRoot });
  const orchestrationSnapshot = compileOrchestrationContract({
    cwd: projectRoot,
    officialPackage: contractSnapshot.officialPackage,
    officialVersion: contractSnapshot.officialVersion,
  });
  writeOrchestrationContractSnapshot(orchestrationSnapshot, { cwd: projectRoot });
  return { prompts, agents, workflows };
}

export function writeOfficialVersionStamp(options: { officialRoot: string; generatedRoot: string }) {
  const packageJson = JSON.parse(readFileSync(join(options.officialRoot, "package.json"), "utf8")) as { name?: string; version?: string };
  mkdirSync(options.generatedRoot, { recursive: true });
  writeFileSync(join(options.generatedRoot, ".official-version.json"), JSON.stringify({
    packageName: packageJson.name ?? OFFICIAL_PACKAGE_NAME,
    version: packageJson.version ?? "unknown",
    officialRoot: options.officialRoot,
    generatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}
