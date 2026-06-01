import {
  OFFICIAL_PACKAGE_NAME,
  TEMP_DIR_SUBDIRS,
  addPiSubagentGuidance,
  buildPiSubagentsTempRoot,
  commandFileToPiPromptName,
  normalizeGsdSlashReferences,
  resolveOfficialPackage,
  splitCodeFences,
  transformAskUserQuestionForPi,
  transformSkillDispatchForPi,
  transformSubagentDispatchForPi
} from "./chunk-27CGUQAG.js";

// src/frontmatter.ts
var supportedPromptKeys = [
  // Fields preserved in generated prompts:
  // - description: command description for Pi slash command registration
  // - argument-hint: usage hint for command arguments
  // - argument-instructions: detailed argument parsing instructions for the model
  // - requires: command dependencies (helps model understand available subcommands)
  //
  // Fields intentionally dropped (Claude Code concepts, not used by Pi):
  // - name: redundant with the Pi prompt filename (gsd-xxx.md)
  // - allowed-tools: Claude Code tool allowlist — Pi has its own tool system
  // - type: Claude Code prompt type classifier — Pi doesn't use this
  "description",
  "argument-hint",
  "argument-instructions",
  "requires"
];
function splitFrontmatter(input) {
  const opening = /^---\r?\n/.exec(input);
  if (!opening) {
    return { data: {}, body: input };
  }
  const closing = /\r?\n---\r?\n/.exec(input.slice(opening[0].length));
  if (!closing) {
    return { data: {}, body: input };
  }
  const endIndex = opening[0].length + closing.index;
  const rawFrontmatter = input.slice(opening[0].length, endIndex);
  const body = input.slice(endIndex + closing[0].length);
  return { data: parseFrontmatter(rawFrontmatter), body };
}
function writeFrontmatter(data, body) {
  const lines = supportedPromptKeys.flatMap((key) => {
    const value = data[key];
    if (value === void 0 || value === null) return [];
    return formatValue(key, value);
  });
  return `---
${lines.join("\n")}
---
${body}`;
}
function formatValue(key, value) {
  if (Array.isArray(value)) {
    return [`${key}:`, ...value.map((v) => `  - ${formatScalar(v)}`)];
  }
  if (typeof value === "string") {
    if (value.includes("\n")) {
      return [`${key}: |`, ...value.split("\n").map((l) => `  ${l}`)];
    }
    return [`${key}: ${formatScalar(value)}`];
  }
  return [String(value)];
}
function parseFrontmatter(rawFrontmatter) {
  const data = {};
  const lines = rawFrontmatter.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const scalarMatch = /^(?<key>[A-Za-z0-9_-]+):(?:\s*(?<value>.*))?$/.exec(line);
    if (!scalarMatch?.groups) {
      i += 1;
      continue;
    }
    const key = scalarMatch.groups.key;
    const value = scalarMatch.groups.value ?? "";
    const trimmedValue = value.trim();
    if (trimmedValue === "|" || trimmedValue === ">") {
      const blockLines = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith("  ") || lines[j].startsWith("	") || lines[j] === "")) {
        if (lines[j] !== "") {
          blockLines.push(lines[j].replace(/^  /, "").replace(/^\t/, ""));
        } else {
          blockLines.push("");
        }
        j += 1;
      }
      while (blockLines.length > 0 && blockLines[blockLines.length - 1] === "") {
        blockLines.pop();
      }
      data[key] = blockLines.join("\n");
      i = j;
      continue;
    }
    if (value !== "" && trimmedValue !== "") {
      data[key] = unquoteScalar(value);
      i += 1;
      continue;
    }
    if (value === "" || trimmedValue === "") {
      const list = [];
      let nextListMatch = i + 1 < lines.length ? /^\s+-\s*(?<value>.*)$/.exec(lines[i + 1]) : null;
      if (nextListMatch?.groups) {
        while (nextListMatch?.groups) {
          const groups = nextListMatch.groups;
          list.push(unquoteScalar(groups.value));
          i += 1;
          nextListMatch = i + 1 < lines.length ? /^\s+-\s*(?<value>.*)$/.exec(lines[i + 1]) : null;
        }
        data[key] = list;
        i += 1;
        continue;
      }
      data[key] = "";
      i += 1;
      continue;
    }
    i += 1;
  }
  return data;
}
function unquoteScalar(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (first === '"' && last === '"' || first === "'" && last === "'") {
      return value.slice(1, -1);
    }
  }
  return value;
}
function formatScalar(value) {
  if (!needsQuoting(value)) {
    return value;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return `"${value.replaceAll('"', '\\"')}"`;
}
function needsQuoting(value) {
  return value === "" || value !== value.trim() || /[:[\]{}#,&*!|>'"%@`]/.test(value);
}

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
        addPiSubagentGuidance(normalizeGsdSlashReferences(body))
      )
    )
  );
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
      const pathRewritten = rewriteWorkflowPaths(source, OFFICIAL_PACKAGE_NAME).replace(/Skill\(skill=/g, "Skill(");
      const transformed = applyPromptTransforms(pathRewritten, OFFICIAL_PACKAGE_NAME);
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
  return { prompts, agents, workflows };
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
import { basename, join as join5, relative as relative2 } from "path";

// src/rpiv.ts
import { readFileSync as readFileSync5 } from "fs";
import { createRequire as createRequire2 } from "module";
import { dirname as dirname3, join as join4 } from "path";
var RPIV_PACKAGE_NAME = "@juicesharp/rpiv-ask-user-question";
function resolveRpivPackage(options = {}) {
  const startDir = options.startDir ?? process.cwd();
  const require2 = createRequire2(import.meta.url);
  let packageJsonPath;
  try {
    packageJsonPath = require2.resolve(`${RPIV_PACKAGE_NAME}/package.json`, { paths: [startDir] });
  } catch {
    try {
      packageJsonPath = require2.resolve(`${RPIV_PACKAGE_NAME}/package.json`);
    } catch {
    }
  }
  if (!packageJsonPath) {
    try {
      const entryPath = require2.resolve(RPIV_PACKAGE_NAME, { paths: [startDir] });
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

// src/doctor.ts
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
    return { ok, messages };
  } finally {
    rmSync3(tempDir, { recursive: true, force: true });
  }
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
function isMissingFileError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
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

// src/orchestrator/settings.ts
import { existsSync as existsSync4, readFileSync as readFileSync7 } from "fs";
import { join as join6 } from "path";
var OrchestratorSettingsError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OrchestratorSettingsError";
  }
};
var DEFAULT_WORKFLOW_SETTINGS = {
  _auto_chain_active: false,
  auto_advance: false,
  research: true,
  plan_check: true,
  verifier: true,
  ui_phase: true,
  ui_review: true,
  code_review: true,
  skip_discuss: false,
  worktrees: true,
  node_repair: true,
  node_repair_budget: 2
};
function resolveWorkflowSettings(options = {}) {
  const workflow = { ...DEFAULT_WORKFLOW_SETTINGS, ...options.defaults };
  const sources = Object.fromEntries(Object.keys(workflow).map((key) => [key, "default"]));
  const configPath = options.configPath ?? join6(options.cwd ?? process.cwd(), ".planning", "config.json");
  const fallbackConfigPath = options.configPath ? void 0 : join6(options.cwd ?? process.cwd(), "config.json");
  const actualConfigPath = existsSync4(configPath) ? configPath : fallbackConfigPath && existsSync4(fallbackConfigPath) ? fallbackConfigPath : void 0;
  if (actualConfigPath) {
    const config = readConfig(actualConfigPath);
    const configWorkflow = isRecord(config) && isRecord(config.workflow) ? config.workflow : {};
    applyBoolean(configWorkflow, "_auto_chain_active", workflow, sources);
    applyBoolean(configWorkflow, "auto_advance", workflow, sources);
    applyBoolean(configWorkflow, "research", workflow, sources);
    applyBoolean(configWorkflow, "plan_check", workflow, sources);
    applyBoolean(configWorkflow, "verifier", workflow, sources);
    applyBoolean(configWorkflow, "ui_phase", workflow, sources);
    applyBoolean(configWorkflow, "ui_review", workflow, sources);
    applyBoolean(configWorkflow, "code_review", workflow, sources);
    applyBoolean(configWorkflow, "skip_discuss", workflow, sources);
    applyBooleanAlias(configWorkflow, "worktrees", "use_worktrees", workflow, sources);
    applyBoolean(configWorkflow, "node_repair", workflow, sources);
    applyPositiveInteger(configWorkflow, "node_repair_budget", workflow, sources);
  }
  return { workflow, sources };
}
function buildUnitQueue(input) {
  const settings = input.settings ?? resolveWorkflowSettings({ cwd: input.cwd, configPath: input.configPath });
  const phase = input.phase;
  if (input.phaseSignals?.isUiPhase && !settings.workflow.ui_phase) {
    const resumeHint = "Phase signals require UI planning but workflow.ui_phase is disabled. Ask the user whether to enable workflow.ui_phase or continue without the UI Unit.";
    return { decision: "pause_for_user", settings, resumeHint, units: [unit(phase, "pause-for-user", settings, { resumeHint, source: "phase-signal" })] };
  }
  const units = [];
  if (!settings.workflow.skip_discuss) units.push(unit(phase, "discuss", settings));
  if (settings.workflow.research) units.push(unit(phase, "research", settings));
  if (input.phaseSignals?.isUiPhase && settings.workflow.ui_phase) units.push(unit(phase, "settings-gate", settings, { label: "UI phase settings gate", source: "phase-signal", metadata: { setting: "workflow.ui_phase" } }));
  units.push(unit(phase, "plan", settings));
  if (settings.workflow.plan_check) units.push(unit(phase, "plan-check", settings));
  units.push(unit(phase, "execute", settings));
  if (settings.workflow.code_review) units.push(unit(phase, "code-review", settings));
  if (settings.workflow.verifier) units.push(unit(phase, "verify", settings));
  if (input.phaseSignals?.requiresUiReview && settings.workflow.ui_review) units.push(unit(phase, "ui-review", settings));
  units.push(unit(phase, "closeout", settings));
  return { decision: "dispatch", settings, units };
}
function unit(phase, type, settings, overrides = {}) {
  return {
    id: `${phase}:${type}`,
    type,
    status: "pending",
    phase,
    label: labelForType(type),
    required: isRequired(type),
    source: settings.sources?.[settingForType(type) ?? "_auto_chain_active"] ?? "default",
    ...overrides
  };
}
function labelForType(type) {
  return type.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
function isRequired(type) {
  return type === "plan" || type === "execute" || type === "closeout";
}
function settingForType(type) {
  if (type === "research") return "research";
  if (type === "plan-check") return "plan_check";
  if (type === "verify") return "verifier";
  if (type === "ui-review") return "ui_review";
  if (type === "code-review") return "code_review";
  if (type === "discuss") return "skip_discuss";
  if (type === "settings-gate") return "ui_phase";
  return void 0;
}
function readConfig(configPath) {
  try {
    return JSON.parse(readFileSync7(configPath, "utf8"));
  } catch (error) {
    throw new OrchestratorSettingsError(`Could not read orchestrator settings from ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function applyBoolean(source, key, workflow, sources) {
  if (typeof source[key] === "boolean") {
    workflow[key] = source[key];
    sources[key] = "config";
  }
}
function applyBooleanAlias(source, key, alias, workflow, sources) {
  if (typeof source[alias] === "boolean") {
    workflow[key] = source[alias];
    sources[key] = "config";
    return;
  }
  applyBoolean(source, key, workflow, sources);
}
function applyPositiveInteger(source, key, workflow, sources) {
  if (typeof source[key] === "number" && Number.isInteger(source[key]) && source[key] > 0) {
    workflow[key] = source[key];
    sources[key] = "config";
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/orchestrator/gates.ts
import { existsSync as existsSync5, readdirSync as readdirSync6 } from "fs";
import { join as join7 } from "path";

// src/orchestrator/reconciliation.ts
function reconcileBeforeDispatch(snapshot, unit2) {
  if (snapshot.status !== "running") {
    return {
      ok: false,
      gate: "reconcileBeforeDispatch",
      reason: "ambiguous-dispatch",
      retryable: false,
      resumeHint: "Resume or start orchestration before dispatching the next Unit.",
      evidence: [`status:${snapshot.status}`]
    };
  }
  if (snapshot.currentUnit?.id !== unit2.id) {
    return {
      ok: false,
      gate: "reconcileBeforeDispatch",
      reason: "ambiguous-dispatch",
      retryable: false,
      resumeHint: "Current Unit does not match the dispatch target; inspect orchestration state before continuing.",
      evidence: [`current:${snapshot.currentUnit?.id ?? "none"}`, `target:${unit2.id}`]
    };
  }
  return { ok: true, gate: "reconcileBeforeDispatch", evidence: ["phase-9-minimal-reconciliation"] };
}

// src/orchestrator/gates.ts
function runPreDispatchGates(snapshot, unit2, overrides = {}) {
  const orderedGates = [
    ["reconcileBeforeDispatch", overrides.reconcileBeforeDispatch ?? reconcileBeforeDispatch],
    ["decideDispatch", overrides.decideDispatch ?? decideDispatch],
    ["validateToolContract", overrides.validateToolContract ?? validateToolContract],
    ["prepareUnitRoot", overrides.prepareUnitRoot ?? prepareUnitRoot],
    ["persistRuntimeState", overrides.persistRuntimeState ?? persistRuntimeState]
  ];
  for (const [, gate] of orderedGates) {
    const result = gate(snapshot, unit2);
    if (!result.ok) return result;
  }
  return { ok: true, gate: "persistRuntimeState", evidence: orderedGates.map(([name]) => name) };
}
function runPostDispatchGate(snapshot, unit2, options = {}) {
  const exists = options.exists ?? existsSync5;
  const cwd = options.cwd ?? process.cwd();
  const phaseDir = join7(cwd, ".planning", "phases");
  if (unit2.type === "plan") {
    return existsMatching(phaseDir, unit2.phase, "PLAN.md", exists) ? pass("artifact", "plan artifact exists") : fail("Plan Unit did not produce a *-PLAN.md artifact.", [`missing:${unit2.phase}-*-PLAN.md`]);
  }
  if (unit2.type === "execute") {
    return existsMatching(phaseDir, unit2.phase, "SUMMARY.md", exists) ? pass("artifact", "summary artifact exists") : fail("Execute Unit did not produce a *-SUMMARY.md artifact.", [`missing:${unit2.phase}-*-SUMMARY.md`]);
  }
  if (unit2.type === "verify") {
    if (options.verifierSkip || !snapshot.settings.workflow.verifier) return pass("artifact", "verifier skipped by settings");
    return existsMatching(phaseDir, unit2.phase, "VERIFICATION.md", exists) ? pass("artifact", "verification artifact exists") : fail("Verify Unit did not produce a *-VERIFICATION.md artifact.", [`missing:${unit2.phase}-*-VERIFICATION.md`]);
  }
  if (unit2.type === "closeout") {
    return pass("artifact", "closeout evidence deferred to phase status seam");
  }
  return pass("artifact", `${unit2.type} has no Phase 9 artifact gate`);
}
function decideDispatch(_snapshot, unit2) {
  const knownTypes = ["discuss", "research", "plan", "plan-check", "execute", "code-review", "verify", "ui-review", "closeout", "settings-gate", "pause-for-user"];
  if (!knownTypes.includes(unit2.type)) {
    return { ok: false, gate: "decideDispatch", reason: "ambiguous-dispatch", retryable: false, resumeHint: "Unknown Unit type; update the orchestrator Unit union before dispatch.", evidence: [`type:${String(unit2.type)}`] };
  }
  if (unit2.type === "pause-for-user") {
    return { ok: false, gate: "decideDispatch", reason: "ambiguous-dispatch", retryable: false, resumeHint: unit2.resumeHint ?? "User input is required before dispatch.", evidence: [unit2.id] };
  }
  return pass("decideDispatch", `dispatch:${unit2.type}`);
}
function validateToolContract(_snapshot, unit2) {
  return pass("validateToolContract", `phase-12-contract-seam:${unit2.type}`);
}
function prepareUnitRoot(snapshot, unit2) {
  if (unit2.type === "execute" && snapshot.settings.workflow.worktrees === false) {
    return pass("prepareUnitRoot", "worktree disabled by settings");
  }
  return pass("prepareUnitRoot", "phase-11-worktree-safety-seam");
}
function persistRuntimeState(_snapshot, unit2) {
  return pass("persistRuntimeState", `persist-ready:${unit2.id}`);
}
function pass(gate, evidence) {
  return { ok: true, gate, evidence: [evidence] };
}
function fail(resumeHint, evidence) {
  return { ok: false, gate: "artifact", reason: "gate-failed", retryable: false, resumeHint, evidence };
}
function existsMatching(phaseRoot, phase, suffix, exists) {
  const commonNames = [
    join7(phaseRoot, `${phase}-${suffix}`),
    join7(phaseRoot, `${phase}-01-${suffix}`)
  ];
  if (commonNames.some((path) => exists(path))) return true;
  try {
    return readdirSync6(phaseRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`)).some((entry) => exists(join7(phaseRoot, entry.name, `${phase}-${suffix}`)) || exists(join7(phaseRoot, entry.name, `${phase}-01-${suffix}`)));
  } catch {
    return false;
  }
}

// src/orchestrator/state-machine.ts
function startOrchestration(input) {
  const [currentUnit, ...remainingUnits] = input.units;
  const snapshot = {
    version: 1,
    phase: input.phase,
    mode: input.mode,
    status: currentUnit ? "running" : "completed",
    currentUnit: currentUnit ? { ...currentUnit, status: "running" } : void 0,
    remainingUnits,
    attempt: 0,
    settings: input.settings,
    cwd: input.cwd
  };
  return withEvent(snapshot, {
    type: "orchestration_started",
    ts: timestamp(input.now),
    phase: input.phase,
    unitId: currentUnit?.id,
    status: snapshot.status === "running" ? "running" : "completed",
    attempt: 0,
    evidence: [`units:${input.units.length}`]
  });
}
function advanceOrchestration(snapshot, options = {}) {
  if (!snapshot.currentUnit) {
    const completed = { ...snapshot, status: "completed" };
    return { ok: true, messages: ["orchestration complete"], snapshot: completed, status: getSnapshotStatus(completed) };
  }
  const unit2 = snapshot.currentUnit;
  const preGate = runPreDispatchGates(snapshot, unit2, options.gates);
  if (!preGate.ok) return handleGateFailure(snapshot, unit2, preGate, options.now);
  const dispatch = options.dispatch ?? defaultDispatch;
  const dispatchResult = dispatch(unit2, snapshot);
  if (!dispatchResult.ok) {
    const paused = pause(snapshot, unit2, "dispatch-failed", dispatchResult.messages[0] ?? "Dispatch failed; inspect adapter output.", options.now, dispatchResult.messages);
    return { ok: false, messages: dispatchResult.messages, snapshot: paused, status: getSnapshotStatus(paused), dispatched: unit2 };
  }
  const postGate = options.postDispatchGate ? options.postDispatchGate(snapshot, unit2) : runPostDispatchGate(snapshot, unit2, { cwd: snapshot.cwd });
  if (!postGate.ok) return handleGateFailure(snapshot, unit2, postGate, options.now);
  const [nextUnit, ...remainingUnits] = snapshot.remainingUnits;
  const status = nextUnit ? "running" : "completed";
  const advanced = withEvent({
    ...snapshot,
    status,
    currentUnit: nextUnit ? { ...nextUnit, status: "running" } : void 0,
    remainingUnits,
    attempt: 0,
    resumeHint: void 0
  }, {
    type: "unit_ended",
    ts: timestamp(options.now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "completed",
    attempt: snapshot.attempt,
    evidence: [...evidenceOf(preGate), ...evidenceOf(postGate)]
  });
  const gatePassed = {
    type: "gate_passed",
    ts: timestamp(options.now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "completed",
    attempt: snapshot.attempt,
    evidence: [...evidenceOf(preGate), ...evidenceOf(postGate)]
  };
  return { ok: true, messages: dispatchResult.messages, snapshot: advanced, status: getSnapshotStatus(advanced), dispatched: unit2, events: [gatePassed, advanced.lastEvent].filter((event) => Boolean(event)) };
}
function resumeOrchestration(snapshot, now) {
  const resumed = withEvent({ ...snapshot, status: "running", resumeHint: void 0 }, {
    type: "resume",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: snapshot.currentUnit?.id,
    status: "running",
    attempt: snapshot.attempt
  });
  return { ok: true, messages: ["orchestration resumed"], snapshot: resumed, status: getSnapshotStatus(resumed) };
}
function stopOrchestration(snapshot, reason = "stopped", now) {
  const stopped = withEvent({ ...snapshot, status: "stopped", resumeHint: reason }, {
    type: "stop",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: snapshot.currentUnit?.id,
    status: "stopped",
    attempt: snapshot.attempt,
    reason
  });
  return { ok: true, messages: [`orchestration stopped: ${reason}`], snapshot: stopped, status: getSnapshotStatus(stopped) };
}
function getSnapshotStatus(snapshot) {
  return {
    status: snapshot.status,
    currentUnit: snapshot.currentUnit,
    remainingUnits: snapshot.remainingUnits,
    attempt: snapshot.attempt,
    lastEvent: snapshot.lastEvent,
    resumeHint: snapshot.resumeHint
  };
}
function handleGateFailure(snapshot, unit2, gate, now) {
  if (gate.retryable && snapshot.settings.workflow.node_repair && snapshot.attempt < snapshot.settings.workflow.node_repair_budget) {
    const retrying = withEvent({ ...snapshot, attempt: snapshot.attempt + 1 }, {
      type: "retry_scheduled",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit2.id,
      status: "running",
      attempt: snapshot.attempt + 1,
      reason: gate.reason,
      resumeHint: gate.resumeHint,
      evidence: gate.evidence
    });
    const gateFailed2 = {
      type: "gate_failed",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit2.id,
      status: "failed",
      attempt: snapshot.attempt,
      reason: gate.reason,
      resumeHint: gate.resumeHint,
      evidence: gate.evidence
    };
    return { ok: true, messages: [`retry scheduled: ${gate.reason}`], snapshot: retrying, status: getSnapshotStatus(retrying), events: [gateFailed2, retrying.lastEvent].filter((event) => Boolean(event)) };
  }
  const reason = gate.retryable ? "retry-budget-exhausted" : gate.reason;
  const paused = pause(snapshot, unit2, reason, gate.resumeHint, now, gate.evidence);
  const gateFailed = {
    type: "gate_failed",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "failed",
    attempt: snapshot.attempt,
    reason,
    resumeHint: gate.resumeHint,
    evidence: gate.evidence
  };
  return { ok: false, messages: [gate.resumeHint], snapshot: paused, status: getSnapshotStatus(paused), events: [gateFailed, paused.lastEvent].filter((event) => Boolean(event)) };
}
function pause(snapshot, unit2, reason, resumeHint, now, evidence) {
  return withEvent({ ...snapshot, status: "paused", resumeHint }, {
    type: "pause",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "paused",
    attempt: snapshot.attempt,
    reason,
    resumeHint,
    evidence
  });
}
function withEvent(snapshot, event) {
  return { ...snapshot, lastEvent: event };
}
function timestamp(now) {
  return now ? now() : (/* @__PURE__ */ new Date()).toISOString();
}
function evidenceOf(result) {
  return result.evidence ?? [];
}
function defaultDispatch(unit2) {
  return { ok: true, messages: [`dispatch seam accepted ${unit2.type}`] };
}

// src/orchestrator/index.ts
function createAutoOrchestrator(deps = {}) {
  let snapshot;
  return {
    start(sessionContext) {
      const settings = (deps.settingsResolver ?? defaultSettingsResolver)(sessionContext);
      const queue = (deps.queueBuilder ?? buildUnitQueue)({
        mode: sessionContext.mode,
        phase: sessionContext.phase,
        cwd: sessionContext.cwd,
        configPath: sessionContext.configPath,
        settings
      });
      if (queue.decision === "pause_for_user") {
        snapshot = startOrchestration({ phase: sessionContext.phase, mode: sessionContext.mode, settings: queue.settings, units: queue.units, now: deps.clock, cwd: sessionContext.cwd });
        snapshot = withLastEvent({ ...snapshot, status: "paused", resumeHint: queue.resumeHint }, settingsResolvedEvent(snapshot, deps.clock));
        return record({ ok: false, messages: [queue.resumeHint ?? "orchestration paused for user"], snapshot, status: getSnapshotStatus(snapshot), events: [snapshotEvent(snapshot, "orchestration_started"), snapshot.lastEvent].filter((event) => Boolean(event)) }, snapshot, deps);
      }
      snapshot = startOrchestration({ phase: sessionContext.phase, mode: sessionContext.mode, settings: queue.settings, units: queue.units, now: deps.clock, cwd: sessionContext.cwd });
      const started = snapshot.lastEvent;
      snapshot = withLastEvent(snapshot, settingsResolvedEvent(snapshot, deps.clock));
      return record({ ok: true, messages: ["orchestration started"], snapshot, status: getSnapshotStatus(snapshot), events: [started, snapshot.lastEvent].filter((event) => Boolean(event)) }, snapshot, deps);
    },
    advance() {
      if (!snapshot) return { ok: false, messages: ["orchestration has not started"], status: emptyStatus() };
      const result = advanceOrchestration(snapshot, { dispatch: deps.dispatch, gates: deps.gates, now: deps.clock });
      if (result.snapshot) snapshot = result.snapshot;
      return record(result, snapshot, deps);
    },
    resume() {
      if (!snapshot && deps.journal?.read) {
        const read = deps.journal.read();
        if (!read.ok || !read.journal) return { ok: false, messages: read.messages, status: emptyStatus() };
        snapshot = read.journal.snapshot;
      }
      if (!snapshot) return { ok: false, messages: ["orchestration has not started"], status: emptyStatus() };
      if (snapshot.status === "completed" || snapshot.status === "stopped") {
        return { ok: false, messages: [`cannot resume ${snapshot.status} orchestration`], snapshot, status: getSnapshotStatus(snapshot) };
      }
      const result = resumeOrchestration(snapshot, deps.clock);
      if (result.snapshot) snapshot = result.snapshot;
      return record(result, snapshot, deps);
    },
    stop(reason) {
      if (!snapshot) return { ok: false, messages: ["orchestration has not started"], status: emptyStatus() };
      const result = stopOrchestration(snapshot, reason, deps.clock);
      if (result.snapshot) snapshot = result.snapshot;
      return record(result, snapshot, deps);
    },
    getStatus() {
      return snapshot ? getSnapshotStatus(snapshot) : emptyStatus();
    }
  };
}
var singleton = createAutoOrchestrator();
function start(sessionContext) {
  return singleton.start(sessionContext);
}
function advance() {
  return singleton.advance();
}
function resume() {
  return singleton.resume();
}
function stop(reason) {
  return singleton.stop(reason);
}
function getStatus() {
  return singleton.getStatus();
}
function defaultSettingsResolver(context) {
  return resolveWorkflowSettings({ cwd: context.cwd, configPath: context.configPath });
}
function record(result, snapshot, deps) {
  if (!snapshot) return result;
  const written = [...result.written ?? []];
  const events = result.events ?? (snapshot.lastEvent ? [snapshot.lastEvent] : []);
  if (deps.journal) {
    for (const event of events) {
      const journalResult = deps.journal.append(event, snapshot);
      if (journalResult.written) written.push(...journalResult.written);
    }
  }
  if (deps.stateDigest) {
    const digestResult = deps.stateDigest.write(snapshot);
    if (digestResult.written) written.push(...digestResult.written);
  }
  return written.length > 0 ? { ...result, written } : result;
}
function emptyStatus() {
  return { status: "idle", remainingUnits: [], attempt: 0, currentUnit: void 0, lastEvent: void 0, resumeHint: void 0 };
}
function settingsResolvedEvent(snapshot, now) {
  return {
    type: "settings_resolved",
    ts: now ? now() : (/* @__PURE__ */ new Date()).toISOString(),
    phase: snapshot.phase,
    unitId: snapshot.currentUnit?.id,
    status: snapshot.currentUnit?.status ?? "completed",
    attempt: snapshot.attempt,
    evidence: [
      `auto_advance:${snapshot.settings.workflow.auto_advance}`,
      `node_repair_budget:${snapshot.settings.workflow.node_repair_budget}`
    ]
  };
}
function withLastEvent(snapshot, event) {
  return { ...snapshot, lastEvent: event };
}
function snapshotEvent(snapshot, type) {
  if (!snapshot.lastEvent) return void 0;
  return { ...snapshot.lastEvent, type };
}

export {
  splitFrontmatter,
  writeFrontmatter,
  OFFICIAL_ROOT_PLACEHOLDER,
  transformOfficialAgentMarkdown,
  materializeOfficialAgentPaths,
  syncAgents,
  resolveAgentTargetDir,
  generateAgents,
  generatePrompts,
  generateWorkflows,
  generateAll,
  PI_SUBAGENTS_PACKAGE_NAME,
  resolvePiSubagentsPackage,
  checkPiSubagentsTempAcl,
  runDoctor,
  createAutoOrchestrator,
  start,
  advance,
  resume,
  stop,
  getStatus
};
