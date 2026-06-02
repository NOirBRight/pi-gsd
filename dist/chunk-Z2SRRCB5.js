import {
  OFFICIAL_PACKAGE_NAME,
  TEMP_DIR_SUBDIRS,
  addPiSubagentGuidance,
  buildPiSubagentsTempRoot,
  commandFileToPiPromptName,
  compileOrchestrationContract,
  compileToolContracts,
  loadOfficialWorkflowConfig,
  normalizeGsdSlashReferences,
  resolveOfficialPackage,
  splitCodeFences,
  splitFrontmatter,
  transformAskUserQuestionForPi,
  transformGsdRunLauncher,
  transformSkillDispatchForPi,
  transformSubagentDispatchForPi,
  transformWorkflowDispatchForPi,
  verifyOrchestrationContractSnapshot,
  verifyToolContractSnapshot,
  writeFrontmatter,
  writeOrchestrationContractSnapshot,
  writeToolContractSnapshot
} from "./chunk-NGPOIDO5.js";

// src/agent-transform.ts
var OFFICIAL_ROOT_PLACEHOLDER = "__PI_GSD_OFFICIAL_ROOT__";
var toolNameMap = /* @__PURE__ */ new Map([
  ["read", "read"],
  ["write", "write"],
  ["edit", "edit"],
  ["bash", "bash"],
  ["grep", "grep"],
  ["glob", "find"],
  ["ls", "ls"],
  ["list", "ls"]
]);
function transformOfficialAgentMarkdown(input) {
  const parsed = splitFrontmatter(input);
  const name = scalar(parsed.data.name);
  const description = scalar(parsed.data.description);
  if (!name || !description) {
    throw new Error("Official agent markdown must include name and description frontmatter.");
  }
  const { mappedTools, unsupportedTools } = mapOfficialTools(parsed.data.tools);
  const body = rewriteOfficialAgentBody(parsed.body, unsupportedTools);
  const frontmatter = { name, description: normalizeGsdSlashReferences(description) };
  if (mappedTools.length > 0) {
    frontmatter.tools = mappedTools.join(", ");
  }
  return {
    markdown: writeAgentFrontmatter(frontmatter, body),
    unsupportedTools
  };
}
function materializeOfficialAgentPaths(input, officialRoot) {
  const posixRoot = officialRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  return input.replaceAll(OFFICIAL_ROOT_PLACEHOLDER, posixRoot);
}
function rewriteOfficialAgentBody(body, unsupportedTools) {
  let rewritten = normalizeGsdSlashReferences(body).replace(/@(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `@${OFFICIAL_ROOT_PLACEHOLDER}/get-shit-done/`).replace(/(^|[^@])(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `$1${OFFICIAL_ROOT_PLACEHOLDER}/get-shit-done/`);
  rewritten = rewritten.replace(/subagent_type="general-purpose"/g, 'subagent_type="general"');
  rewritten = rewriteAgentDispatch(rewritten);
  if (unsupportedTools.length === 0) {
    return rewritten;
  }
  const note = `

> Pi adapter note: unsupported official tools omitted: ${unsupportedTools.join(", ")}
`;
  return `${note}${rewritten}`;
}
function mapOfficialTools(value) {
  const rawTools = normalizeToolList(value);
  const mappedTools = [];
  const unsupportedTools = [];
  for (const rawTool of rawTools) {
    const mapped = toolNameMap.get(rawTool.toLowerCase());
    if (!mapped) {
      unsupportedTools.push(rawTool);
      continue;
    }
    if (!mappedTools.includes(mapped)) {
      mappedTools.push(mapped);
    }
  }
  return { mappedTools, unsupportedTools };
}
function normalizeToolList(value) {
  if (typeof value === "string") {
    return value.split(",").map((tool) => tool.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((tool) => tool.split(",")).map((tool) => tool.trim()).filter(Boolean);
  }
  return [];
}
function scalar(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function writeAgentFrontmatter(data, body) {
  const lines = [
    `name: ${data.name}`,
    `description: ${data.description}`
  ];
  if (typeof data.tools === "string" && data.tools) {
    lines.push(`tools: ${data.tools}`);
  }
  return `---
${lines.join("\n")}
---
${body}`;
}
function rewriteAgentDispatch(text) {
  return text.replace(
    /Agent\(subagent_type="([^"]+)",\s*prompt="([\s\S]*?)"\)/g,
    (_match, agentType, promptText) => {
      return `subagent({agent: "${agentType}", task: "${promptText}"})`;
    }
  );
}

// src/agent-sync.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
var generatedMarker = "<!-- pi-gsd generated agent -->";
function syncAgents(options) {
  const generatedAgentsDir = resolve(options.generatedAgentsDir);
  const targetDir = resolveAgentTargetDir(options.cwd, options.scope);
  const messages = [];
  const written = [];
  let ok = true;
  const fileNames = readGeneratedAgentFileNames(generatedAgentsDir);
  const generatedFileNames = new Set(fileNames);
  if (!options.check && !options.dryRun) {
    mkdirSync(targetDir, { recursive: true });
  }
  for (const fileName of fileNames) {
    const source = readFileSync(join(generatedAgentsDir, fileName), "utf8");
    const targetPath = join(targetDir, fileName);
    const expected = withGeneratedMarker(materializeOfficialAgentPaths(source, options.officialRoot));
    const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : void 0;
    if (existing !== void 0 && !isGeneratedSyncedAgent(existing)) {
      ok = false;
      messages.push(`refusing to overwrite unowned agent: ${targetPath}`);
      continue;
    }
    if (existing === expected) {
      messages.push(`synced agent current: ${fileName}`);
      continue;
    }
    if (options.check) {
      ok = false;
      messages.push(`${existing === void 0 ? "missing" : "stale"} synced agent: ${fileName}`);
      continue;
    }
    messages.push(`${options.dryRun ? "would sync" : "synced"} agent: ${fileName}`);
    if (!options.dryRun) {
      writeFileSync(targetPath, expected, "utf8");
      written.push(targetPath);
    }
  }
  if (options.check) {
    for (const fileName of readGeneratedAgentFileNames(targetDir)) {
      if (generatedFileNames.has(fileName)) {
        continue;
      }
      const target = readFileSync(join(targetDir, fileName), "utf8");
      if (isGeneratedSyncedAgent(target)) {
        ok = false;
        messages.push(`stale synced agent: ${fileName}`);
      }
    }
  }
  return { ok, messages, written };
}
function resolveAgentTargetDir(cwd, scope) {
  if (scope === "project") {
    return join(resolve(cwd), ".pi", "agents");
  }
  return join(homedir(), ".pi", "agent", "agents");
}
function readGeneratedAgentFileNames(generatedAgentsDir) {
  try {
    return readdirSync(generatedAgentsDir).filter((fileName) => fileName.endsWith(".md") && fileName.startsWith("gsd-")).sort();
  } catch {
    return [];
  }
}
function withGeneratedMarker(markdown) {
  const opening = /^---\r?\n/.exec(markdown);
  if (!opening) {
    return `${generatedMarker}
${markdown}`;
  }
  const restStart = opening[0].length;
  const closing = /\r?\n---\r?\n/.exec(markdown.slice(restStart));
  if (!closing) {
    return `${generatedMarker}
${markdown}`;
  }
  const insertAt = restStart + closing.index + closing[0].length;
  return `${markdown.slice(0, insertAt)}${generatedMarker}
${markdown.slice(insertAt)}`;
}
function isGeneratedSyncedAgent(content) {
  return content.includes(generatedMarker);
}

// src/agent-generator.ts
import { mkdirSync as mkdirSync2, readdirSync as readdirSync3, readFileSync as readFileSync2, rmSync, writeFileSync as writeFileSync2 } from "fs";
import { join as join2, resolve as resolve3 } from "path";

// src/safe-output.ts
import { existsSync as existsSync2, readdirSync as readdirSync2, statSync } from "fs";
import { isAbsolute, parse, relative, resolve as resolve2 } from "path";
function assertSafeOutDir(options) {
  const officialRoot = resolve2(options.officialRoot);
  const outDir = resolve2(options.outDir);
  const safeRoot = options.safeRoot ? resolve2(options.safeRoot) : void 0;
  if (parse(outDir).root === outDir || samePath(outDir, process.cwd()) || safeRoot !== void 0 && samePath(outDir, safeRoot) || samePath(outDir, officialRoot) || isInside(outDir, officialRoot) || isInside(officialRoot, outDir)) {
    throw new Error(`Unsafe output directory: ${outDir}`);
  }
  if (existsSync2(outDir) && statSync(outDir).isDirectory() && readdirSync2(outDir).length > 0 && !hasGeneratedSegment(outDir)) {
    throw new Error(`Unsafe output directory: ${outDir}`);
  }
}
function samePath(left, right) {
  return normalizePath(left) === normalizePath(right);
}
function isInside(parent, child) {
  const childRelativePath = relative(parent, child);
  return childRelativePath !== "" && !childRelativePath.startsWith("..") && !isAbsolute(childRelativePath);
}
function normalizePath(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
function hasGeneratedSegment(path) {
  return normalizePath(path).split(/[\\/]+/).includes("generated");
}

// src/agent-generator.ts
function generateAgents(options) {
  const officialRoot = resolve3(options.officialRoot);
  const outDir = resolve3(options.outDir);
  assertSafeOutDir({ officialRoot, outDir, safeRoot: options.safeRoot });
  const agentsDir = join2(officialRoot, "agents");
  const fileNames = readdirSync3(agentsDir).filter((fileName) => fileName.endsWith(".md")).sort((a, b) => a.localeCompare(b));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync2(outDir, { recursive: true });
  const written = fileNames.map((fileName) => {
    const transformed = transformOfficialAgentMarkdown(readFileSync2(join2(agentsDir, fileName), "utf8"));
    const targetPath = join2(outDir, fileName);
    writeFileSync2(targetPath, transformed.markdown, "utf8");
    return targetPath;
  });
  return { written };
}

// src/generator.ts
import { mkdirSync as mkdirSync3, readdirSync as readdirSync4, readFileSync as readFileSync3, rmSync as rmSync2, writeFileSync as writeFileSync3, existsSync as existsSync3 } from "fs";
import { dirname, join as join3, resolve as resolve4 } from "path";

// src/rewrite-workflow-paths.ts
var GSD_DATA_DIR = "get-shit-done";
function rewriteWorkflowPaths(input, packageName = OFFICIAL_PACKAGE_NAME) {
  const escapedFull = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subdirs = "(?:workflows|references|templates)";
  const fileExt = "\\.md";
  const tildePattern = new RegExp(
    `~/.claude/${GSD_DATA_DIR}/(${subdirs}/[^\\s'"${"`"}\\)]+${fileExt})`,
    "g"
  );
  const homePattern = new RegExp(
    `\\$HOME/.claude/${GSD_DATA_DIR}/(${subdirs}/[^\\s'"${"`"}\\)]+${fileExt})`,
    "g"
  );
  const nodeModulesPattern = new RegExp(
    `(?:[A-Za-z]:[/\\\\]|/)[^\\s'"${"`"}]*?node_modules/${escapedFull}/${GSD_DATA_DIR}/(${subdirs}/[^\\s'"${"`"}\\)]+${fileExt})`,
    "g"
  );
  const segments = splitCodeFences(input);
  let changed = false;
  const result = segments.map(({ segment, isCode }) => {
    if (isCode) return segment;
    let transformed = segment.replace(tildePattern, (_match, relativePath) => {
      return `generated/workflows/${relativePath}`;
    }).replace(homePattern, (_match, relativePath) => {
      return `generated/workflows/${relativePath}`;
    }).replace(nodeModulesPattern, (_match, relativePath) => {
      return `generated/workflows/${relativePath}`;
    });
    if (transformed !== segment) changed = true;
    return transformed;
  }).join("");
  return changed ? result : input;
}

// src/generator.ts
function applyPromptTransforms(body, _packageName) {
  return transformSkillDispatchForPi(
    transformSubagentDispatchForPi(
      transformAskUserQuestionForPi(
        addPiSubagentGuidance(normalizeGsdSlashReferences(transformGsdRunLauncher(body)))
      )
    )
  );
}
function applyWorkflowTransforms(body, packageName, workflowPath) {
  const transformed = normalizeWorkflowDispatchInstructionPhrases(applyEscapedWorkflowDispatchTransforms(
    applyPromptTransforms(transformWorkflowDispatchForPi(body), packageName)
  ));
  return workflowPath === "workflows/code-review-fix.md" ? fixReviewFixReportPathEnv(transformed) : transformed;
}
function applyEscapedWorkflowDispatchTransforms(body) {
  return body.replace(/\b(?:Skill|Workflow|SlashCommand|Agent)\((?:[^()\\]|\\.)*\)/g, (call) => {
    const normalized = call.replace(/\\"/g, '"').replace(/\\'/g, "'");
    const transformed = transformWorkflowDispatchForPi(normalized);
    return transformed === normalized ? call : transformed;
  });
}
function normalizeWorkflowDispatchInstructionPhrases(body) {
  return body.replace(/\binvoke Invoke\s+/g, "invoke ");
}
function fixReviewFixReportPathEnv(body) {
  return body.replace(/\bREVIEW_PATH="\$\{REVIEW_PATH\}" node -e/g, 'REVIEW_PATH="${REVIEW_PATH}" FIX_REPORT_PATH="${FIX_REPORT_PATH}" node -e');
}
function generatePrompts(options) {
  const officialRoot = resolve4(options.officialRoot);
  const outDir = resolve4(options.outDir);
  assertSafeOutDir({ officialRoot, outDir, safeRoot: options.safeRoot });
  const commandsDir = join3(officialRoot, "commands", "gsd");
  const fileNames = readdirSync4(commandsDir).filter((fileName) => fileName.endsWith(".md")).sort((a, b) => a.localeCompare(b));
  rmSync2(outDir, { recursive: true, force: true });
  mkdirSync3(outDir, { recursive: true });
  const written = fileNames.map((fileName) => {
    const source = readFileSync3(join3(commandsDir, fileName), "utf8");
    const parsed = splitFrontmatter(source);
    const targetPath = join3(outDir, commandFileToPiPromptName(fileName));
    const body = applyPromptTransforms(rewriteWorkflowPaths(parsed.body, OFFICIAL_PACKAGE_NAME), OFFICIAL_PACKAGE_NAME);
    writeFileSync3(targetPath, writeFrontmatter(parsed.data, body), "utf8");
    return targetPath;
  });
  return { written };
}
function generateWorkflows(options) {
  const officialRoot = resolve4(options.officialRoot);
  const outDir = resolve4(options.outDir);
  assertSafeOutDir({ officialRoot, outDir, safeRoot: options.safeRoot });
  const workflowsDir = join3(officialRoot, "get-shit-done", "workflows");
  const referencesDir = join3(officialRoot, "get-shit-done", "references");
  const templatesDir = join3(officialRoot, "get-shit-done", "templates");
  const sourceDirs = [
    { dir: workflowsDir, prefix: "workflows" },
    { dir: referencesDir, prefix: "references" },
    { dir: templatesDir, prefix: "templates" }
  ];
  rmSync2(outDir, { recursive: true, force: true });
  mkdirSync3(outDir, { recursive: true });
  const written = [];
  for (const { dir, prefix } of sourceDirs) {
    if (!existsSync3(dir)) continue;
    const files = readdirSync4(dir, { recursive: true }).filter((f) => typeof f === "string" && f.endsWith(".md")).map((f) => String(f)).sort();
    for (const relativePath of files) {
      const sourcePath = join3(dir, relativePath);
      const source = readFileSync3(sourcePath, "utf8");
      const pathRewritten = rewriteWorkflowPaths(source, OFFICIAL_PACKAGE_NAME);
      const transformed = applyWorkflowTransforms(pathRewritten, OFFICIAL_PACKAGE_NAME, `${prefix}/${relativePath.replace(/\\/g, "/")}`);
      const targetPath = join3(outDir, prefix, relativePath);
      const targetDir = dirname(targetPath);
      mkdirSync3(targetDir, { recursive: true });
      writeFileSync3(targetPath, transformed, "utf8");
      written.push(targetPath);
    }
  }
  return { written };
}
function generateAll(options) {
  const prompts = generatePrompts({ officialRoot: options.officialRoot, outDir: options.promptsDir, safeRoot: options.safeRoot });
  const agents = generateAgents({ officialRoot: options.officialRoot, outDir: options.agentsDir, safeRoot: options.safeRoot });
  const workflowsDir = join3(dirname(options.promptsDir), "workflows");
  const workflows = generateWorkflows({ officialRoot: options.officialRoot, outDir: workflowsDir, safeRoot: options.safeRoot });
  const projectRoot = options.safeRoot ?? dirname(resolve4(options.promptsDir));
  writeOfficialVersionStamp({
    officialRoot: resolve4(options.officialRoot),
    generatedRoot: dirname(resolve4(options.promptsDir))
  });
  const contractSnapshot = compileToolContracts({ cwd: projectRoot });
  writeToolContractSnapshot(contractSnapshot, { cwd: projectRoot });
  const orchestrationSnapshot = compileOrchestrationContract({
    cwd: projectRoot,
    officialPackage: contractSnapshot.officialPackage,
    officialVersion: contractSnapshot.officialVersion
  });
  writeOrchestrationContractSnapshot(orchestrationSnapshot, { cwd: projectRoot });
  return { prompts, agents, workflows };
}
function writeOfficialVersionStamp(options) {
  const packageJson = JSON.parse(readFileSync3(join3(options.officialRoot, "package.json"), "utf8"));
  mkdirSync3(options.generatedRoot, { recursive: true });
  writeFileSync3(join3(options.generatedRoot, ".official-version.json"), JSON.stringify({
    packageName: packageJson.name ?? OFFICIAL_PACKAGE_NAME,
    version: packageJson.version ?? "unknown",
    officialRoot: options.officialRoot,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }, null, 2), "utf8");
}

// src/pi-subagents.ts
import { readFileSync as readFileSync4 } from "fs";
import { createRequire } from "module";
import { dirname as dirname2 } from "path";
var PI_SUBAGENTS_PACKAGE_NAME = "pi-subagents";
function resolvePiSubagentsPackage(options = {}) {
  const startDir = options.startDir ?? process.cwd();
  const require2 = createRequire(import.meta.url);
  let packageJsonPath;
  try {
    packageJsonPath = require2.resolve(`${PI_SUBAGENTS_PACKAGE_NAME}/package.json`, { paths: [startDir] });
  } catch {
    packageJsonPath = require2.resolve(`${PI_SUBAGENTS_PACKAGE_NAME}/package.json`);
  }
  const packageJson = JSON.parse(readFileSync4(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string") {
    throw new Error("pi-subagents package.json is missing a string version.");
  }
  return { packageRoot: dirname2(packageJsonPath), packageName: PI_SUBAGENTS_PACKAGE_NAME, version: packageJson.version };
}

// src/doctor.ts
import { accessSync, constants as fsConstants, mkdtempSync, readdirSync as readdirSync5, readFileSync as readFileSync6, rmSync as rmSync3 } from "fs";
import { tmpdir } from "os";
import { basename, dirname as dirname4, join as join5, relative as relative2 } from "path";

// src/rpiv.ts
import { readFileSync as readFileSync5 } from "fs";
import { createRequire as createRequire2 } from "module";
import { homedir as homedir2 } from "os";
import { dirname as dirname3, join as join4 } from "path";
var RPIV_PACKAGE_NAME = "@juicesharp/rpiv-ask-user-question";
function resolveRpivPackage(options = {}) {
  const startDir = options.startDir ?? process.cwd();
  const require2 = createRequire2(import.meta.url);
  const resolvePaths = [startDir, piNpmPackageRoot()];
  let packageJsonPath;
  try {
    packageJsonPath = require2.resolve(`${RPIV_PACKAGE_NAME}/package.json`, { paths: resolvePaths });
  } catch {
    try {
      packageJsonPath = require2.resolve(`${RPIV_PACKAGE_NAME}/package.json`);
    } catch {
    }
  }
  if (!packageJsonPath) {
    try {
      const entryPath = require2.resolve(RPIV_PACKAGE_NAME, { paths: resolvePaths });
      let dir = dirname3(entryPath);
      for (let i = 0; i < 10; i++) {
        const candidate = join4(dir, "package.json");
        try {
          readFileSync5(candidate, "utf8");
          packageJsonPath = candidate;
          break;
        } catch {
          const parent = dirname3(dir);
          if (parent === dir) break;
          dir = parent;
        }
      }
    } catch {
    }
  }
  if (!packageJsonPath) {
    throw new Error(`Cannot resolve ${RPIV_PACKAGE_NAME}. Install with: pi install npm:${RPIV_PACKAGE_NAME}`);
  }
  const packageJson = JSON.parse(readFileSync5(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string") {
    throw new Error(`@juicesharp/rpiv-ask-user-question package.json is missing a string version.`);
  }
  return { packageRoot: dirname3(packageJsonPath), packageName: RPIV_PACKAGE_NAME, version: packageJson.version };
}
function piNpmPackageRoot() {
  return join4(process.env.PI_CODING_AGENT_DIR ?? join4(homedir2(), ".pi", "agent"), "npm");
}

// src/doctor.ts
var REQUIRED_OFFICIAL_WORKFLOW_SCHEMA_KEYS = [
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
  "workflow.inline_plan_threshold"
];
function checkPiSubagentsTempAcl(options) {
  const messages = [];
  let ok = true;
  try {
    const fsImpl = options?.fs ?? { accessSync };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();
    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join5(tempRoot, subdir);
      try {
        fsImpl.accessSync(dirPath, fsConstants.R_OK | fsConstants.W_OK);
      } catch (accessError) {
        const errorCode = typeof accessError === "object" && accessError !== null && "code" in accessError ? accessError.code : "";
        if (errorCode === "EACCES" || errorCode === "EPERM") {
          ok = false;
          const rawUsername = process.env.USERNAME ?? "$USERNAME";
          const psEscapedUsername = `'${rawUsername.replace(/'/g, "''")}'`;
          messages.push(
            `pi-subagents temp ACL: CORRUPTED \u2014 directory ${dirPath} is inaccessible. Run this from elevated PowerShell: takeown /f "${dirPath}" /r /d Y; icacls "${dirPath}" /grant ${psEscapedUsername}:F /t; Remove-Item -Recurse -Force "${dirPath}"`
          );
        } else if (errorCode === "ENOENT") {
          ok = false;
          messages.push(`pi-subagents temp ACL: MISSING \u2014 directory ${dirPath} does not exist. Subagents may fail until it is created.`);
        } else {
          ok = false;
          messages.push(`pi-subagents temp ACL: check error (${errorCode}): ${dirPath}`);
        }
      }
    }
    if (ok && messages.length === 0) {
      messages.push("pi-subagents temp ACL: ok");
    }
  } catch (error) {
    ok = false;
    messages.push(
      `pi-subagents temp ACL: check failed (${error instanceof Error ? error.message : String(error)})`
    );
  }
  return { ok, messages };
}
function runDoctor(options) {
  const officialPackage = resolveOfficialPackage({ startDir: options.startDir });
  const messages = [
    `official package: ${officialPackage.packageName}@${officialPackage.version}`,
    `official root: ${officialPackage.packageRoot}`
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
  const rpivResolver = options.rpivResolver ?? resolveRpivPackage;
  try {
    const rpiv = rpivResolver({ startDir: options.startDir });
    messages.push(`rpiv-ask-user-question: ok (${rpiv.packageName}@${rpiv.version})`);
  } catch {
    messages.push(
      `rpiv-ask-user-question: missing \u2014 AskUserQuestion-dependent workflows (discuss, plan, etc.) will use --text fallback mode. Install with: pi install npm:${RPIV_PACKAGE_NAME}`
    );
  }
  const aclChecker = options.aclChecker ?? checkPiSubagentsTempAcl;
  const aclResult = aclChecker();
  ok = ok && aclResult.ok;
  messages.push(...aclResult.messages);
  ok = checkGeneratedOfficialVersion({
    generatedRoot: dirname4(options.generatedPromptsDir),
    expectedPackageName: officialPackage.packageName,
    expectedVersion: officialPackage.version,
    messages
  }) && ok;
  const tempDir = mkdtempSync(join5(tmpdir(), "pi-gsd-doctor-"));
  try {
    const expectedDir = join5(tempDir, "prompts");
    const expected = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: expectedDir });
    const promptsOk = compareGeneratedFiles({ expectedPaths: expected.written, actualDir: options.generatedPromptsDir, label: "prompt", messages });
    ok = ok && promptsOk;
    if (options.generatedWorkflowsDir) {
      const expectedWorkflowsDir = join5(tempDir, "workflows");
      const expectedWorkflows = generateWorkflows({ officialRoot: officialPackage.packageRoot, outDir: expectedWorkflowsDir });
      const workflowsOk = compareGeneratedFiles({
        expectedPaths: expectedWorkflows.written,
        expectedDir: expectedWorkflowsDir,
        actualDir: options.generatedWorkflowsDir,
        label: "workflow",
        messages
      });
      ok = ok && workflowsOk;
      if (workflowsOk) messages.push("generated workflows: ok");
      const dispatchSyntaxOk = checkGeneratedWorkflowDispatchSyntax({
        actualDir: options.generatedWorkflowsDir,
        messages
      });
      ok = ok && dispatchSyntaxOk;
    }
    if (options.generatedAgentsDir) {
      const expectedAgentsDir = join5(tempDir, "agents");
      const expectedAgents = generateAgents({ officialRoot: officialPackage.packageRoot, outDir: expectedAgentsDir });
      const agentOk = compareGeneratedFiles({
        expectedPaths: expectedAgents.written,
        actualDir: options.generatedAgentsDir,
        label: "agent",
        messages
      });
      ok = ok && agentOk;
      if (agentOk) messages.push("generated agents: ok");
      const syncResult = syncAgents({
        generatedAgentsDir: options.generatedAgentsDir,
        cwd: options.startDir ?? process.cwd(),
        officialRoot: officialPackage.packageRoot,
        scope: options.agentSyncScope ?? "project",
        check: true
      });
      ok = ok && syncResult.ok;
      const syncScope = options.agentSyncScope ?? "project";
      messages.push(syncResult.ok ? `${syncScope} synced agents: ok` : `${syncScope} synced agents: stale or missing`);
      messages.push(...syncResult.messages);
    }
    const contractResult = verifyToolContractSnapshot({ cwd: options.startDir ?? process.cwd() });
    if (contractResult.failures.length > 0) {
      ok = false;
      messages.push(`tool contracts: invalid (${contractResult.failures.length} dispatch-critical drift)`);
      for (const failure of contractResult.failures) {
        messages.push(`  unit:${failure.unitType} field:${failure.failedField}`);
      }
    } else if (contractResult.warnings.length > 0) {
      messages.push(`tool contracts: warning (${contractResult.warnings.length} prose/docs drift)`);
      for (const warning of contractResult.warnings) {
        messages.push(`  unit:${warning.unitType} field:${warning.field}`);
      }
    } else if (contractResult.snapshotPresent) {
      messages.push("tool contracts: ok");
    } else {
      messages.push("tool contracts: skipped (no snapshot; run `npm run generate` to enable)");
    }
    const orchestrationContractResult = verifyOrchestrationContractSnapshot({ cwd: options.startDir ?? process.cwd() });
    if (orchestrationContractResult.failures.length > 0) {
      ok = false;
      messages.push(`orchestration contract: invalid (${orchestrationContractResult.failures.length} dispatch-critical drift)`);
      for (const failure of orchestrationContractResult.failures) {
        messages.push(`  field:${failure.failedField}`);
      }
    } else if (orchestrationContractResult.warnings.length > 0) {
      messages.push(`orchestration contract: warning (${orchestrationContractResult.warnings.length} prose/docs drift)`);
      for (const warning of orchestrationContractResult.warnings) {
        messages.push(`  field:${warning.field}`);
      }
    } else if (orchestrationContractResult.snapshotPresent) {
      messages.push("orchestration contract: ok");
    } else {
      messages.push("orchestration contract: skipped (no snapshot; run `npm run generate` to enable)");
    }
    return { ok, messages };
  } finally {
    rmSync3(tempDir, { recursive: true, force: true });
  }
}
function checkOfficialConfigParity(options) {
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
function checkGeneratedOfficialVersion(options) {
  const metadataPath = join5(options.generatedRoot, ".official-version.json");
  let metadata;
  try {
    metadata = JSON.parse(readFileSync6(metadataPath, "utf8"));
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
  const packageName = typeof metadata.packageName === "string" ? metadata.packageName : void 0;
  const version = typeof metadata.version === "string" ? metadata.version : void 0;
  if (packageName !== options.expectedPackageName || version !== options.expectedVersion) {
    options.messages.push(`generated official version stale: expected ${options.expectedPackageName}@${options.expectedVersion}, found ${packageName ?? "unknown"}@${version ?? "unknown"}`);
    return false;
  }
  options.messages.push(`generated official version: ok (${options.expectedPackageName}@${options.expectedVersion})`);
  return true;
}
function compareGeneratedFiles(options) {
  const expectedFileNames = new Set(options.expectedPaths.map((expectedPath) => expectedResourceName(expectedPath, options.expectedDir)));
  let ok = true;
  for (const expectedPath of options.expectedPaths) {
    const fileName = expectedResourceName(expectedPath, options.expectedDir);
    const actualPath = join5(options.actualDir, fileName);
    let actual;
    try {
      actual = readFileSync6(actualPath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        ok = false;
        options.messages.push(`missing generated ${options.label}: ${fileName}`);
        continue;
      }
      throw error;
    }
    const expectedContent = readFileSync6(expectedPath, "utf8");
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
function checkGeneratedWorkflowDispatchSyntax(options) {
  const residualPatterns = [
    /Skill\(\s*(?:skill\s*=|["'][a-z0-9-]+["'])/,
    /Workflow\(\s*workflow\s*=/,
    /SlashCommand\(/,
    /^\s*Agent\(\s*subagent_type\s*=\s*["']/
  ];
  const findings = [];
  for (const fileName of readGeneratedMarkdownFileNames(options.actualDir)) {
    const filePath = join5(options.actualDir, fileName);
    const content = readFileSync6(filePath, "utf8");
    const lines = normalizeLineEndings(content).split("\n");
    for (const [index, line] of lines.entries()) {
      if (residualPatterns.some((pattern) => pattern.test(line))) {
        findings.push(`${fileName}:${index + 1}`);
      }
    }
  }
  if (findings.length > 0) {
    options.messages.push(`dispatch syntax drift: ${findings.join(", ")}`);
    return false;
  }
  options.messages.push("generated workflow dispatch syntax: ok");
  return true;
}
function isMissingFileError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeLineEndings(content) {
  return content.replace(/\r\n/g, "\n");
}
function expectedResourceName(expectedPath, expectedDir) {
  if (!expectedDir) return basename(expectedPath);
  return relative2(expectedDir, expectedPath).replace(/\\/g, "/");
}
function readGeneratedMarkdownFileNames(generatedPromptsDir) {
  try {
    return readdirSync5(generatedPromptsDir, { recursive: true }).filter((name) => typeof name === "string" && name.endsWith(".md")).map((name) => String(name).replace(/\\/g, "/")).sort();
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

export {
  OFFICIAL_ROOT_PLACEHOLDER,
  transformOfficialAgentMarkdown,
  materializeOfficialAgentPaths,
  syncAgents,
  resolveAgentTargetDir,
  generateAgents,
  generatePrompts,
  generateWorkflows,
  generateAll,
  writeOfficialVersionStamp,
  PI_SUBAGENTS_PACKAGE_NAME,
  resolvePiSubagentsPackage,
  checkPiSubagentsTempAcl,
  runDoctor
};
