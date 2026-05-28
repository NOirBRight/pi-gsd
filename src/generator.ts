import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateAgents, type GenerateAgentsResult } from "./agent-generator.js";
import { splitFrontmatter, writeFrontmatter } from "./frontmatter.js";
import { addPiSubagentGuidance, commandFileToPiPromptName, normalizeGsdSlashReferences } from "./prompt-transform.js";
import { assertSafeOutDir } from "./safe-output.js";

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
  agents: GenerateAgentsResult;
};

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
    const body = addPiSubagentGuidance(normalizeGsdSlashReferences(parsed.body));

    writeFileSync(targetPath, writeFrontmatter(parsed.data, body), "utf8");
    return targetPath;
  });

  return { written };
}

export function generateAll(options: GenerateAllOptions): GenerateAllResult {
  return {
    prompts: generatePrompts({ officialRoot: options.officialRoot, outDir: options.promptsDir, safeRoot: options.safeRoot }),
    agents: generateAgents({ officialRoot: options.officialRoot, outDir: options.agentsDir, safeRoot: options.safeRoot }),
  };
}
