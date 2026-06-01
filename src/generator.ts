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
} from "./prompt-transform.js";
import { OFFICIAL_PACKAGE_NAME } from "./official.js";
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

      // Transform workflow paths: rewrite node_modules absolute paths to generated/ relative paths
      const pathRewritten = rewriteWorkflowPaths(source, OFFICIAL_PACKAGE_NAME)
        .replace(/Skill\(skill=/g, "Skill(");

      // Apply the same prompt transform pipeline as command prompts
      const transformed = applyPromptTransforms(pathRewritten, OFFICIAL_PACKAGE_NAME);

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
  return { prompts, agents, workflows };
}
