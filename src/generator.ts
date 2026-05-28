import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, parse, relative, resolve } from "node:path";
import { splitFrontmatter, writeFrontmatter } from "./frontmatter.js";
import { commandFileToPiPromptName, normalizeGsdSlashReferences } from "./prompt-transform.js";

export type GeneratePromptsOptions = {
  officialRoot: string;
  outDir: string;
};

export type GeneratePromptsResult = {
  written: string[];
};

export function generatePrompts(options: GeneratePromptsOptions): GeneratePromptsResult {
  const officialRoot = resolve(options.officialRoot);
  const outDir = resolve(options.outDir);

  assertSafeOutDir(officialRoot, outDir);

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
    const body = normalizeGsdSlashReferences(parsed.body);

    writeFileSync(targetPath, writeFrontmatter(parsed.data, body), "utf8");
    return targetPath;
  });

  return { written };
}

function assertSafeOutDir(officialRoot: string, outDir: string) {
  if (
    parse(outDir).root === outDir ||
    samePath(outDir, process.cwd()) ||
    samePath(outDir, officialRoot) ||
    isInside(outDir, officialRoot) ||
    isInside(officialRoot, outDir)
  ) {
    throw new Error(`Unsafe output directory: ${outDir}`);
  }
}

function samePath(left: string, right: string) {
  return normalizePath(left) === normalizePath(right);
}

function isInside(parent: string, child: string) {
  const childRelativePath = relative(parent, child);
  return childRelativePath !== "" && !childRelativePath.startsWith("..") && !isAbsolute(childRelativePath);
}

function normalizePath(path: string) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
