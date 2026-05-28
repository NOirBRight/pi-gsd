import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { generatePrompts } from "./generator.js";
import { resolveOfficialPackage } from "./official.js";

export type DoctorOptions = {
  startDir?: string;
  generatedPromptsDir: string;
};

export type DoctorResult = {
  ok: boolean;
  messages: string[];
};

export function runDoctor(options: DoctorOptions): DoctorResult {
  const officialPackage = resolveOfficialPackage({ startDir: options.startDir });
  const messages = [
    `official package: ${officialPackage.packageName}@${officialPackage.version}`,
    `official root: ${officialPackage.packageRoot}`,
  ];
  const tempDir = mkdtempSync(join(tmpdir(), "pi-gsd-doctor-"));

  try {
    const expectedDir = join(tempDir, "prompts");
    const expected = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: expectedDir });
    const expectedFileNames = new Set(expected.written.map((expectedPath) => basename(expectedPath)));
    let ok = true;

    for (const expectedPath of expected.written) {
      const fileName = basename(expectedPath);
      const actualPath = join(options.generatedPromptsDir, fileName);
      let actual: string;

      try {
        actual = readFileSync(actualPath, "utf8");
      } catch (error) {
        if (isMissingFileError(error)) {
          ok = false;
          messages.push(`missing generated prompt: ${fileName}`);
          continue;
        }

        throw error;
      }

      const expectedContent = readFileSync(expectedPath, "utf8");
      if (normalizeLineEndings(actual) !== normalizeLineEndings(expectedContent)) {
        ok = false;
        messages.push(`stale generated prompt: ${fileName}`);
      }
    }

    for (const fileName of readGeneratedPromptFileNames(options.generatedPromptsDir)) {
      if (!expectedFileNames.has(fileName)) {
        ok = false;
        messages.push(`unexpected generated prompt: ${fileName}`);
      }
    }

    return { ok, messages };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizeLineEndings(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function readGeneratedPromptFileNames(generatedPromptsDir: string) {
  try {
    return readdirSync(generatedPromptsDir).filter((name) => name.endsWith(".md")).sort();
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}
