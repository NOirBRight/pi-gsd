import {
  addPiSubagentGuidance,
  commandFileToPiPromptName,
  normalizeGsdSlashReferences,
  resolveOfficialPackage
} from "./chunk-ZNIYZQO4.js";

// src/frontmatter.ts
var supportedPromptKeys = ["description", "argument-hint"];
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
    return typeof value === "string" ? [`${key}: ${formatScalar(value)}`] : [];
  });
  return `---
${lines.join("\n")}
---
${body}`;
}
function parseFrontmatter(rawFrontmatter) {
  const data = {};
  const lines = rawFrontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const scalarMatch = /^(?<key>[A-Za-z0-9_-]+):(?:\s*(?<value>.*))?$/.exec(line);
    if (!scalarMatch?.groups) {
      continue;
    }
    const key = scalarMatch.groups.key;
    const value = scalarMatch.groups.value ?? "";
    if (value !== "") {
      data[key] = unquoteScalar(value);
      continue;
    }
    const list = [];
    let nextListMatch = i + 1 < lines.length ? /^\s+-\s*(?<value>.*)$/.exec(lines[i + 1]) : null;
    if (!nextListMatch?.groups) {
      data[key] = "";
      continue;
    }
    while (nextListMatch?.groups) {
      const groups = nextListMatch.groups;
      list.push(unquoteScalar(groups.value));
      i += 1;
      nextListMatch = i + 1 < lines.length ? /^\s+-\s*(?<value>.*)$/.exec(lines[i + 1]) : null;
    }
    data[key] = list;
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
  const frontmatter = { name, description };
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
  const rewritten = body.replace(/@(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `@${OFFICIAL_ROOT_PLACEHOLDER}/get-shit-done/`).replace(/(^|[^@])(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `$1${OFFICIAL_ROOT_PLACEHOLDER}/get-shit-done/`);
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
  if (!markdown.startsWith("---\n")) {
    return `${generatedMarker}
${markdown}`;
  }
  const closingFrontmatter = markdown.indexOf("\n---\n", 4);
  if (closingFrontmatter === -1) {
    return `${generatedMarker}
${markdown}`;
  }
  const insertAt = closingFrontmatter + "\n---\n".length;
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
import { mkdirSync as mkdirSync3, readdirSync as readdirSync4, readFileSync as readFileSync3, rmSync as rmSync2, writeFileSync as writeFileSync3 } from "fs";
import { join as join3, resolve as resolve4 } from "path";
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
    const body = addPiSubagentGuidance(normalizeGsdSlashReferences(parsed.body));
    writeFileSync3(targetPath, writeFrontmatter(parsed.data, body), "utf8");
    return targetPath;
  });
  return { written };
}
function generateAll(options) {
  return {
    prompts: generatePrompts({ officialRoot: options.officialRoot, outDir: options.promptsDir, safeRoot: options.safeRoot }),
    agents: generateAgents({ officialRoot: options.officialRoot, outDir: options.agentsDir, safeRoot: options.safeRoot })
  };
}

// src/pi-subagents.ts
import { readFileSync as readFileSync4 } from "fs";
import { createRequire } from "module";
import { dirname } from "path";
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
  return { packageRoot: dirname(packageJsonPath), packageName: PI_SUBAGENTS_PACKAGE_NAME, version: packageJson.version };
}

// src/doctor.ts
import { mkdtempSync, readdirSync as readdirSync5, readFileSync as readFileSync5, rmSync as rmSync3 } from "fs";
import { tmpdir } from "os";
import { basename, join as join4 } from "path";
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
  const tempDir = mkdtempSync(join4(tmpdir(), "pi-gsd-doctor-"));
  try {
    const expectedDir = join4(tempDir, "prompts");
    const expected = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: expectedDir });
    const promptsOk = compareGeneratedFiles({ expectedPaths: expected.written, actualDir: options.generatedPromptsDir, label: "prompt", messages });
    ok = ok && promptsOk;
    if (options.generatedAgentsDir) {
      const expectedAgentsDir = join4(tempDir, "agents");
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
  const expectedFileNames = new Set(options.expectedPaths.map((expectedPath) => basename(expectedPath)));
  let ok = true;
  for (const expectedPath of options.expectedPaths) {
    const fileName = basename(expectedPath);
    const actualPath = join4(options.actualDir, fileName);
    let actual;
    try {
      actual = readFileSync5(actualPath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        ok = false;
        options.messages.push(`missing generated ${options.label}: ${fileName}`);
        continue;
      }
      throw error;
    }
    const expectedContent = readFileSync5(expectedPath, "utf8");
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
function readGeneratedMarkdownFileNames(generatedPromptsDir) {
  try {
    return readdirSync5(generatedPromptsDir).filter((name) => name.endsWith(".md")).sort();
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
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
  generateAll,
  PI_SUBAGENTS_PACKAGE_NAME,
  resolvePiSubagentsPackage,
  runDoctor
};
