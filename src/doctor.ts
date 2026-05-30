import { accessSync, constants as fsConstants, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { generateAgents } from "./agent-generator.js";
import { syncAgents, type AgentSyncScope } from "./agent-sync.js";
import { buildPiSubagentsTempRoot, TEMP_DIR_SUBDIRS } from "./extension.js";
import { generatePrompts } from "./generator.js";
import { resolveOfficialPackage } from "./official.js";
import { resolvePiSubagentsPackage } from "./pi-subagents.js";

export type AclCheckOptions = {
  /** Override the temp root path (defaults to buildPiSubagentsTempRoot()) */
  tempRoot?: string;
  /** Override filesystem operations (for testing ACL failure scenarios) */
  fs?: { accessSync: typeof accessSync };
};

export type AclCheckResult = {
  ok: boolean;
  messages: string[];
};

export type DoctorOptions = {
  startDir?: string;
  generatedPromptsDir: string;
  generatedAgentsDir?: string;
  agentSyncScope?: AgentSyncScope;
  piSubagentsResolver?: typeof resolvePiSubagentsPackage;
  /** Override ACL checker (for testing) — defaults to checkPiSubagentsTempAcl */
  aclChecker?: () => AclCheckResult;
};

export type DoctorResult = {
  ok: boolean;
  messages: string[];
};

/**
 * Checks ACL integrity of pi-subagents temp directories.
 * For each subdir in TEMP_DIR_SUBDIRS: verifies read/write access via accessSync.
 * If any throws EACCES/EPERM, reports CORRUPTED with repair instructions.
 * If all accessible, reports ok. Never throws — wraps in try/catch.
 */
export function checkPiSubagentsTempAcl(options?: AclCheckOptions): AclCheckResult {
  const messages: string[] = [];
  let ok = true;
  try {
    const fsImpl = options?.fs ?? { accessSync };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();

    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join(tempRoot, subdir);
      try {
        fsImpl.accessSync(dirPath, fsConstants.R_OK | fsConstants.W_OK);
      } catch (accessError: unknown) {
        const errorCode = typeof accessError === "object" && accessError !== null && "code" in accessError
          ? (accessError as { code: string }).code
          : "";
        if (errorCode === "EACCES" || errorCode === "EPERM") {
          ok = false;
          // Escape username for PowerShell: wrap in single quotes and double any embedded single quotes
          const rawUsername = process.env.USERNAME ?? "$USERNAME";
          const psEscapedUsername = `'${rawUsername.replace(/'/g, "''")}'`;
          messages.push(
            `pi-subagents temp ACL: CORRUPTED — directory ${dirPath} is inaccessible. ` +
            `Run this from elevated PowerShell: takeown /f "${dirPath}" /r /d Y; ` +
            `icacls "${dirPath}" /grant ${psEscapedUsername}:F /t; ` +
            `Remove-Item -Recurse -Force "${dirPath}"`,
          );
        } else if (errorCode === "ENOENT") {
          ok = false;
          messages.push(`pi-subagents temp ACL: MISSING — directory ${dirPath} does not exist. Subagents may fail until it is created.`);
        } else {
          ok = false;
          messages.push(`pi-subagents temp ACL: check error (${errorCode}): ${dirPath}`);
        }
      }
    }

    if (ok && messages.length === 0) {
      messages.push("pi-subagents temp ACL: ok");
    }
  } catch (error: unknown) {
    ok = false;
    messages.push(
      `pi-subagents temp ACL: check failed (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  return { ok, messages };
}

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

  // ACL corruption check for pi-subagents temp directories
  const aclChecker = options.aclChecker ?? checkPiSubagentsTempAcl;
  const aclResult = aclChecker();
  ok = ok && aclResult.ok;
  messages.push(...aclResult.messages);

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
