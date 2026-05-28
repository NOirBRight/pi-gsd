import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { generateAgents } from "./agent-generator.js";
import { syncAgents, type AgentSyncScope } from "./agent-sync.js";
import { generatePrompts } from "./generator.js";
import { resolveOfficialPackage } from "./official.js";
import { resolvePiSubagentsPackage } from "./pi-subagents.js";

export type DoctorOptions = {
  startDir?: string;
  generatedPromptsDir: string;
  generatedAgentsDir?: string;
  agentSyncScope?: AgentSyncScope;
  piSubagentsResolver?: typeof resolvePiSubagentsPackage;
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
  let ok = true;
  try {
    const piSubagentsResolver = options.piSubagentsResolver ?? resolvePiSubagentsPackage;
    const piSubagents = piSubagentsResolver({ startDir: options.startDir });
    messages.push(`pi-subagents package: ${piSubagents.packageName}@${piSubagents.version}`);
  } catch (error) {
    ok = false;
    messages.push(`pi-subagents package: missing (${error instanceof Error ? error.message : String(error)})`);
  }
  const tempDir = mkdtempSync(join(tmpdir(), "pi-gsd-doctor-"));

  try {
    const expectedDir = join(tempDir, "prompts");
    const expected = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: expectedDir });
    const promptsOk = compareGeneratedFiles({ expectedPaths: expected.written, actualDir: options.generatedPromptsDir, label: "prompt", messages });
    ok = ok && promptsOk;

    if (options.generatedAgentsDir) {
      const expectedAgentsDir = join(tempDir, "agents");
      const expectedAgents = generateAgents({ officialRoot: officialPackage.packageRoot, outDir: expectedAgentsDir });
      const agentOk = compareGeneratedFiles({
        expectedPaths: expectedAgents.written,
        actualDir: options.generatedAgentsDir,
        label: "agent",
        messages,
      });
      ok = ok && agentOk;
      if (agentOk) messages.push("generated agents: ok");

      const syncResult = syncAgents({
        generatedAgentsDir: options.generatedAgentsDir,
        cwd: options.startDir ?? process.cwd(),
        officialRoot: officialPackage.packageRoot,
        scope: options.agentSyncScope ?? "project",
        check: true,
      });
      ok = ok && syncResult.ok;
      const syncScope = options.agentSyncScope ?? "project";
      messages.push(syncResult.ok ? `${syncScope} synced agents: ok` : `${syncScope} synced agents: stale or missing`);
      messages.push(...syncResult.messages);
    }

    return { ok, messages };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function compareGeneratedFiles(options: { expectedPaths: string[]; actualDir: string; label: string; messages: string[] }) {
  const expectedFileNames = new Set(options.expectedPaths.map((expectedPath) => basename(expectedPath)));
  let ok = true;

  for (const expectedPath of options.expectedPaths) {
    const fileName = basename(expectedPath);
    const actualPath = join(options.actualDir, fileName);
    let actual: string;

    try {
      actual = readFileSync(actualPath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        ok = false;
        options.messages.push(`missing generated ${options.label}: ${fileName}`);
        continue;
      }

      throw error;
    }

    const expectedContent = readFileSync(expectedPath, "utf8");
    if (normalizeLineEndings(actual) !== normalizeLineEndings(expectedContent)) {
      ok = false;
      options.messages.push(`stale generated ${options.label}: ${fileName}`);
    }
  }

  for (const fileName of readGeneratedMarkdownFileNames(options.actualDir)) {
    if (!expectedFileNames.has(fileName)) {
      ok = false;
      options.messages.push(`unexpected generated ${options.label}: ${fileName}`);
    }
  }

  return ok;
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizeLineEndings(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function readGeneratedMarkdownFileNames(generatedPromptsDir: string) {
  try {
    return readdirSync(generatedPromptsDir).filter((name) => name.endsWith(".md")).sort();
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}
