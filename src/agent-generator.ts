import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { transformOfficialAgentMarkdown } from "./agent-transform.js";
import { assertSafeOutDir } from "./safe-output.js";

export type GenerateAgentsOptions = {
  officialRoot: string;
  outDir: string;
  safeRoot?: string;
};

export type GenerateAgentsResult = {
  written: string[];
};

export function generateAgents(options: GenerateAgentsOptions): GenerateAgentsResult {
  const officialRoot = resolve(options.officialRoot);
  const outDir = resolve(options.outDir);

  assertSafeOutDir({ officialRoot, outDir, safeRoot: options.safeRoot });

  const agentsDir = join(officialRoot, "agents");
  const fileNames = readdirSync(agentsDir).filter((fileName) => fileName.endsWith(".md")).sort((a, b) => a.localeCompare(b));

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const written = fileNames.map((fileName) => {
    const transformed = transformOfficialAgentMarkdown(readFileSync(join(agentsDir, fileName), "utf8"));
    const targetPath = join(outDir, fileName);
    writeFileSync(targetPath, transformed.markdown, "utf8");
    return targetPath;
  });

  return { written };
}
