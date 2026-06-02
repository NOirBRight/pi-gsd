import { accessSync, constants as fsConstants, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { generateAgents } from "./agent-generator.js";
import { syncAgents, type AgentSyncScope } from "./agent-sync.js";
import { buildPiSubagentsTempRoot, TEMP_DIR_SUBDIRS } from "./extension.js";
import { generatePrompts, generateWorkflows } from "./generator.js";
import { loadOfficialWorkflowConfig } from "./orchestrator/official-config.js";
import { resolveOfficialPackage } from "./official.js";
import { resolvePiSubagentsPackage } from "./pi-subagents.js";
import { resolveRpivPackage, RPIV_PACKAGE_NAME } from "./rpiv.js";

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
  generatedWorkflowsDir?: string;
  agentSyncScope?: AgentSyncScope;
  piSubagentsResolver?: typeof resolvePiSubagentsPackage;
  /** Override ACL checker (for testing) — defaults to checkPiSubagentsTempAcl */
  aclChecker?: () => AclCheckResult;
  /** Override rpiv resolver (for testing) — defaults to resolveRpivPackage */
  rpivResolver?: typeof resolveRpivPackage;
};

export type DoctorResult = {
  ok: boolean;
  messages: string[];
};

const REQUIRED_OFFICIAL_WORKFLOW_SCHEMA_KEYS = [
  "workflow.research",
  "workflow.plan_check",
  "workflow.verifier",
  "workflow.nyquist_validation",
  "workflow.ai_integration_phase",
  "workflow.ui_phase",
  "workflow.ui_safety_gate",
  "workflow.ui_review",
  "workflow.auto_advance",
  "workflow.node_repair",
  "workflow.node_repair_budget",
  "workflow.research_before_questions",
  "workflow.skip_discuss",
  "workflow.auto_prune_state",
  "workflow.use_worktrees",
  "workflow.code_review",
  "workflow.code_review_depth",
  "workflow.code_review_command",
  "workflow.plan_bounce",
  "workflow.plan_bounce_passes",
  "workflow.plan_review_convergence",
  "workflow.post_planning_gaps",
  "workflow.security_enforcement",
  "workflow.subagent_timeout",
  "workflow.inline_plan_threshold",
];

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
  ok = checkOfficialConfigParity({ officialRoot: officialPackage.packageRoot, messages }) && ok;

  try {
    const piSubagentsResolver = options.piSubagentsResolver ?? resolvePiSubagentsPackage;
    const piSubagents = piSubagentsResolver({ startDir: options.startDir });
    messages.push(`pi-subagents package: ${piSubagents.packageName}@${piSubagents.version}`);
  } catch (error) {
    ok = false;
    messages.push(`pi-subagents package: missing (${error instanceof Error ? error.message : String(error)})`);
  }

  // rpiv-ask-user-question availability check (warning, not error)
  const rpivResolver = options.rpivResolver ?? resolveRpivPackage;
  try {
    const rpiv = rpivResolver({ startDir: options.startDir });
    messages.push(`rpiv-ask-user-question: ok (${rpiv.packageName}@${rpiv.version})`);
  } catch {
    messages.push(
      `rpiv-ask-user-question: missing — AskUserQuestion-dependent workflows (discuss, plan, etc.) will use --text fallback mode. ` +
      `Install with: pi install npm:${RPIV_PACKAGE_NAME}`,
    );
  }

  // ACL corruption check for pi-subagents temp directories
  const aclChecker = options.aclChecker ?? checkPiSubagentsTempAcl;
  const aclResult = aclChecker();
  ok = ok && aclResult.ok;
  messages.push(...aclResult.messages);
  ok = checkGeneratedOfficialVersion({
    generatedRoot: dirname(options.generatedPromptsDir),
    expectedPackageName: officialPackage.packageName,
    expectedVersion: officialPackage.version,
    messages,
  }) && ok;

  const tempDir = mkdtempSync(join(tmpdir(), "pi-gsd-doctor-"));

  try {
    const expectedDir = join(tempDir, "prompts");
    const expected = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: expectedDir });
    const promptsOk = compareGeneratedFiles({ expectedPaths: expected.written, actualDir: options.generatedPromptsDir, label: "prompt", messages });
    ok = ok && promptsOk;

    if (options.generatedWorkflowsDir) {
      const expectedWorkflowsDir = join(tempDir, "workflows");
      const expectedWorkflows = generateWorkflows({ officialRoot: officialPackage.packageRoot, outDir: expectedWorkflowsDir });
      const workflowsOk = compareGeneratedFiles({
        expectedPaths: expectedWorkflows.written,
        expectedDir: expectedWorkflowsDir,
        actualDir: options.generatedWorkflowsDir,
        label: "workflow",
        messages,
      });
      ok = ok && workflowsOk;
      if (workflowsOk) messages.push("generated workflows: ok");
    }

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

function checkOfficialConfigParity(options: { officialRoot: string; messages: string[] }) {
  const officialConfig = loadOfficialWorkflowConfig({ officialRoot: options.officialRoot });
  const schemaKeys = new Set(officialConfig.schema.workflowKeys);
  const missing = REQUIRED_OFFICIAL_WORKFLOW_SCHEMA_KEYS.filter((key) => !schemaKeys.has(key));

  if (missing.length > 0) {
    options.messages.push(`official config schema parity: missing workflow keys (${missing.join(", ")})`);
    return false;
  }

  options.messages.push("official config schema parity: ok");
  return true;
}

function checkGeneratedOfficialVersion(options: { generatedRoot: string; expectedPackageName: string; expectedVersion: string; messages: string[] }) {
  const metadataPath = join(options.generatedRoot, ".official-version.json");
  let metadata: unknown;

  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch (error) {
    if (isMissingFileError(error)) {
      options.messages.push("generated official version: missing (run generate to enable version drift checks)");
      return false;
    }

    options.messages.push(`generated official version invalid: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  if (!isRecord(metadata)) {
    options.messages.push("generated official version invalid: metadata is not an object");
    return false;
  }

  const packageName = typeof metadata.packageName === "string" ? metadata.packageName : undefined;
  const version = typeof metadata.version === "string" ? metadata.version : undefined;
  if (packageName !== options.expectedPackageName || version !== options.expectedVersion) {
    options.messages.push(`generated official version stale: expected ${options.expectedPackageName}@${options.expectedVersion}, found ${packageName ?? "unknown"}@${version ?? "unknown"}`);
    return false;
  }

  options.messages.push(`generated official version: ok (${options.expectedPackageName}@${options.expectedVersion})`);
  return true;
}

function compareGeneratedFiles(options: { expectedPaths: string[]; expectedDir?: string; actualDir: string; label: string; messages: string[] }) {
  const expectedFileNames = new Set(options.expectedPaths.map((expectedPath) => expectedResourceName(expectedPath, options.expectedDir)));
  let ok = true;

  for (const expectedPath of options.expectedPaths) {
    const fileName = expectedResourceName(expectedPath, options.expectedDir);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLineEndings(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function expectedResourceName(expectedPath: string, expectedDir: string | undefined) {
  if (!expectedDir) return basename(expectedPath);
  return relative(expectedDir, expectedPath).replace(/\\/g, "/");
}

function readGeneratedMarkdownFileNames(generatedPromptsDir: string) {
  try {
    return readdirSync(generatedPromptsDir, { recursive: true })
      .filter((name) => typeof name === "string" && name.endsWith(".md"))
      .map((name) => String(name).replace(/\\/g, "/"))
      .sort();
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}
