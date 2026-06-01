var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/extension.ts
import { accessSync, constants as fsConstants, mkdirSync as mkdirSync3, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname as dirname4, join as join12, resolve as resolve4 } from "path";
import { fileURLToPath } from "url";

// src/official.ts
import { existsSync, readFileSync, statSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
var OFFICIAL_PACKAGE_NAME = "@opengsd/gsd-core";
var OfficialPackageError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OfficialPackageError";
  }
};
function resolveOfficialPackage(options = {}) {
  const startDir = options.startDir ?? process.cwd();
  const packageName = options.packageName ?? OFFICIAL_PACKAGE_NAME;
  if (!existsSync(startDir)) {
    throw missingOfficialPackageError(startDir, packageName);
  }
  const require2 = createRequire(import.meta.url);
  let packageJsonPath;
  try {
    packageJsonPath = require2.resolve(`${packageName}/package.json`, { paths: [startDir] });
  } catch {
    try {
      packageJsonPath = require2.resolve(`${packageName}/package.json`);
    } catch {
      throw missingOfficialPackageError(startDir, packageName);
    }
  }
  const packageRoot = dirname(packageJsonPath);
  const packageJson = readPackageJson(packageJsonPath);
  const paths = buildOfficialPaths(packageRoot);
  validateRequiredPath("commands/gsd", paths.commandsDir, "directory", packageName);
  validateRequiredPath("get-shit-done/workflows", paths.workflowsDir, "directory", packageName);
  validateRequiredPath("get-shit-done/references", paths.referencesDir, "directory", packageName);
  validateRequiredPath("get-shit-done/templates", paths.templatesDir, "directory", packageName);
  validateRequiredPath("agents", paths.agentsDir, "directory", packageName);
  validateRequiredPath("hooks", paths.hooksDir, "directory", packageName);
  validateRequiredPath("get-shit-done/bin/gsd-tools.cjs", paths.gsdTools, "file", packageName);
  return {
    packageRoot,
    packageName,
    version: packageJson.version,
    paths
  };
}
function buildOfficialPaths(packageRoot) {
  return {
    commandsDir: join(packageRoot, "commands", "gsd"),
    workflowsDir: join(packageRoot, "get-shit-done", "workflows"),
    referencesDir: join(packageRoot, "get-shit-done", "references"),
    templatesDir: join(packageRoot, "get-shit-done", "templates"),
    agentsDir: join(packageRoot, "agents"),
    hooksDir: join(packageRoot, "hooks"),
    gsdTools: join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs")
  };
}
function readPackageJson(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string") {
    throw new OfficialPackageError(`Official package package.json is missing a string version.`);
  }
  return { version: packageJson.version };
}
function validateRequiredPath(relativePath, fullPath, kind, packageName) {
  if (!existsSync(fullPath)) {
    throw missingPathError(relativePath, packageName);
  }
  const stats = statSync(fullPath);
  if (kind === "directory" && !stats.isDirectory()) {
    throw missingPathError(relativePath, packageName);
  }
  if (kind === "file" && !stats.isFile()) {
    throw missingPathError(relativePath, packageName);
  }
}
function missingOfficialPackageError(startDir, packageName) {
  return new OfficialPackageError(
    `Official GSD package not found from ${startDir}. Run: npm install ${packageName}`
  );
}
function missingPathError(relativePath, packageName) {
  return new OfficialPackageError(
    `Official GSD package is incomplete: missing ${relativePath}. Run: npm install ${packageName}`
  );
}

// src/prompt-transform.ts
function commandFileToPiPromptName(fileName) {
  return `gsd-${fileName}`;
}
function normalizeGsdSlashReferences(input) {
  return input.replace(/(^|[\s([{'"`])\/gsd:([a-z0-9][a-z0-9-]*)/g, "$1/gsd-$2");
}
var gsdToolsRequireResolve = "require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs')";
function transformGsdRunLauncher(input) {
  if (input.includes(gsdToolsRequireResolve)) return input;
  return input.replace(/^.*_GSD_SHIM_NAME="gsd-tools\.cjs".*$/gm, (launcherLine) => {
    const nodeModulesFallback = `_GSD_SHIM_NAME="gsd-tools.cjs"; GSD_TOOLS="$(node -e "console.log(${gsdToolsRequireResolve})" 2>/dev/null)"; if [ -n "$GSD_TOOLS" ] && [ -f "$GSD_TOOLS" ]; then gsd_run() { node "$GSD_TOOLS" "$@"; }; else ${launcherLine}; fi`;
    return nodeModulesFallback;
  });
}
var piSubagentGuidance = `<pi_subagents_runtime_note>
Pi runtime: when this workflow calls for spawning GSD subagents, use the Pi \`subagent\` tool from \`pi-subagents\`.
Before delegation, inspect available agents with \`subagent({ action: "list" })\`.
Use exact official GSD agent names such as \`gsd-planner\`, \`gsd-executor\`, and \`gsd-code-reviewer\`.
If the \`subagent\` tool is unavailable, stop and ask the user to install or enable \`pi-subagents\`; do not simulate subagents inline.
</pi_subagents_runtime_note>

`;
function addPiSubagentGuidance(input) {
  if (input.includes("<pi_subagents_runtime_note>")) return input;
  if (!mentionsSubagentDelegation(input)) return input;
  return `${piSubagentGuidance}${input}`;
}
function mentionsSubagentDelegation(input) {
  return splitCandidateSentences(input).some((candidate) => {
    if (mentionsNegatedSubagentDelegation(candidate)) return false;
    return mentionsPositiveSubagentDelegation(candidate) || mentionsGsdSubagentPair(candidate);
  });
}
function splitCandidateSentences(input) {
  return input.match(/[^.!?\n]+[.!?]?/g) ?? [];
}
function mentionsNegatedSubagentDelegation(input) {
  return /\bwithout\b/i.test(input) || /\bno\s+subagents?\b/i.test(input) || /\bdo\s+not\s+spawn\b/i.test(input) || /\bdon't\s+spawn\b/i.test(input);
}
function mentionsPositiveSubagentDelegation(input) {
  return /\b(?:re-?spawn(?:s|ing|ed)?|spawn(?:s|ing|ed)?|delegat(?:e|es|ed|ing)|orchestrat(?:e|es|ed|ing)|dispatch(?:es|ed|ing)?)\b/i.test(input) && /\b(?:subagents?|agents?|gsd-[a-z0-9-]+|checkers?|research(?:ers?)?|writers?|planners?|executors?|auditors?|mappers?|synthesizers?|reviewers?|debuggers?)\b/i.test(input);
}
function mentionsGsdSubagentPair(input) {
  return /\bgsd-[a-z0-9-]+\b[\s\S]{0,80}\bsubagents?\b/i.test(input) || /\bsubagents?\b[\s\S]{0,80}\bgsd-[a-z0-9-]+\b/i.test(input);
}
function splitCodeFences(text) {
  const parts = [];
  const regex = /(`{3}[\s\S]*?`{3})/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ segment: text.slice(lastIdx, match.index), isCode: false });
    }
    parts.push({ segment: match[1], isCode: true });
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push({ segment: text.slice(lastIdx), isCode: false });
  }
  if (parts.length === 0) {
    parts.push({ segment: text, isCode: false });
  }
  return parts;
}
function transformAskUserQuestionForPi(input) {
  if (input.includes("ask_user_question")) return input;
  const segments = splitCodeFences(input);
  let changed = false;
  const result = segments.map(({ segment, isCode }) => {
    if (isCode) return segment;
    const transformed = rewriteAskUserQuestionInSegment(segment);
    if (transformed !== segment) changed = true;
    return transformed;
  }).join("");
  return changed ? result : input;
}
function rewriteAskUserQuestionInSegment(segment) {
  let result = segment;
  let safety = 100;
  let searchFrom = 0;
  while (safety-- > 0) {
    const match = /AskUserQuestion\s*\(/.exec(result.slice(searchFrom));
    if (!match || match.index === void 0) break;
    const callStart = searchFrom + match.index;
    const argsStart = callStart + match[0].length - 1;
    const argsText = extractBalancedParens(result, argsStart);
    if (!argsText) {
      searchFrom = argsStart + 1;
      continue;
    }
    const callEnd = argsStart + argsText.length + 2;
    const rewritten = transformAskUserQuestionCall(argsText);
    if (rewritten === null) {
      searchFrom = argsStart + 1;
      continue;
    }
    result = result.slice(0, callStart) + rewritten + result.slice(callEnd);
    searchFrom = callStart + rewritten.length;
  }
  if (safety <= 0) {
    console.warn("[pi-gsd] rewriteAskUserQuestionInSegment: safety limit reached \u2014 possible unbalanced AskUserQuestion in input");
  }
  return result;
}
function extractBalancedParens(text, openParenPos) {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let i = openParenPos;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return text.slice(openParenPos + 1, i);
      }
    }
  }
  return null;
}
function transformAskUserQuestionCall(argsText) {
  const trimmed = argsText.trim();
  if (trimmed.startsWith("[")) {
    return transformArrayQuestionForm(trimmed);
  }
  const namedParsed = parseNamedParams(trimmed);
  if (namedParsed) {
    return formatAskUserQuestion(namedParsed);
  }
  const positionalParsed = parsePositionalArgs(trimmed);
  if (positionalParsed) {
    return formatAskUserQuestion(positionalParsed);
  }
  return null;
}
function escapeDoubleQuotedString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function unescapeDoubleQuotedString(s) {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function formatAskUserQuestion(questions) {
  const formattedQuestions = questions.map((q) => {
    const opts = q.options.map((o) => `{ label: "${escapeDoubleQuotedString(o.label)}", description: "${escapeDoubleQuotedString(o.description)}" }`).join(", ");
    const parts = [
      `question: "${escapeDoubleQuotedString(q.question)}"`,
      `header: "${escapeDoubleQuotedString(q.header)}"`,
      `options: [${opts}]`
    ];
    if (q.multiSelect) {
      parts.push("multiSelect: true");
    }
    return `{ ${parts.join(", ")} }`;
  });
  return `ask_user_question({ questions: [${formattedQuestions.join(", ")}] })`;
}
function parseNamedParams(argsText) {
  const headerMatch = argsText.match(/header:\s*"((?:[^"]*\\.)*[^"]*)"/);
  const questionMatch = argsText.match(/question:\s*"((?:[^"]*\\.)*[^"]*)"/);
  if (!headerMatch || !questionMatch) return null;
  const header = unescapeDoubleQuotedString(headerMatch[1]);
  const question = unescapeDoubleQuotedString(questionMatch[1]);
  const questionBlockMatch = argsText.match(/question:\s*\|\n?([\s\S]*?)\n\s*\|?/);
  const finalQuestion = questionBlockMatch ? questionBlockMatch[1].trim() : question;
  const options = parseOptionsBlock(argsText);
  if (!options) return null;
  const multiSelectMatch = argsText.match(/multiSelect:\s*(true|false)/);
  const multiSelect = multiSelectMatch ? multiSelectMatch[1] === "true" : void 0;
  return [{ header, question: finalQuestion, options, multiSelect }];
}
function parsePositionalArgs(argsText) {
  const topTokens = tokenizeTopLevel(argsText);
  if (topTokens.length < 3) return null;
  const header = unquote(topTokens[0]);
  if (header === null) return null;
  const question = unquote(topTokens[1]);
  if (question === null) return null;
  const optionsRaw = topTokens[2];
  if (!optionsRaw.startsWith("[")) return null;
  const options = parseOptionsArray(optionsRaw);
  if (!options) return null;
  let multiSelect;
  for (let i = 3; i < topTokens.length; i++) {
    const ms = topTokens[i].trim();
    if (ms.startsWith("multiSelect")) {
      const val = ms.match(/multiSelect\s*:\s*(true|false)/);
      if (val) multiSelect = val[1] === "true";
    }
  }
  return [{ header, question, options, multiSelect }];
}
function tokenizeTopLevel(text) {
  const tokens = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) {
        current += text[++i];
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "[" || ch === "{" || ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === "]" || ch === "}" || ch === ")") {
      if (depth > 0) depth--;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      tokens.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    tokens.push(current.trim());
  }
  return tokens;
}
function unquote(s) {
  const trimmed = s.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return null;
}
function parseOptionsArray(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  if (inner.includes("{")) {
    return parseObjectOptions(inner);
  }
  const strings = [];
  let inStr = false;
  let sChar = "";
  let token = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      if (ch === "\\" && i + 1 < inner.length) {
        token += inner[++i];
        continue;
      }
      if (ch === sChar) {
        strings.push(token);
        token = "";
        inStr = false;
        continue;
      }
      token += ch;
    } else {
      if (ch === '"' || ch === "'") {
        inStr = true;
        sChar = ch;
      }
    }
  }
  if (strings.length > 0) {
    return strings.map((s) => ({ label: s, description: s }));
  }
  return null;
}
function parseObjectOptions(inner) {
  const options = [];
  const objPattern = /\{\s*label:\s*"((?:[^"\\]|\\.)*)"\s*,\s*description:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let match;
  while ((match = objPattern.exec(inner)) !== null) {
    options.push({ label: match[1], description: match[2] });
  }
  return options.length > 0 ? options : null;
}
function parseOptionsBlock(argsText) {
  const optionsIdx = argsText.search(/\boptions:/);
  if (optionsIdx === -1) return null;
  const bracketStart = argsText.indexOf("[", optionsIdx);
  if (bracketStart === -1) return null;
  let depth = 0;
  let endIdx = -1;
  for (let i = bracketStart; i < argsText.length; i++) {
    if (argsText[i] === "[") depth++;
    else if (argsText[i] === "]") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return null;
  const optionsRaw = argsText.slice(bracketStart, endIdx + 1);
  return parseOptionsArray(optionsRaw);
}
function transformArrayQuestionForm(trimmed) {
  const questions = [];
  let depth = 0;
  let blockStart = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "{") {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0 && blockStart !== -1) {
        const block = trimmed.slice(blockStart, i + 1);
        const parsed = parseQuestionObject(block);
        if (parsed) questions.push(parsed);
        blockStart = -1;
      }
    }
  }
  if (questions.length === 0) return null;
  return formatAskUserQuestion(questions);
}
function parseQuestionObject(block) {
  const headerMatch = block.match(/header:\s*"((?:[^"]*\\.)*[^"]*)"/);
  const questionMatch = block.match(/question:\s*"((?:[^"]*\\.)*[^"]*)"/);
  if (!headerMatch || !questionMatch) return null;
  const header = unescapeDoubleQuotedString(headerMatch[1]);
  const question = unescapeDoubleQuotedString(questionMatch[1]);
  const options = parseOptionsBlock(block);
  if (!options) return null;
  const multiSelectMatch = block.match(/multiSelect:\s*(true|false)/);
  const multiSelect = multiSelectMatch ? multiSelectMatch[1] === "true" : void 0;
  return { header, question, options, multiSelect };
}
function transformSkillDispatchForPi(input) {
  const segments = splitCodeFences(input);
  let changed = false;
  const result = segments.map(({ segment, isCode }) => {
    if (isCode) return segment;
    const transformed = rewriteSkillDispatchInSegment(segment);
    if (transformed !== segment) changed = true;
    return transformed;
  }).join("");
  return changed ? result : input;
}
function rewriteSkillDispatchInSegment(segment) {
  segment = segment.replace(
    /Skill\(skill=\\"([a-z0-9-]+)\\"(?:,\s*args=\\"([^\\"]*)\\")?\)/g,
    (_match, name, args) => {
      const slashCmd = args ? `/${name} ${args}` : `/${name}`;
      const invokePart = args ? `invoke via slash command ${slashCmd} in Pi` : `invoke via slash command /${name} in Pi`;
      return `Use the /${name} skill (${invokePart}) or read the corresponding workflow prompt to continue.`;
    }
  );
  segment = segment.replace(
    /Skill\(skill='([a-z0-9-]+)'(?:,\s*args='([^']*)')?\)/g,
    (_match, name, args) => {
      const slashCmd = args ? `/${name} ${args}` : `/${name}`;
      const invokePart = args ? `invoke via slash command ${slashCmd} in Pi` : `invoke via slash command /${name} in Pi`;
      return `Use the /${name} skill (${invokePart}) or read the corresponding workflow prompt to continue.`;
    }
  );
  segment = segment.replace(
    /Skill\(skill="([a-z0-9-]+)"(?:,\s*args="([^"]*)")?\)/g,
    (_match, name, args) => {
      const slashCmd = args ? `/${name} ${args}` : `/${name}`;
      const invokePart = args ? `invoke via slash command ${slashCmd} in Pi` : `invoke via slash command /${name} in Pi`;
      return `Use the /${name} skill (${invokePart}) or read the corresponding workflow prompt to continue.`;
    }
  );
  return segment;
}
function transformSubagentDispatchForPi(input) {
  const segments = splitCodeFences(input);
  let changed = false;
  const result = segments.map(({ segment, isCode }) => {
    if (isCode) return segment;
    let transformed = segment;
    const before1 = transformed;
    transformed = transformed.replace(/subagent_type="general-purpose"/g, 'subagent_type="general"');
    if (transformed !== before1) changed = true;
    const before2 = transformed;
    transformed = transformed.replace(
      /Agent\(subagent_type="([^"]+)",\s*prompt="([\s\S]*?)"\)/g,
      (_match, agentType, promptText) => {
        return `subagent({agent: "${agentType}", task: "${promptText}"})`;
      }
    );
    if (transformed !== before2) changed = true;
    return transformed;
  }).join("");
  return changed ? result : input;
}

// src/runtime-rewrites.ts
function rewriteOfficialClaudePaths(input, officialRoot) {
  const posixRoot = officialRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  return input.replace(/@(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `@${posixRoot}/get-shit-done/`).replace(/(^|[^@])~\/\.claude\/get-shit-done\//g, `$1${posixRoot}/get-shit-done/`);
}
function rewriteRuntimeMessageText(input, officialRoot) {
  return normalizeGsdSlashReferences(rewriteOfficialClaudePaths(input, officialRoot));
}

// src/gsd-models.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname as dirname2, join as join2 } from "path";
import {
  Container,
  SelectList,
  Text,
  matchesKey,
  Key
} from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
var _catalogCache = null;
function loadModelCatalog(gsdPackageRoot) {
  if (_catalogCache) return _catalogCache;
  const candidates = [
    join2(gsdPackageRoot, "get-shit-done", "bin", "shared", "model-catalog.json"),
    join2(gsdPackageRoot, "sdk", "shared", "model-catalog.json")
  ];
  for (const p of candidates) {
    if (existsSync2(p)) {
      _catalogCache = JSON.parse(readFileSync2(p, "utf8"));
      return _catalogCache;
    }
  }
  throw new Error(`model-catalog.json not found. Tried: ${candidates.join(", ")}`);
}
var ALIAS_TO_TIER = { opus: "heavy", sonnet: "standard", haiku: "light" };
function getProfileTierAgents(catalog, profile) {
  const result = /* @__PURE__ */ new Map();
  if (profile === "inherit") return result;
  for (const [agent, meta] of Object.entries(catalog.agents)) {
    let alias;
    if (profile === "adaptive") {
      alias = catalog.adaptiveTierMap[meta.routingTier];
    } else if (profile === "quality") {
      alias = meta.golden;
    } else {
      alias = meta[profile];
    }
    const tier = ALIAS_TO_TIER[alias];
    if (!tier) continue;
    const list = result.get(tier);
    if (list) list.push(agent);
    else result.set(tier, [agent]);
  }
  return result;
}
function getRequiredTiers(profile) {
  if (profile === "inherit") return [];
  if (profile === "quality") return ["heavy", "standard"];
  if (profile === "budget") return ["standard", "light"];
  return ["heavy", "standard", "light"];
}
var tierLabels = {
  heavy: { short: "H", label: "Heavy" },
  standard: { short: "S", label: "Standard" },
  light: { short: "L", label: "Light" }
};
function resolveGsdConfigPath(options) {
  if (options.scope === "project") {
    return join2(options.cwd, ".planning", "config.json");
  }
  return join2(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}
function buildTierModelOverrides(tiers, catalog, profile) {
  const tierAgents = getProfileTierAgents(catalog, profile);
  const overrides = {};
  for (const [tier, agents] of tierAgents) {
    const modelId = tiers[tier];
    if (!modelId) continue;
    for (const agent of agents) {
      overrides[agent] = modelId;
    }
  }
  return overrides;
}
function mergeGsdModelConfig(existing, patch) {
  const next = { ...existing, model_profile: patch.model_profile };
  if (patch.model_profile === "inherit") {
    delete next.model_overrides;
    return next;
  }
  next.model_overrides = { ...patch.model_overrides ?? {} };
  return next;
}
function readJsonObject(filePath) {
  if (!existsSync2(filePath)) return {};
  let raw;
  try {
    raw = readFileSync2(filePath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return parsed;
}
function writeJsonObject(filePath, value) {
  mkdirSync(dirname2(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function formatModelId(model) {
  return `${model.provider}/${model.id}`;
}
function readEnabledModels(homeDir) {
  const settingsPath = join2(homeDir ?? homedir(), ".pi", "agent", "settings.json");
  try {
    if (!existsSync2(settingsPath)) return [];
    const parsed = JSON.parse(readFileSync2(settingsPath, "utf8"));
    return Array.isArray(parsed?.enabledModels) ? parsed.enabledModels : [];
  } catch {
    return [];
  }
}
function readCurrentGsdConfig(configPath, catalog) {
  if (!existsSync2(configPath)) return { profile: null, tierModels: null };
  const config = readJsonObject(configPath);
  const profile = typeof config.model_profile === "string" ? config.model_profile : null;
  if (profile === "inherit" || !profile) {
    return { profile: profile ?? null, tierModels: null };
  }
  const overrides = config.model_overrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return { profile, tierModels: null };
  }
  if (!isValidProfile(profile)) {
    return { profile, tierModels: null };
  }
  return { profile, tierModels: inferTierModelsFromOverrides(overrides, catalog, profile) };
}
function inferTierModelsFromOverrides(overrides, catalog, profile) {
  const tierAgents = getProfileTierAgents(catalog, profile);
  const result = {};
  for (const [tier, agents] of tierAgents) {
    if (agents.length === 0) continue;
    const first = overrides[agents[0]];
    if (!first) return null;
    for (let i = 1; i < agents.length; i++) {
      const model = overrides[agents[i]];
      if (model && model !== first) {
        break;
      }
    }
    result[tier] = first;
  }
  if (result.heavy === void 0 && result.standard === void 0 && result.light === void 0) {
    return null;
  }
  return result;
}
var VALID_PROFILES = /* @__PURE__ */ new Set(["inherit", "quality", "balanced", "budget", "adaptive"]);
function isValidProfile(profile) {
  return VALID_PROFILES.has(profile);
}
function formatAgentSummary(agents, maxNames = 3) {
  const names = agents.map((a) => a.replace(/^gsd-/, ""));
  const count = names.length;
  const shown = names.slice(0, maxNames);
  const remaining = count - shown.length;
  if (remaining > 0) {
    return `${shown.join(", ")}, ... (${count})`;
  }
  return shown.join(", ");
}
function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function buildCurrentStatus(currentConfig, catalog, scope) {
  const profileRaw = currentConfig.profile ?? "inherit";
  const profile = capitalize(profileRaw);
  const COL_WIDTH = 11;
  const label = "STATUS:".padEnd(COL_WIDTH);
  if (scope === "project" && profileRaw === "inherit") {
    return `${label}(using Global config)`;
  }
  if (profileRaw === "inherit") {
    return `${label}Inherit (Pi session model)`;
  }
  const lines = [`${label}${profile}`];
  if (!isValidProfile(profileRaw)) {
    return `${label}${profile} (unknown)`;
  }
  const tierAgents = getProfileTierAgents(catalog, profileRaw);
  for (const tier of ["heavy", "standard", "light"]) {
    const agents = tierAgents.get(tier);
    const model = currentConfig.tierModels?.[tier];
    if (!agents || !model) continue;
    const tierLabel = (tierLabels[tier].label.toUpperCase() + ":").padEnd(COL_WIDTH);
    lines.push(`${tierLabel}${model}`);
    const summary = formatAgentSummary(agents, 2);
    lines.push(" ".repeat(COL_WIDTH) + "agents: " + summary);
  }
  return lines.join("\n");
}
async function runGsdModelsCommand(args, ctx) {
  const catalog = loadModelCatalog(ctx.gsdPackageRoot);
  const allAvailable = ctx.modelRegistry.getAvailable();
  const enabledIds = new Set(ctx.enabledModels);
  const filtered = enabledIds.size > 0 ? allAvailable.filter((m) => enabledIds.has(formatModelId(m))) : allAvailable;
  if (filtered.length === 0) {
    ctx.ui.notify("No enabled models available for selection.", "error");
    return;
  }
  if (enabledIds.size === 0) {
    ctx.ui.notify("No enabledModels filter found; showing all models with configured auth", "warning");
  }
  const scope = await selectScope(ctx, args);
  if (!scope) return;
  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const currentConfig = readCurrentGsdConfig(configPath, catalog);
  const currentStatus = buildCurrentStatus(currentConfig, catalog, scope);
  const profileItems = buildProfileOptions(catalog, scope, currentConfig);
  const selectedProfile = await ctx.ui.select(
    `GSD Model Profile [${capitalize(scope)}]

${currentStatus}`,
    profileItems
  );
  const profile = selectedProfile ?? currentConfig.profile ?? "inherit";
  if (profile === "inherit") {
    const merged2 = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, merged2);
    ctx.ui.notify(`\u2713 GSD: inherit (uses Pi session model) \u2192 ${configPath}`, "info");
    return;
  }
  if (profile === "clear") {
    if (existsSync2(configPath)) {
      const { unlinkSync } = await import("fs");
      unlinkSync(configPath);
    }
    ctx.ui.notify(`\u2713 Cleared project config \u2192 using global defaults`, "info");
    return;
  }
  const requiredTiers = getRequiredTiers(profile);
  const tierAgents = getProfileTierAgents(catalog, profile);
  const currentTiers = currentConfig.tierModels;
  const tierModels = {};
  for (const tier of requiredTiers) {
    const agents = tierAgents.get(tier) ?? [];
    const currentModel = currentTiers?.[tier] ?? null;
    const selected = await chooseTierModel(
      tier,
      agents,
      filtered,
      allAvailable,
      ctx,
      currentModel
    );
    tierModels[tier] = selected ?? currentModel ?? void 0;
  }
  const finalTiers = { heavy: "", standard: "", light: "" };
  for (const tier of requiredTiers) {
    const fallback = filtered.length > 0 ? formatModelId(filtered[0]) : "";
    finalTiers[tier] = tierModels[tier] ?? currentTiers?.[tier] ?? fallback;
    if (!finalTiers[tier]) {
      ctx.ui.notify(`No model available for ${tierLabels[tier].label} tier`, "error");
      return;
    }
  }
  if (profile === "quality") {
    finalTiers.light = finalTiers.standard;
  }
  if (profile === "budget") {
    finalTiers.heavy = finalTiers.standard;
  }
  if (!finalTiers.heavy) finalTiers.heavy = finalTiers.standard;
  if (!finalTiers.standard) finalTiers.standard = finalTiers.heavy;
  if (!finalTiers.light) finalTiers.light = finalTiers.standard;
  const overrides = buildTierModelOverrides(finalTiers, catalog, profile);
  const merged = mergeGsdModelConfig(readJsonObject(configPath), {
    model_profile: profile,
    model_overrides: overrides
  });
  writeJsonObject(configPath, merged);
  const notifyLines = [`\u2713 GSD: ${profile}`];
  for (const t of ["heavy", "standard", "light"]) {
    const agents = tierAgents.get(t);
    if (agents && agents.length > 0 && finalTiers[t]) {
      notifyLines.push(`  ${tierLabels[t].label}(${agents.length}) \u2192 ${finalTiers[t]}`);
    }
  }
  notifyLines.push(`\u2192 ${configPath}`);
  ctx.ui.notify(notifyLines.join("\n"), "info");
}
async function selectScope(ctx, args) {
  const argScope = parseScope(args);
  if (argScope) return argScope;
  const selected = await ctx.ui.select(
    "GSD Model Config \u2014 Select Scope",
    [
      { value: "global", label: "Global", description: "~/.gsd/defaults.json (all projects)" },
      { value: "project", label: "Project", description: ".planning/config.json (this project)" }
    ]
  );
  return selected;
}
function parseScope(args) {
  const trimmed = args?.trim().toLowerCase() ?? "";
  if (trimmed === "--user" || trimmed === "user" || trimmed === "--global" || trimmed === "global") return "global";
  if (trimmed === "--project" || trimmed === "project") return "project";
  return null;
}
function buildProfileOptions(catalog, scope, currentConfig) {
  const options = [
    {
      value: "inherit",
      label: "Inherit",
      description: "All agents \u2192 (Pi session model)"
    }
  ];
  const profileTiers = [
    { value: "quality", label: "Quality" },
    { value: "balanced", label: "Balanced" },
    { value: "budget", label: "Budget" },
    { value: "adaptive", label: "Adaptive" }
  ];
  for (const { value, label } of profileTiers) {
    const tiers = getRequiredTiers(value);
    const tierAgents = getProfileTierAgents(catalog, value);
    const desc = tiers.map((t) => {
      const agents = tierAgents.get(t);
      const count = agents ? agents.length : 0;
      return `${tierLabels[t].label}: ${count} agents`;
    }).join(" | ");
    options.push({ value, label, description: desc });
  }
  if (scope === "project") {
    options.push({
      value: "clear",
      label: "Clear (use Global)",
      description: "Delete project config, fall back to global defaults"
    });
  }
  return options;
}
async function chooseTierModel(tier, agents, scoped, all, ctx, currentModelId) {
  const agentSummary = formatAgentSummary(agents);
  const currentLabel = currentModelId ?? "(none)";
  const statusLine = `${tierLabels[tier].label.toUpperCase()} tier \u2014 agents: ${agentSummary}`;
  return await ctx.ui.custom((tui, theme, _kb, done) => {
    let mode = scoped.length > 0 ? "scoped" : "all";
    const container = new Container();
    const getItems = () => {
      const list = mode === "scoped" ? scoped : all;
      const sorted = [...list].sort((a, b) => {
        const aId = formatModelId(a);
        const bId = formatModelId(b);
        return aId.localeCompare(bId);
      });
      return sorted.map((m) => {
        const id = formatModelId(m);
        const isCurrent = id === currentModelId;
        return {
          value: id,
          label: isCurrent ? `${id} \u2713` : id,
          description: void 0
        };
      });
    };
    let selectTheme = {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t)
    };
    let selectList = new SelectList(getItems(), 15, selectTheme);
    const rebuild = () => {
      container.clear();
      container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold(statusLine)), 1, 0));
      container.addChild(new Text(theme.fg("dim", `Current: ${currentLabel}`), 1, 0));
      const tabHeader = mode === "scoped" ? ` ${theme.bg("selectedBg", theme.fg("userMessageText", " SCOPED "))}  ${theme.fg("muted", " ALL ")}` : ` ${theme.fg("muted", " SCOPED ")}  ${theme.bg("selectedBg", theme.fg("userMessageText", " ALL "))}`;
      container.addChild(new Text(tabHeader, 1, 1));
      container.addChild(selectList);
      container.addChild(new Text(theme.fg("dim", "\u2191\u2193 navigate \u2022 tab switch \u2022 enter select \u2022 esc keep current"), 1, 0));
      container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    };
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(currentModelId ?? void 0);
    rebuild();
    return {
      render: (w) => container.render(w),
      invalidate: () => {
        container.invalidate();
        rebuild();
      },
      handleInput: (data) => {
        if (matchesKey(data, Key.tab)) {
          mode = mode === "scoped" ? "all" : "scoped";
          selectList = new SelectList(getItems(), 15, selectTheme);
          selectList.onSelect = (item) => done(item.value);
          selectList.onCancel = () => done(currentModelId ?? void 0);
          rebuild();
          tui.requestRender();
          return;
        }
        selectList.handleInput(data);
        tui.requestRender();
      }
    };
  });
}

// src/orchestrator/dispatch.ts
import { existsSync as existsSync3 } from "fs";
import { spawnSync } from "child_process";
import { join as join3 } from "path";
var dispatchTargets = {
  discuss: { prompt: "generated/prompts/gsd-discuss-phase.md" },
  research: { prompt: "generated/prompts/gsd-explore.md" },
  plan: { agent: "gsd-planner", prompt: "generated/prompts/gsd-plan-phase.md" },
  "plan-check": { prompt: "generated/prompts/gsd-plan-review-convergence.md" },
  execute: { agent: "gsd-executor", prompt: "generated/prompts/gsd-execute-phase.md" },
  "code-review": { agent: "gsd-code-reviewer", prompt: "generated/prompts/gsd-code-review.md" },
  "security-review": { agent: "gsd-security-auditor", prompt: "generated/prompts/gsd-secure-phase.md" },
  "nyquist-validation": { agent: "gsd-nyquist-auditor", prompt: "generated/prompts/gsd-validate-phase.md" },
  "ai-integration": { prompt: "generated/prompts/gsd-ai-integration-phase.md" },
  "ui-review": { agent: "gsd-ui-auditor", prompt: "generated/prompts/gsd-ui-review.md" },
  "settings-gate": { agent: "gsd-ui-researcher", prompt: "generated/prompts/gsd-ui-phase.md" },
  "ui-safety-gate": { agent: "gsd-ui-checker", prompt: "generated/prompts/gsd-ui-phase.md" },
  verify: { agent: "gsd-verifier", prompt: "generated/prompts/gsd-verify-work.md" },
  closeout: { agent: void 0, prompt: "generated/prompts/gsd-ship.md" }
};
function resolveUnitDispatchTarget(unit2) {
  return dispatchTargets[unit2.type] ?? { prompt: `generated/prompts/gsd-${unit2.type}.md` };
}
function dispatchUnit(options, unit2, snapshot) {
  const target = resolveUnitDispatchTarget(unit2);
  const resourceRoot = options.resourceRoot ?? options.cwd;
  const promptPath = join3(resourceRoot, target.prompt);
  if (!existsSync3(promptPath)) {
    return { ok: false, messages: [`missing dispatch prompt: ${target.prompt}`] };
  }
  if (target.agent && !existsSync3(join3(resourceRoot, "generated", "agents", `${target.agent}.md`))) {
    return { ok: false, messages: [`missing dispatch agent: ${target.agent}`] };
  }
  if (!options.runner) {
    return {
      ok: false,
      messages: [`native Pi dispatch unavailable for ${unit2.type}; provide a dispatch runner or Pi subagent bridge`]
    };
  }
  return options.runner({ unit: unit2, snapshot, target, env: { GSD_AUDIT: "1" } });
}
function createCommandDispatchRunner(options) {
  return (request) => {
    const command = options.command ?? process.env.PI_GSD_DISPATCH_COMMAND;
    if (!command) return { ok: false, messages: ["PI_GSD_DISPATCH_COMMAND is required for native dispatch"] };
    const payload = JSON.stringify({ unit: request.unit, snapshot: request.snapshot, target: request.target });
    const child = spawnSync(command, [], {
      cwd: options.cwd,
      env: { ...process.env, ...request.env, PI_GSD_DISPATCH_REQUEST: payload },
      input: `${payload}
`,
      shell: true,
      encoding: "utf8"
    });
    const messages = [child.stdout, child.stderr].filter(Boolean).map((part) => part.trim()).filter(Boolean);
    if (child.error) return { ok: false, messages: [`dispatch command failed: ${child.error.message}`, ...messages] };
    if (child.status !== 0) return { ok: false, messages: [`dispatch command exited ${child.status ?? "unknown"}`, ...messages] };
    const parsed = parseDispatchCommandOutput(child.stdout);
    return { ok: true, messages: messages.length ? messages : ["dispatch command completed"], written: parsed.written };
  };
}
function createDispatchAdapter(options) {
  const runner = options.runner ?? createCommandDispatchRunner({ cwd: options.cwd });
  return (unit2, snapshot) => dispatchUnit({ ...options, runner }, unit2, snapshot);
}
function parseDispatchCommandOutput(output) {
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.written)) {
      return { written: parsed.written.filter((path) => typeof path === "string") };
    }
  } catch {
  }
  return {};
}

// src/orchestrator/settings.ts
import { existsSync as existsSync4, readdirSync, readFileSync as readFileSync3 } from "fs";
import { join as join4 } from "path";
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
  security_enforcement: true,
  nyquist_validation: true,
  ai_integration_phase: true,
  ui_safety_gate: true,
  auto_prune_state: true,
  research_before_questions: true,
  skip_discuss: false,
  worktrees: true,
  node_repair: true,
  node_repair_budget: 2,
  state_reconciliation_apply: false,
  subagent_timeout: 900,
  inline_plan_threshold: 1
};
function resolveWorkflowSettings(options = {}) {
  const workflow = { ...DEFAULT_WORKFLOW_SETTINGS, ...options.defaults };
  const sources = Object.fromEntries(Object.keys(workflow).map((key) => [key, "default"]));
  const configPath = options.configPath ?? join4(options.cwd ?? process.cwd(), ".planning", "config.json");
  const fallbackConfigPath = options.configPath ? void 0 : join4(options.cwd ?? process.cwd(), "config.json");
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
    applyBoolean(configWorkflow, "security_enforcement", workflow, sources);
    applyBoolean(configWorkflow, "nyquist_validation", workflow, sources);
    applyBoolean(configWorkflow, "ai_integration_phase", workflow, sources);
    applyBoolean(configWorkflow, "ui_safety_gate", workflow, sources);
    applyBoolean(configWorkflow, "auto_prune_state", workflow, sources);
    applyBoolean(configWorkflow, "research_before_questions", workflow, sources);
    applyBoolean(configWorkflow, "skip_discuss", workflow, sources);
    applyBooleanAlias(configWorkflow, "worktrees", "use_worktrees", workflow, sources);
    applyBooleanAlias(configWorkflow, "plan_check", "plan_checker", workflow, sources);
    applyBoolean(configWorkflow, "node_repair", workflow, sources);
    applyBoolean(configWorkflow, "state_reconciliation_apply", workflow, sources);
    applyPositiveInteger(configWorkflow, "node_repair_budget", workflow, sources);
    applyPositiveInteger(configWorkflow, "subagent_timeout", workflow, sources);
    applyPositiveInteger(configWorkflow, "inline_plan_threshold", workflow, sources);
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
  if (input.phaseSignals?.isUiPhase && settings.workflow.ui_safety_gate) units.push(unit(phase, "ui-safety-gate", settings, { label: "UI Safety Gate", source: "phase-signal", metadata: { setting: "workflow.ui_safety_gate" } }));
  if (input.phaseSignals?.isAiPhase && settings.workflow.ai_integration_phase) units.push(unit(phase, "ai-integration", settings, { label: "AI Integration", source: "phase-signal", metadata: { setting: "workflow.ai_integration_phase" } }));
  units.push(unit(phase, "plan", settings));
  if (settings.workflow.plan_check) units.push(unit(phase, "plan-check", settings));
  units.push(unit(phase, "execute", settings));
  if (settings.workflow.code_review) units.push(unit(phase, "code-review", settings));
  if (input.phaseSignals?.requiresSecurityReview && settings.workflow.security_enforcement) units.push(unit(phase, "security-review", settings, { source: "phase-signal", metadata: { setting: "workflow.security_enforcement" } }));
  if (settings.workflow.verifier) units.push(unit(phase, "verify", settings));
  if (input.phaseSignals?.requiresNyquistValidation && settings.workflow.nyquist_validation) units.push(unit(phase, "nyquist-validation", settings, { source: "phase-signal", metadata: { setting: "workflow.nyquist_validation" } }));
  if (input.phaseSignals?.requiresUiReview && settings.workflow.ui_review) units.push(unit(phase, "ui-review", settings));
  units.push(unit(phase, "closeout", settings));
  if (input.startAt) {
    const startIndex = units.findIndex((candidate) => candidate.type === input.startAt);
    if (startIndex === -1) {
      const resumeHint = `Cannot start at ${input.startAt}; the Unit is disabled by workflow settings. Enable it or run without native auto handoff.`;
      return { decision: "pause_for_user", settings, resumeHint, units: [unit(phase, "pause-for-user", settings, { resumeHint, source: "phase-signal" })] };
    }
    return { decision: "dispatch", settings, units: units.slice(startIndex) };
  }
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
  if (type === "ui-safety-gate") return "ui_safety_gate";
  if (type === "security-review") return "security_enforcement";
  if (type === "nyquist-validation") return "nyquist_validation";
  if (type === "ai-integration") return "ai_integration_phase";
  if (type === "code-review") return "code_review";
  if (type === "discuss") return "skip_discuss";
  if (type === "settings-gate") return "ui_phase";
  return void 0;
}
function inferPhaseSignals(options) {
  const cwd = options.cwd ?? process.cwd();
  const phaseRoot = join4(cwd, ".planning", "phases");
  const phaseText = readPhaseSignalText(phaseRoot, options.phase).toLowerCase();
  return {
    isUiPhase: /(?:requires|phase[_ -]signals?):[^\n]*(?:ui|frontend)|(?:^|\n)phase-kind:\s*(?:ui|frontend)/.test(phaseText),
    requiresUiReview: /(?:requires|phase[_ -]signals?):[^\n]*(?:ui-review|visual-audit)/.test(phaseText),
    requiresSecurityReview: /(?:requires|phase[_ -]signals?):[^\n]*(?:security-review|security-enforcement)/.test(phaseText),
    requiresNyquistValidation: /(?:requires|phase[_ -]signals?):[^\n]*(?:nyquist-validation|coverage-gap-validation)/.test(phaseText),
    isAiPhase: /(?:requires|phase[_ -]signals?):[^\n]*(?:ai-integration|llm|eval)|(?:^|\n)phase-kind:\s*(?:ai|llm)/.test(phaseText)
  };
}
function readPhaseSignalText(phaseRoot, phase) {
  try {
    const direct = readdirSync(phaseRoot, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`));
    if (!direct) return "";
    return readdirSync(join4(phaseRoot, direct.name)).filter((name) => /(^|-)PLAN\.md$/i.test(name) || /^phase-signals\.(md|json|ya?ml)$/i.test(name)).map((name) => {
      try {
        return readFileSync3(join4(phaseRoot, direct.name, name), "utf8");
      } catch {
        return "";
      }
    }).filter((text) => /(?:requires|phase[_ -]signals?|phase-kind):/i.test(text)).join("\n");
  } catch {
    return "";
  }
}
function readConfig(configPath) {
  try {
    return JSON.parse(readFileSync3(configPath, "utf8"));
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
import { existsSync as existsSync11, readdirSync as readdirSync3, readFileSync as readFileSync9, statSync as statSync3 } from "fs";
import { basename as basename2, isAbsolute as isAbsolute2, join as join10, resolve as resolve2 } from "path";

// src/orchestrator/reconciliation.ts
import { relative as relative2 } from "path";

// src/state-reconciliation/index.ts
import { existsSync as existsSync10 } from "fs";
import { join as join9 } from "path";

// src/state-reconciliation/drift/noncanonical-plan-like-file.ts
function detectNoncanonicalPlanLikeFiles(input) {
  return {
    repairs: [],
    blockers: [],
    evidence: input.snapshot.phases.flatMap((phase) => phase.noncanonical)
  };
}

// src/state-reconciliation/drift/completion-timestamp.ts
import { readFileSync as readFileSync4 } from "fs";
function detectCompletionTimestampDrift(input) {
  if (!input.roadmap) return empty();
  const repairs = [];
  const blockers = [];
  for (const row of input.roadmap.phases) {
    const phase = input.snapshot.phases.find((candidate) => candidate.phase === row.phase);
    if (!phase || phase.plans.length === 0 || phase.summaries.length !== phase.plans.length) continue;
    const provenDate = provenCompletionDate(phase.summaries);
    const evidence = [
      {
        reasonCode: "completion-timestamp-drift",
        path: row.path,
        phase: row.phase,
        artifact: "roadmap",
        message: "ROADMAP row considered for completion timestamp repair.",
        metadata: { line: row.line }
      },
      ...phase.summaries.map((path) => ({
        reasonCode: "completion-timestamp-drift",
        path,
        phase: row.phase,
        artifact: "summary",
        message: "Canonical summary considered for ROADMAP completion timestamp."
      }))
    ];
    if (!provenDate) {
      if (row.status !== "Complete") continue;
      blockers.push({
        reasonCode: "completion-timestamp-drift",
        phase: row.phase,
        artifact: "roadmap",
        message: `ROADMAP phase ${row.phase} completion timestamp cannot be repaired because canonical summaries do not prove one timestamp.`,
        evidence,
        suggestedNextAction: "manual-review"
      });
      continue;
    }
    if (row.completed === provenDate) continue;
    repairs.push({
      reasonCode: "completion-timestamp-drift",
      action: "update-roadmap-completed",
      phase: row.phase,
      path: row.path,
      description: `Update ROADMAP phase ${row.phase} completed timestamp to ${provenDate}.`,
      evidence
    });
  }
  return { repairs, blockers, evidence: [] };
}
function provenCompletionDate(summaryPaths) {
  const dates = /* @__PURE__ */ new Set();
  for (const path of summaryPaths) {
    const match = /^completed:\s*["']?(?<date>\d{4}-\d{2}-\d{2})["']?\s*$/m.exec(readFileSync4(path, "utf8"));
    if (match?.groups) dates.add(match.groups.date);
  }
  return dates.size === 1 ? [...dates][0] : void 0;
}
function empty() {
  return { repairs: [], blockers: [], evidence: [] };
}

// src/state-reconciliation/drift/roadmap-divergence.ts
function detectRoadmapDivergence(input) {
  if (!input.roadmap) return empty2();
  const repairs = [];
  const blockers = [];
  for (const row of input.roadmap.phases) {
    const phase = input.snapshot.phases.find((candidate) => candidate.phase === row.phase);
    if (!phase) continue;
    const expectedComplete = phase.summaries.length;
    const expectedTotal = phase.plans.length;
    const expectedStatus = expectedTotal > 0 && expectedComplete === expectedTotal ? "Complete" : "Executing";
    const diverges = row.plansComplete !== expectedComplete || row.totalPlans !== expectedTotal || row.status !== expectedStatus;
    if (!diverges) continue;
    const evidence = [{
      reasonCode: "roadmap-divergence",
      path: row.path,
      phase: row.phase,
      artifact: "summary",
      message: `ROADMAP row has ${row.plansComplete}/${row.totalPlans} ${row.status}; canonical artifacts show ${expectedComplete}/${expectedTotal} ${expectedStatus}.`,
      metadata: {
        line: row.line,
        plansComplete: row.plansComplete,
        totalPlans: row.totalPlans,
        canonicalPlans: expectedTotal,
        canonicalSummaries: expectedComplete
      }
    }];
    if (expectedTotal > 0 && expectedComplete === expectedTotal) {
      repairs.push({
        reasonCode: "roadmap-divergence",
        action: "update-roadmap-row",
        phase: row.phase,
        path: row.path,
        description: `Update ROADMAP phase ${row.phase} row to ${expectedComplete}/${expectedTotal} ${expectedStatus}.`,
        evidence
      });
      continue;
    }
    if (input.activeUnitId === `${row.phase}:execute` && expectedStatus === "Executing") {
      continue;
    }
    blockers.push({
      reasonCode: "roadmap-divergence",
      phase: row.phase,
      artifact: "roadmap",
      message: `ROADMAP phase ${row.phase} metadata cannot be mechanically proven from canonical artifacts.`,
      evidence,
      suggestedNextAction: "manual-review"
    });
  }
  return { repairs, blockers, evidence: [] };
}
function empty2() {
  return { repairs: [], blockers: [], evidence: [] };
}

// src/state-reconciliation/drift/sketch-flag.ts
function detectSketchFlagDrift(input) {
  if (!input.sketch) return empty3();
  if (typeof input.sketch.observedEnabled === "boolean" && input.sketch.observedEnabled === input.sketch.expectedEnabled) return empty3();
  const evidence = input.sketch.evidencePaths.map((path) => ({
    reasonCode: "sketch-flag-drift",
    path,
    phase: input.sketch?.phase,
    message: "Sketch metadata was considered but does not mechanically prove the ROADMAP flag."
  }));
  return {
    repairs: [],
    blockers: [{
      reasonCode: "sketch-flag-drift",
      phase: input.sketch.phase,
      artifact: "roadmap",
      message: "Sketch flag drift is not mechanically provable from available sketch metadata.",
      evidence,
      suggestedNextAction: "manual-review"
    }],
    evidence: []
  };
}
function empty3() {
  return { repairs: [], blockers: [], evidence: [] };
}

// src/state-reconciliation/drift/stale-worker.ts
function detectStaleWorker(input) {
  const journal = input.journal;
  if (!journal?.ok || journal.journal?.snapshot.status !== "running") return empty4();
  const currentUnit = unitId(journal.journal.snapshot.currentUnit);
  if (currentUnit && currentUnit === input.activeUnitId) return empty4();
  const evidence = [{
    reasonCode: "stale-worker",
    path: journal.path,
    message: "Journal has an active worker snapshot that requires recovery classification.",
    metadata: currentUnit ? { currentUnit } : void 0
  }];
  return {
    repairs: [],
    blockers: [{
      reasonCode: "stale-worker",
      artifact: "journal",
      message: "Journal active worker state requires recovery classification.",
      evidence,
      suggestedNextAction: "requires-recovery-classification"
    }],
    evidence: []
  };
}
function unitId(value) {
  if (!value || typeof value !== "object") return void 0;
  const id = value.id;
  return typeof id === "string" ? id : void 0;
}
function empty4() {
  return { repairs: [], blockers: [], evidence: [] };
}

// src/state-reconciliation/drift/summary-count-mismatch.ts
import { basename } from "path";
function detectSummaryCountMismatch(input) {
  const blockers = [];
  if (input.activeUnitId?.endsWith(":execute")) {
    return { repairs: [], blockers: [], evidence: [] };
  }
  for (const phase of input.snapshot.phases) {
    const summaries = new Set(phase.summaries.map((path) => artifactPlan(path, "SUMMARY")));
    const missing = phase.plans.map((path) => ({ path, plan: artifactPlan(path, "PLAN") })).filter((plan) => plan.plan && !summaries.has(plan.plan));
    if (missing.length === 0) continue;
    const evidence = missing.map(({ path, plan }) => ({
      reasonCode: "summary-count-mismatch",
      path,
      phase: phase.phase,
      plan,
      artifact: "summary",
      message: `Canonical plan ${basename(path)} has no matching ${phase.phase}-${plan}-SUMMARY.md artifact.`
    }));
    blockers.push({
      reasonCode: "summary-count-mismatch",
      phase: phase.phase,
      artifact: "summary",
      message: `Phase ${phase.phase} is missing canonical summary artifacts: ${missing.map(({ plan }) => `${phase.phase}-${plan}-SUMMARY.md`).join(", ")}.`,
      evidence,
      suggestedNextAction: "manual-review"
    });
  }
  return { repairs: [], blockers, evidence: [] };
}
function artifactPlan(path, suffix) {
  const pattern = new RegExp(`^\\d{2}-(\\d{2})-${suffix}\\.md$`);
  return pattern.exec(basename(path))?.[1];
}

// src/state-reconciliation/drift/unknown-drift.ts
function detectUnknownDrift(input) {
  return {
    repairs: [],
    blockers: (input.unsupportedMismatches ?? []).map((mismatch) => ({
      reasonCode: "unknown-drift",
      artifact: "state",
      message: `Unsupported drift mismatch: ${mismatch.message}`,
      evidence: [{
        reasonCode: "unknown-drift",
        path: mismatch.path,
        message: mismatch.message
      }],
      suggestedNextAction: "manual-review"
    })),
    evidence: []
  };
}

// src/state-reconciliation/drift/unregistered-milestone.ts
function detectUnregisteredMilestone(input) {
  const state = input.state;
  const milestone = state?.frontmatter.milestone;
  if (!state || typeof milestone !== "string" || !input.roadmap) return empty5();
  const knownMilestones = new Set(input.roadmap.phases.map((phase) => phase.milestone));
  if (knownMilestones.has(milestone)) return empty5();
  const evidence = [
    {
      reasonCode: "unregistered-milestone",
      path: state.path,
      message: `STATE references milestone ${milestone}.`,
      metadata: { milestone }
    },
    {
      reasonCode: "unregistered-milestone",
      path: input.roadmap.path,
      message: `ROADMAP progress table does not register milestone ${milestone}.`,
      metadata: { milestone }
    }
  ];
  return {
    repairs: [],
    blockers: [{
      reasonCode: "unregistered-milestone",
      artifact: "roadmap",
      message: `Milestone ${milestone} is not registered in ROADMAP metadata; Phase 10 must not synthesize milestone prose.`,
      evidence,
      suggestedNextAction: "manual-review"
    }],
    evidence: []
  };
}
function empty5() {
  return { repairs: [], blockers: [], evidence: [] };
}

// src/state-reconciliation/catalog.ts
var DETECTORS = [
  detectSummaryCountMismatch,
  detectRoadmapDivergence,
  detectCompletionTimestampDrift,
  detectSketchFlagDrift,
  detectStaleWorker,
  detectUnregisteredMilestone,
  detectNoncanonicalPlanLikeFiles,
  detectUnknownDrift
];
function classifyDrift(input) {
  return DETECTORS.reduce((combined, detector) => {
    const result = detector(input);
    combined.repairs.push(...result.repairs);
    combined.blockers.push(...result.blockers);
    combined.evidence.push(...result.evidence);
    return combined;
  }, { repairs: [], blockers: [], evidence: [] });
}

// src/state-reconciliation/journal.ts
import { existsSync as existsSync5, readFileSync as readFileSync5 } from "fs";
import { join as join5 } from "path";
function readJournalState(basePath) {
  const path = join5(basePath, ".planning", "orchestration-state.json");
  if (!existsSync5(path)) {
    return { ok: true, path, blockers: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync5(path, "utf8"));
    if (!isJournal(parsed)) {
      return blocked(path, "orchestration-state.json has an invalid journal shape.");
    }
    return { ok: true, path, journal: parsed, blockers: [] };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return blocked(path, `Failed to parse orchestration-state.json: ${detail}`);
  }
}
function applyJournalMetadataRepair(content, repair) {
  if (repair.action !== "update-journal-metadata") return content;
  if (!repair.before || !repair.after) throw new Error("Journal metadata repair requires before and after text.");
  const parsed = JSON.parse(content);
  if (!isJournal(parsed)) throw new Error("Journal metadata repair target has an invalid journal shape.");
  if (!content.includes(repair.before)) return content;
  const next = content.replace(repair.before, repair.after);
  const reparsed = JSON.parse(next);
  if (!isJournal(reparsed)) throw new Error("Journal metadata repair would create an invalid journal shape.");
  return next;
}
function isJournal(value) {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  return candidate.version === 1 && !!candidate.snapshot && typeof candidate.snapshot === "object" && Array.isArray(candidate.events);
}
function blocked(path, message) {
  return {
    ok: false,
    path,
    blockers: [{
      reasonCode: "unknown-drift",
      artifact: "journal",
      message: `${message} (${path})`,
      evidence: [{
        reasonCode: "unknown-drift",
        path,
        message
      }],
      suggestedNextAction: "manual-review"
    }]
  };
}

// src/state-reconciliation/repair.ts
import { existsSync as existsSync8, readFileSync as readFileSync8, writeFileSync as writeFileSync2 } from "fs";
import { isAbsolute, relative, resolve } from "path";

// src/state-reconciliation/roadmap.ts
import { existsSync as existsSync6, readFileSync as readFileSync6 } from "fs";
import { join as join6 } from "path";
function readRoadmapState(basePath) {
  const path = join6(basePath, ".planning", "ROADMAP.md");
  if (!existsSync6(path)) {
    return {
      path,
      phases: [],
      blockers: [metadataBlocker("roadmap", path, "Missing ROADMAP.md metadata file.")]
    };
  }
  const lines = readFileSync6(path, "utf8").split(/\r?\n/);
  const phases = [];
  for (const [index, line] of lines.entries()) {
    const cells = parseTableRow(line);
    if (!cells) continue;
    const phase = /^(?<phase>\d+)\.\s*(?<title>.+)$/.exec(cells[0]);
    const plans = /^(?<complete>\d+)\/(?<total>\d+)$/.exec(cells[2]);
    if (!phase?.groups || !plans?.groups) continue;
    phases.push({
      phase: phase.groups.phase.padStart(2, "0"),
      title: phase.groups.title.trim(),
      milestone: cells[1],
      plansComplete: Number(plans.groups.complete),
      totalPlans: Number(plans.groups.total),
      status: cells[3],
      completed: isBlankCompleted(cells[4]) ? void 0 : cells[4],
      path,
      line: index + 1
    });
  }
  return { path, phases, blockers: [] };
}
function applyRoadmapRepair(content, repair) {
  if (repair.action !== "update-roadmap-row" && repair.action !== "update-roadmap-completed") return content;
  const lineNumber = repairLineNumber(repair);
  if (!lineNumber) throw new Error(`Repair ${repair.action} is missing ROADMAP line metadata.`);
  const lines = content.split(/\r?\n/);
  const lineIndex = lineNumber - 1;
  const cells = parseTableRow(lines[lineIndex] ?? "");
  if (!cells) throw new Error(`ROADMAP line ${lineNumber} is not a metadata table row.`);
  if (repair.action === "update-roadmap-row") {
    const complete = repairNumber(repair, "canonicalSummaries");
    const total = repairNumber(repair, "canonicalPlans");
    cells[2] = `${complete}/${total}`;
    cells[3] = total > 0 && complete === total ? "Complete" : "Executing";
  }
  if (repair.action === "update-roadmap-completed") {
    const date = /(?<date>\d{4}-\d{2}-\d{2})/.exec(repair.description)?.groups?.date;
    if (!date) throw new Error("Completion timestamp repair is missing a proven date.");
    cells[4] = date;
  }
  lines[lineIndex] = `| ${cells.join(" | ")} |`;
  return lines.join("\n");
}
function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return void 0;
  if (/^\|\s*-+/.test(trimmed)) return void 0;
  const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.length >= 5 ? cells : void 0;
}
function repairLineNumber(repair) {
  const line = repair.evidence.find((item) => typeof item.metadata?.line === "number")?.metadata?.line;
  return typeof line === "number" ? line : void 0;
}
function repairNumber(repair, key) {
  const value = repair.evidence.find((item) => typeof item.metadata?.[key] === "number")?.metadata?.[key];
  if (typeof value !== "number") throw new Error(`Repair ${repair.action} is missing ${key} metadata.`);
  return value;
}
function isBlankCompleted(value) {
  return value === "" || value === "-" || value === "\u2014";
}
function metadataBlocker(artifact, path, message) {
  return {
    reasonCode: "unknown-drift",
    artifact,
    message: `${message} (${path})`,
    evidence: [{
      reasonCode: "unknown-drift",
      path,
      message
    }],
    suggestedNextAction: "manual-review"
  };
}

// src/state-reconciliation/state.ts
import { existsSync as existsSync7, readFileSync as readFileSync7 } from "fs";
import { join as join7 } from "path";
function readStateDigest(basePath) {
  const path = join7(basePath, ".planning", "STATE.md");
  if (!existsSync7(path)) {
    return {
      path,
      frontmatter: {},
      currentPosition: {},
      blockers: [metadataBlocker2(path, "Missing STATE.md metadata file.")]
    };
  }
  const content = readFileSync7(path, "utf8");
  return {
    path,
    frontmatter: parseFrontmatter(content),
    currentPosition: parseCurrentPosition(content),
    blockers: []
  };
}
function applyStateMetadataRepair(content, repair) {
  if (repair.action !== "update-state-metadata") return content;
  if (!repair.before || !repair.after) throw new Error("STATE metadata repair requires before and after text.");
  assertStateMetadataOnly(repair.before);
  assertStateMetadataOnly(repair.after);
  return content.includes(repair.before) ? content.replace(repair.before, repair.after) : content;
}
function parseFrontmatter(content) {
  const match = /^---\r?\n(?<body>[\s\S]*?)\r?\n---/.exec(content);
  if (!match?.groups) return {};
  const root = {};
  let currentObject;
  for (const rawLine of match.groups.body.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const nested = /^ {2}(?<key>[^:]+):\s*(?<value>.*)$/.exec(rawLine);
    if (nested?.groups && currentObject) {
      currentObject[nested.groups.key.trim()] = scalar(nested.groups.value.trim());
      continue;
    }
    currentObject = void 0;
    const top = /^(?<key>[^:]+):\s*(?<value>.*)$/.exec(rawLine);
    if (!top?.groups) continue;
    const key = top.groups.key.trim();
    const value = top.groups.value.trim();
    if (value === "") {
      const child = {};
      root[key] = child;
      currentObject = child;
      continue;
    }
    root[key] = scalar(value);
  }
  return root;
}
function assertStateMetadataOnly(text) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^(status|last_updated|last_activity|Phase|Plan|Progress):/.test(line.trim())) continue;
    if (/^ {2}(total_phases|completed_phases|total_plans|completed_plans|percent):/.test(line)) continue;
    throw new Error(`STATE metadata repair may not change non-metadata line: ${line}`);
  }
}
function parseCurrentPosition(content) {
  const section = currentPositionSection(content);
  const digest = {};
  for (const line of section.split(/\r?\n/)) {
    const phase = /^Phase:\s*(?<phase>\d+)(?:\s*\((?<name>[^)]+)\))?\s*(?:[\u2014-]\s*(?<status>.+))?\s*$/.exec(line.trim());
    if (phase?.groups) {
      digest.phase = phase.groups.phase.padStart(2, "0");
      if (phase.groups.name) digest.phaseName = phase.groups.name.trim();
      if (phase.groups.status) digest.phaseStatus = phase.groups.status.trim();
      continue;
    }
    const plan = /^Plan:\s*(?<current>\d+)\s+of\s+(?<total>\d+)/.exec(line.trim());
    if (plan?.groups) {
      digest.plan = Number(plan.groups.current);
      digest.totalPlans = Number(plan.groups.total);
      continue;
    }
    const progress = /^Progress:.*?(?<percent>\d+)%/.exec(line.trim());
    if (progress?.groups) digest.percent = Number(progress.groups.percent);
  }
  return digest;
}
function currentPositionSection(content) {
  const match = /## Current Position\r?\n(?<body>[\s\S]*?)(?:\r?\n## |\s*$)/.exec(content);
  return match?.groups?.body ?? "";
}
function scalar(value) {
  const unquoted = value.replace(/^["']|["']$/g, "");
  return /^\d+$/.test(unquoted) ? Number(unquoted) : unquoted;
}
function metadataBlocker2(path, message) {
  return {
    reasonCode: "unknown-drift",
    artifact: "state",
    message: `${message} (${path})`,
    evidence: [{
      reasonCode: "unknown-drift",
      path,
      message
    }],
    suggestedNextAction: "manual-review"
  };
}

// src/state-reconciliation/repair.ts
function planRepairs(detection) {
  return [...detection.repairs].sort((left, right) => repairKey(left).localeCompare(repairKey(right)));
}
function applyRepairs(basePath, repairs, fs = defaultFileSystem) {
  const written = [];
  const blockers = [];
  for (const repair of planRepairs({ repairs })) {
    const precondition = checkPreconditions(basePath, repair, fs);
    if (precondition) {
      blockers.push(written.length > 0 ? partialWriteBlocker(precondition.message, repair, written) : precondition);
      break;
    }
    const path = repair.path;
    try {
      const before = fs.readFile(path);
      const after = applyRepairContent(before, repair);
      if (after === before) continue;
      fs.writeFile(path, after);
      written.push({ kind: repairKind(path), reasonCode: repair.reasonCode, path, action: "update" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      blockers.push(partialWriteBlocker(`Failed to apply repair: ${detail}`, repair, written));
      break;
    }
  }
  return { ok: blockers.length === 0, written, blockers };
}
function repairKey(repair) {
  return [
    repair.path ?? "",
    repair.phase ?? "",
    repair.plan ?? "",
    repair.reasonCode,
    repair.action
  ].join("\0");
}
function applyRepairContent(content, repair) {
  if (repair.action === "update-roadmap-row" || repair.action === "update-roadmap-completed") {
    return applyRoadmapRepair(content, repair);
  }
  if (repair.action === "update-state-metadata") return applyStateMetadataRepair(content, repair);
  if (repair.action === "update-journal-metadata") return applyJournalMetadataRepair(content, repair);
  return content;
}
function checkPreconditions(basePath, repair, fs) {
  if (!repair.path) return repairBlocker("Repair target path is missing.", repair);
  if (!isInsidePlanning(basePath, repair.path)) return repairBlocker(`Repair target is outside .planning: ${repair.path}`, repair);
  if (!fs.exists(repair.path)) return repairBlocker(`Repair target does not exist: ${repair.path}`, repair);
  return void 0;
}
function isInsidePlanning(basePath, path) {
  const planningRoot = resolve(basePath, ".planning");
  const target = resolve(path);
  const rel = relative(planningRoot, target);
  return rel === "" || !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}
function repairBlocker(message, repair) {
  return {
    reasonCode: "unknown-drift",
    message,
    evidence: repair.evidence,
    repairPlan: [repair],
    suggestedNextAction: "manual-review"
  };
}
function partialWriteBlocker(message, repair, written) {
  return {
    reasonCode: "partial-write",
    message,
    evidence: repair.evidence,
    repairPlan: [repair],
    written,
    suggestedNextAction: "rerun-reconcile"
  };
}
function repairKind(path) {
  if (path.endsWith("ROADMAP.md")) return "roadmap";
  if (path.endsWith("STATE.md")) return "state";
  if (path.endsWith("orchestration-state.json")) return "journal";
  return void 0;
}
var defaultFileSystem = {
  exists: existsSync8,
  readFile: (path) => readFileSync8(path, "utf8"),
  writeFile: (path, content) => writeFileSync2(path, content, "utf8")
};

// src/state-reconciliation/scan.ts
import { existsSync as existsSync9, readdirSync as readdirSync2, statSync as statSync2 } from "fs";
import { join as join8 } from "path";

// src/state-reconciliation/artifacts.ts
var PLAN_ARTIFACT = /^(?<phase>\d{2})-(?<plan>\d{2})-PLAN\.md$/;
var SUMMARY_ARTIFACT = /^(?<phase>\d{2})-(?<plan>\d{2})-SUMMARY\.md$/;
var PHASE_ARTIFACTS = [
  [/^(?<phase>\d{2})-VERIFICATION\.md$/, "verification"],
  [/^(?<phase>\d{2})-REVIEW\.md$/, "review"],
  [/^(?<phase>\d{2})-CONTEXT\.md$/, "context"]
];
var PLAN_LIKE_MARKDOWN = /^(?<phase>\d{2})-.*PLAN.*\.md$/;
function classifyArtifactName(filename) {
  const plan = PLAN_ARTIFACT.exec(filename);
  if (plan?.groups) return canonical(filename, "plan", plan.groups.phase, plan.groups.plan);
  const summary = SUMMARY_ARTIFACT.exec(filename);
  if (summary?.groups) return canonical(filename, "summary", summary.groups.phase, summary.groups.plan);
  for (const [pattern, kind] of PHASE_ARTIFACTS) {
    const match = pattern.exec(filename);
    if (match?.groups) return canonical(filename, kind, match.groups.phase);
  }
  const planLike = PLAN_LIKE_MARKDOWN.exec(filename);
  if (planLike?.groups) {
    return {
      canonical: false,
      filename,
      kind: "noncanonical",
      phase: planLike.groups.phase,
      reasonCode: "noncanonical-plan-like-file",
      evidence: {
        reasonCode: "noncanonical-plan-like-file",
        phase: planLike.groups.phase,
        artifact: "noncanonical",
        message: "Plan-like markdown does not match canonical NN-YY-PLAN.md naming."
      }
    };
  }
  return { canonical: false, filename, kind: "ignored" };
}
function canonical(filename, kind, phase, plan) {
  return { canonical: true, filename, kind, phase, ...plan ? { plan } : {} };
}

// src/state-reconciliation/scan.ts
function scanPlanningArtifacts(basePath) {
  const phasesPath = join8(basePath, ".planning", "phases");
  if (!existsSync9(phasesPath)) {
    const blocker = {
      reasonCode: "unknown-drift",
      artifact: "state",
      message: `Missing .planning/phases directory at ${phasesPath}`,
      evidence: [],
      suggestedNextAction: "manual-review"
    };
    return { phasesPath, phases: [], totals: emptyTotals(), evidence: [], blockers: [blocker] };
  }
  const phases = /* @__PURE__ */ new Map();
  const evidence = [];
  const blockers = [];
  for (const entry of readdirSync2(phasesPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const phaseDir = join8(phasesPath, entry.name);
    for (const file of readdirSync2(phaseDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isFile()) continue;
      const path = join8(phaseDir, file.name);
      if (!statSync2(path).isFile()) continue;
      const classification = classifyArtifactName(file.name);
      if (classification.canonical) {
        const phase = getOrCreatePhase(phases, classification.phase, phaseDir);
        if (classification.kind === "plan") phase.plans.push(path);
        if (classification.kind === "summary") phase.summaries.push(path);
        if (classification.kind === "verification") phase.verifications.push(path);
        if (classification.kind === "review") phase.reviews.push(path);
        if (classification.kind === "context") phase.contexts.push(path);
        continue;
      }
      if (classification.reasonCode === "noncanonical-plan-like-file" && classification.evidence) {
        const item = { ...classification.evidence, path };
        evidence.push(item);
        if (classification.phase) getOrCreatePhase(phases, classification.phase, phaseDir).noncanonical.push(item);
      }
    }
  }
  const phaseList = [...phases.values()].sort((a, b) => a.phase.localeCompare(b.phase));
  return {
    phasesPath,
    phases: phaseList,
    totals: {
      plans: sum(phaseList, "plans"),
      summaries: sum(phaseList, "summaries"),
      verifications: sum(phaseList, "verifications"),
      reviews: sum(phaseList, "reviews"),
      contexts: sum(phaseList, "contexts"),
      noncanonical: sum(phaseList, "noncanonical")
    },
    evidence,
    blockers
  };
}
function getOrCreatePhase(phases, phase, directory) {
  const existing = phases.get(phase);
  if (existing) return existing;
  const created = {
    phase,
    directory,
    plans: [],
    summaries: [],
    verifications: [],
    reviews: [],
    contexts: [],
    noncanonical: []
  };
  phases.set(phase, created);
  return created;
}
function emptyTotals() {
  return { plans: 0, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 };
}
function sum(phases, key) {
  return phases.reduce((total, phase) => total + phase[key].length, 0);
}

// src/state-reconciliation/errors.ts
var ReconciliationFailedError = class extends Error {
  static suggestedNextActions = [
    "manual-review",
    "rerun-reconcile",
    "requires-recovery-classification"
  ];
  reasonCode;
  blockers;
  repairPlan;
  evidence;
  suggestedNextAction;
  report;
  constructor(report) {
    const firstBlocker = report.blockers[0];
    const reasonCode = firstBlocker?.reasonCode ?? "unknown-drift";
    super(`State reconciliation failed: ${reasonCode}`);
    this.name = "ReconciliationFailedError";
    this.reasonCode = reasonCode;
    this.blockers = report.blockers;
    this.repairPlan = firstBlocker?.repairPlan?.length ? firstBlocker.repairPlan : report.repairs;
    this.evidence = uniqueEvidence([
      ...report.evidence,
      ...report.blockers.flatMap((blocker) => blocker.evidence)
    ]);
    this.suggestedNextAction = firstBlocker?.suggestedNextAction ?? suggestedActionFor(reasonCode);
    this.report = report;
  }
};
function uniqueEvidence(evidence) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of evidence) {
    const key = JSON.stringify({
      reasonCode: item.reasonCode,
      path: item.path,
      paths: item.paths,
      phase: item.phase,
      plan: item.plan,
      artifact: item.artifact,
      message: item.message
    });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
function suggestedActionFor(reasonCode) {
  if (reasonCode === "partial-write") return "rerun-reconcile";
  if (reasonCode === "stale-worker") return "requires-recovery-classification";
  return "manual-review";
}

// src/state-reconciliation/index.ts
function reconcileBeforeDispatch(basePath, options = {}) {
  const scan = scanPlanningArtifacts(basePath);
  const snapshot = {
    phasesPath: scan.phasesPath,
    phases: scan.phases,
    totals: scan.totals
  };
  const roadmap = readOptionalRoadmapState(basePath);
  const state = readOptionalStateDigest(basePath);
  const journal = readJournalState(basePath);
  const detection = classifyDrift({ snapshot, roadmap, state, journal, activeUnitId: options.activeUnitId });
  const blockers = [
    ...scan.blockers,
    ...roadmap?.blockers ?? [],
    ...state?.blockers ?? [],
    ...journal.blockers,
    ...detection.blockers
  ];
  const repairs = planRepairs(detection);
  const application = options.apply && blockers.length === 0 ? applyRepairs(basePath, repairs, options.fileSystem) : { ok: true, blockers: [], written: [] };
  return {
    ok: blockers.length === 0 && application.ok,
    snapshot,
    repairs,
    blockers: [...blockers, ...application.blockers],
    written: application.written,
    evidence: [...scan.evidence, ...detection.evidence]
  };
}
function readOptionalRoadmapState(basePath) {
  return existsSync10(join9(basePath, ".planning", "ROADMAP.md")) ? readRoadmapState(basePath) : void 0;
}
function readOptionalStateDigest(basePath) {
  return existsSync10(join9(basePath, ".planning", "STATE.md")) ? readStateDigest(basePath) : void 0;
}

// src/orchestrator/reconciliation.ts
var maxEvidenceItems = 20;
var maxEvidenceLength = 240;
function reconcileBeforeDispatch2(snapshot, unit2) {
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
  const basePath = snapshot.cwd ?? process.cwd();
  const report = reconcileBeforeDispatch(basePath, {
    activeUnitId: unit2.id,
    apply: snapshot.settings.workflow.state_reconciliation_apply === true
  });
  if (!report.ok) return toGateFailure(toReconciliationFailedError(report), basePath);
  return {
    ok: true,
    gate: "reconcileBeforeDispatch",
    evidence: [
      "native-state-reconciliation",
      `repairs:${report.repairs.length}`,
      `written:${report.written.length}`
    ]
  };
}
function toReconciliationFailedError(report) {
  return new ReconciliationFailedError(report);
}
function toGateFailure(error, basePath = process.cwd()) {
  return {
    ok: false,
    gate: "reconcileBeforeDispatch",
    reason: error.reasonCode,
    retryable: false,
    resumeHint: `State reconciliation blocked dispatch: ${error.reasonCode}. Inspect structured blockers before continuing.`,
    evidence: boundedGateEvidence(error, basePath)
  };
}
function boundedGateEvidence(error, basePath) {
  const values = [
    `reason:${error.reasonCode}`,
    `suggestedNextAction:${error.suggestedNextAction}`,
    ...error.blockers.flatMap((blocker) => [
      `blocker:${blocker.reasonCode}`,
      ...blocker.evidence.flatMap((evidence) => evidenceToStrings(evidence, basePath))
    ])
  ];
  return [...new Set(values.map(truncateEvidence))].slice(0, maxEvidenceItems);
}
function evidenceToStrings(evidence, basePath) {
  const values = [`evidence:${evidence.reasonCode}`];
  if (evidence.path) values.push(`path:${safeRelativePath(basePath, evidence.path)}`);
  for (const path of evidence.paths ?? []) values.push(`path:${safeRelativePath(basePath, path)}`);
  if (evidence.phase) values.push(`phase:${evidence.phase}`);
  if (evidence.plan) values.push(`plan:${evidence.plan}`);
  return values;
}
function safeRelativePath(basePath, path) {
  const rel = relative2(basePath, path);
  return rel && !rel.startsWith("..") ? rel : path;
}
function truncateEvidence(value) {
  return value.length <= maxEvidenceLength ? value : `${value.slice(0, maxEvidenceLength)}...`;
}

// src/orchestrator/gates.ts
function runPreDispatchGates(snapshot, unit2, overrides = {}) {
  const orderedGates = [
    ["reconcileBeforeDispatch", overrides.reconcileBeforeDispatch ?? reconcileBeforeDispatch2],
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
  const exists = options.exists ?? existsSync11;
  const cwd = options.cwd ?? process.cwd();
  const phaseDir = join10(cwd, ".planning", "phases");
  if (unit2.type === "plan") {
    return existsMatching(cwd, phaseDir, unit2.phase, "PLAN.md", exists, options.written) ? pass("artifact", "plan artifact exists") : fail("Plan Unit did not produce a *-PLAN.md artifact.", [`missing:${unit2.phase}-*-PLAN.md`]);
  }
  if (unit2.type === "execute") {
    return existsMatching(cwd, phaseDir, unit2.phase, "SUMMARY.md", exists, options.written) ? pass("artifact", "summary artifact exists") : fail("Execute Unit did not produce a *-SUMMARY.md artifact.", [`missing:${unit2.phase}-*-SUMMARY.md`]);
  }
  if (unit2.type === "verify") {
    if (options.verifierSkip || !snapshot.settings.workflow.verifier) return pass("artifact", "verifier skipped by settings");
    return existsMatching(cwd, phaseDir, unit2.phase, "VERIFICATION.md", exists, options.written) ? pass("artifact", "verification artifact exists") : fail("Verify Unit did not produce a *-VERIFICATION.md artifact.", [`missing:${unit2.phase}-*-VERIFICATION.md`]);
  }
  if (unit2.type === "closeout") {
    return closeoutEvidence(cwd, unit2.phase, options.written) ? pass("artifact", "closeout roadmap/state evidence exists") : fail("Closeout Unit requires ROADMAP and STATE evidence for the phase.", [`missing-closeout-evidence:${unit2.phase}`]);
  }
  return pass("artifact", `${unit2.type} has no Phase 9 artifact gate`);
}
function decideDispatch(_snapshot, unit2) {
  const knownTypes = ["discuss", "research", "plan", "plan-check", "execute", "code-review", "verify", "ui-review", "security-review", "nyquist-validation", "ai-integration", "ui-safety-gate", "closeout", "settings-gate", "pause-for-user"];
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
function existsMatching(cwd, phaseRoot, phase, suffix, exists, written) {
  if (!written?.length) return false;
  const writtenSet = new Set(written.map((path) => normalizeWrittenPath(cwd, path)));
  const artifactPattern = new RegExp(`^${escapeRegExp(phase)}(?:-\\d+)?-${escapeRegExp(suffix)}$`);
  try {
    const candidates = [
      ...readdirSync3(phaseRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join10(phaseRoot, entry.name)),
      ...readdirSync3(phaseRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`)).flatMap((entry) => readdirSync3(join10(phaseRoot, entry.name), { withFileTypes: true }).filter((child) => child.isFile()).map((child) => join10(phaseRoot, entry.name, child.name)))
    ];
    return candidates.some((path) => artifactPattern.test(basename2(path)) && writtenSet.has(resolve2(path)) && exists(path));
  } catch {
    return false;
  }
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeWrittenPath(cwd, value) {
  return resolve2(isAbsolute2(value) ? value : resolve2(cwd, value));
}
function closeoutEvidence(cwd, phase, written) {
  if (!written?.length) return false;
  const writtenSet = new Set(written.map((path) => normalizeWrittenPath(cwd, path)));
  const roadmapPath = resolve2(cwd, ".planning", "ROADMAP.md");
  const statePath = resolve2(cwd, ".planning", "STATE.md");
  if (!writtenSet.has(roadmapPath) || !writtenSet.has(statePath)) return false;
  try {
    const roadmap = readFileSync9(roadmapPath, "utf8");
    const state = readFileSync9(statePath, "utf8");
    statSync3(join10(cwd, ".planning", "phases"));
    return roadmapPhaseComplete(roadmap, phase) && statePhaseComplete(state, phase);
  } catch {
    return false;
  }
}
function roadmapPhaseComplete(roadmap, phase) {
  const phaseNumber = Number(phase);
  return roadmap.split(/\r?\n/).some((line) => {
    const columns = line.split("|").map((part) => part.trim());
    if (columns.length < 6) return false;
    const [done, total] = columns[3].split("/").map((part) => Number(part));
    return columns[1].startsWith(`${phaseNumber}.`) && Number.isInteger(done) && Number.isInteger(total) && total > 0 && done === total && /^(Complete|✓ Done)$/.test(columns[4]);
  });
}
function statePhaseComplete(state, phase) {
  const currentPosition = extractCurrentPositionSection(state);
  if (!currentPosition) return false;
  const phaseNumber = Number(phase);
  return currentPosition.split(/\r?\n/).some((line) => {
    const normalized = line.trim();
    return normalized.startsWith(`Phase: ${phaseNumber} `) && /\(\*\*completed\*\*\)|\bcompleted\b/i.test(normalized) && !/\bnot\s+completed\b|\bnot\s+complete\b|\bincomplete\b/i.test(normalized);
  });
}
function extractCurrentPositionSection(state) {
  const match = state.match(/^## Current Position\s*\n([\s\S]*?)(?=\n##\s|$)/m);
  return match?.[1] ?? "";
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
    const completed2 = { ...snapshot, status: "completed" };
    return { ok: true, messages: ["orchestration complete"], snapshot: completed2, status: getSnapshotStatus(completed2) };
  }
  const unit2 = snapshot.currentUnit;
  const unitStarted = eventOf(snapshot, unit2, "unit_started", "running", options.now);
  const preGate = runPreDispatchGates(snapshot, unit2, options.gates);
  if (!preGate.ok) return handleGateFailure(snapshot, unit2, preGate, options.now);
  const dispatch = options.dispatch ?? defaultDispatch;
  const dispatchResult = dispatch(unit2, snapshot);
  if (!dispatchResult.ok) {
    const paused = pause(snapshot, unit2, "dispatch-failed", dispatchResult.messages[0] ?? "Dispatch failed; inspect adapter output.", options.now, dispatchResult.messages);
    return { ok: false, messages: dispatchResult.messages, snapshot: paused, status: getSnapshotStatus(paused), dispatched: unit2, events: [unitStarted, paused.lastEvent].filter((event) => Boolean(event)) };
  }
  const postGate = options.postDispatchGate ? options.postDispatchGate(snapshot, unit2) : runPostDispatchGate(snapshot, unit2, { cwd: snapshot.cwd, written: dispatchResult.written });
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
  const gatePassed = [...evidenceOf(preGate), ...evidenceOf(postGate)].map((evidence) => ({
    type: "gate_passed",
    ts: timestamp(options.now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "completed",
    attempt: snapshot.attempt,
    evidence: [evidence]
  }));
  const completed = status === "completed" ? eventOf({ ...advanced, currentUnit: unit2 }, unit2, "orchestration_completed", "completed", options.now) : void 0;
  return { ok: true, messages: dispatchResult.messages, snapshot: completed ? withEvent(advanced, completed) : advanced, status: getSnapshotStatus(completed ? withEvent(advanced, completed) : advanced), dispatched: unit2, events: [unitStarted, ...gatePassed, advanced.lastEvent, completed].filter((event) => Boolean(event)) };
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
function eventOf(snapshot, unit2, type, status, now) {
  return { type, ts: timestamp(now), phase: snapshot.phase, unitId: unit2.id, status, attempt: snapshot.attempt };
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
      const phaseSignals = (deps.phaseSignalResolver ?? defaultPhaseSignalResolver)(sessionContext);
      const queue = (deps.queueBuilder ?? buildUnitQueue)({
        mode: sessionContext.mode,
        phase: sessionContext.phase,
        cwd: sessionContext.cwd,
        configPath: sessionContext.configPath,
        startAt: sessionContext.startAt,
        settings,
        phaseSignals
      });
      if (queue.decision === "pause_for_user") {
        snapshot = startOrchestration({ phase: sessionContext.phase, mode: sessionContext.mode, settings: queue.settings, units: queue.units, now: deps.clock, cwd: sessionContext.cwd });
        const started2 = snapshot.lastEvent;
        snapshot = withLastEvent({ ...snapshot, status: "paused", resumeHint: queue.resumeHint }, settingsResolvedEvent(snapshot, deps.clock));
        return record({ ok: false, messages: [queue.resumeHint ?? "orchestration paused for user"], snapshot, status: getSnapshotStatus(snapshot), events: [started2, snapshot.lastEvent].filter((event) => Boolean(event)) }, snapshot, deps);
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
function defaultPhaseSignalResolver(context) {
  return inferPhaseSignals({ cwd: context.cwd, phase: context.phase });
}
function record(result, snapshot, deps) {
  if (!snapshot) return result;
  const written = [...result.written ?? []];
  const events = result.events ?? (snapshot.lastEvent ? [snapshot.lastEvent] : []);
  const messages = [...result.messages];
  let ok = result.ok;
  if (deps.journal) {
    for (const event of events) {
      const journalResult = deps.journal.append(event, snapshot);
      messages.push(...journalResult.messages);
      if (!journalResult.ok) ok = false;
      if (journalResult.written) written.push(...journalResult.written);
    }
  }
  if (deps.stateDigest) {
    const digestResult = deps.stateDigest.write(snapshot);
    messages.push(...digestResult.messages);
    if (digestResult.written) written.push(...digestResult.written);
  }
  return { ...result, ok, messages, ...written.length > 0 ? { written } : {} };
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

// src/orchestrator/journal.ts
import { existsSync as existsSync12, mkdirSync as mkdirSync2, readFileSync as readFileSync10, writeFileSync as writeFileSync3 } from "fs";
import { dirname as dirname3, isAbsolute as isAbsolute3, resolve as resolve3, relative as relative3 } from "path";
var DEFAULT_JOURNAL_PATH = ".planning/orchestration-state.json";
var allowedEventKeys = /* @__PURE__ */ new Set(["type", "ts", "phase", "unitId", "status", "attempt", "reason", "resumeHint", "evidence"]);
var unsafeEventKeys = /* @__PURE__ */ new Set(["prompt", "userText", "env", "token", "secret", "password", "apiKey", "api_key", "authorization", "bearer", "args", "arguments", "rawArgs"]);
var safeMetadataKeys = /* @__PURE__ */ new Set(["setting", "source", "label", "safe"]);
var secretPattern = /(?:password|secret|token|api[_-]?key|authorization|bearer)/i;
var maxStringLength = 240;
var maxEvidenceItems2 = 20;
function createJournalAdapter(options) {
  return {
    append(event, snapshot) {
      return appendJournalEvent({ ...options, event, snapshot });
    },
    read() {
      const result = readJournal(options);
      if (!result.journal) return result;
      return {
        ...result,
        journal: {
          snapshot: result.journal.snapshot,
          events: result.journal.events
        }
      };
    }
  };
}
function readJournal(options) {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages };
  if (!existsSync12(resolved.path)) {
    return { ok: true, messages: ["orchestration journal not found"] };
  }
  try {
    const parsed = JSON.parse(readFileSync10(resolved.path, "utf8"));
    const journal = normalizeJournal(parsed);
    if (!journal) {
      return { ok: false, messages: ["orchestration journal is invalid"] };
    }
    return { ok: true, messages: ["orchestration journal read"], journal };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal read failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}
function appendJournalEvent(options) {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages, written: [] };
  const existing = readJournal(options);
  if (!existing.ok) return { ok: false, messages: existing.messages, written: [] };
  const events = existing.journal ? existing.journal.events : [];
  const journal = {
    version: 1,
    snapshot: redactSnapshot(options.snapshot),
    events: [...events, redactJournalEvent(options.event)]
  };
  return writeJournal(resolved.path, journal);
}
function redactSnapshot(snapshot) {
  return {
    ...snapshot,
    currentUnit: snapshot.currentUnit ? redactUnit(snapshot.currentUnit) : void 0,
    remainingUnits: snapshot.remainingUnits.map(redactUnit),
    lastEvent: snapshot.lastEvent ? redactJournalEvent(snapshot.lastEvent) : void 0,
    resumeHint: snapshot.resumeHint ? safeString(snapshot.resumeHint) : void 0
  };
}
function redactJournalEvent(event) {
  const redacted = {};
  for (const [key, value] of Object.entries(event)) {
    if (unsafeEventKeys.has(key) || !allowedEventKeys.has(key)) {
      continue;
    }
    if (key === "evidence") {
      const evidence = Array.isArray(value) ? value : [];
      redacted.evidence = evidence.filter((item) => typeof item === "string").slice(0, maxEvidenceItems2).map(safeString);
      continue;
    }
    if (typeof value === "string") {
      redacted[key] = safeString(value);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      redacted[key] = value;
    }
  }
  return redacted;
}
function redactUnit(unit2) {
  if (!unit2.metadata) return unit2;
  const metadata = {};
  for (const [key, value] of Object.entries(unit2.metadata)) {
    if (unsafeEventKeys.has(key) || !safeMetadataKeys.has(key)) continue;
    metadata[key] = typeof value === "string" ? safeString(value) : value;
  }
  return { ...unit2, metadata };
}
function writeJournal(path, journal) {
  try {
    mkdirSync2(dirname3(path), { recursive: true });
    writeFileSync3(path, `${JSON.stringify(journal, null, 2)}
`, "utf8");
    return { ok: true, messages: ["orchestration journal written"], written: [path], snapshot: journal.snapshot, status: journal.snapshot ? void 0 : void 0 };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal write failed: ${error instanceof Error ? error.message : String(error)}`], written: [] };
  }
}
function resolveJournalPath(options) {
  const cwd = resolve3(options.cwd);
  const planningDir = resolve3(cwd, ".planning");
  const candidate = resolve3(cwd, options.journalPath ?? DEFAULT_JOURNAL_PATH);
  if (!isInsideOrSame(planningDir, candidate)) {
    return { ok: false, messages: [`refusing orchestration journal path outside .planning: ${candidate}`] };
  }
  return { ok: true, path: candidate };
}
function isInsideOrSame(parent, child) {
  const rel = relative3(parent, child);
  return rel === "" || !rel.startsWith("..") && !isAbsolute3(rel);
}
function normalizeJournal(value) {
  if (!value || typeof value !== "object") return void 0;
  const candidate = value;
  if (candidate.version !== 1) return void 0;
  if (!candidate.snapshot || typeof candidate.snapshot !== "object") return void 0;
  if (!Array.isArray(candidate.events)) return void 0;
  return {
    version: 1,
    snapshot: redactSnapshot(candidate.snapshot),
    events: candidate.events.map((event) => redactJournalEvent(event && typeof event === "object" ? event : {}))
  };
}
function safeString(value) {
  return secretPattern.test(value) ? "[REDACTED]" : truncate(value);
}
function truncate(value) {
  return value.length <= maxStringLength ? value : `${value.slice(0, maxStringLength)}\u2026`;
}

// src/orchestrator/state-digest.ts
import { spawnSync as spawnSync2 } from "child_process";
function writeStateDigestPointer(options) {
  const runner = options.runner ?? createOfficialStateRunner(options.cwd);
  const digest = buildDigest(options);
  const probe = runner(["query", "state.load"]);
  if (probe.status !== 0) {
    return skipped(`state.load unavailable: ${formatRunnerFailure(probe)}`);
  }
  const update = runner(["query", "state.record-session", "", digest, options.journalPath]);
  if (update.status !== 0) {
    return skipped(formatRunnerFailure(update));
  }
  return { ok: true, messages: ["STATE digest pointer recorded"] };
}
function createStateDigestAdapter(options) {
  return {
    write(snapshot) {
      return writeStateDigestPointer({
        cwd: options.cwd,
        phase: snapshot.phase,
        status: snapshot.status,
        currentUnitId: snapshot.currentUnit?.id,
        journalPath: ".planning/orchestration-state.json",
        resumeHint: snapshot.resumeHint,
        runner: options.runner
      });
    }
  };
}
function createOfficialStateRunner(cwd) {
  const officialPackage = resolveOfficialPackage({ startDir: cwd });
  const gsdTools = officialPackage.paths.gsdTools;
  return (command) => {
    const child = spawnSync2(process.execPath, [gsdTools, ...command], { cwd, encoding: "utf8", stdio: "pipe" });
    if (child.error) {
      return { status: 1, stdout: child.stdout?.toString(), stderr: child.error.message };
    }
    return { status: child.status, stdout: child.stdout?.toString(), stderr: child.stderr?.toString() };
  };
}
function buildDigest(options) {
  const parts = [
    `Orchestrator ${options.status}`,
    `phase=${bounded(options.phase)}`,
    `unit=${bounded(options.currentUnitId ?? "none")}`,
    `journal=${bounded(options.journalPath)}`
  ];
  if (options.resumeHint) {
    parts.push(`resume=${bounded(options.resumeHint)}`);
  }
  return parts.join("; ");
}
function skipped(reason) {
  return { ok: false, messages: [`STATE digest pointer skipped: ${reason}`] };
}
function formatRunnerFailure(result) {
  return (result.stderr || result.stdout || `exit ${String(result.status)}`).trim();
}
function bounded(value) {
  return value.length <= 240 ? value : `${value.slice(0, 240)}\u2026`;
}

// src/orchestrator/phase.ts
var PHASE_ID_PATTERN = /^\d{2}$/;
function isValidPhaseId(phase) {
  return PHASE_ID_PATTERN.test(phase);
}

// src/orchestrator/trigger.ts
function detectNativeAutoTrigger(input) {
  const match = input.trim().match(/^\/(gsd-(?:plan-phase|execute-phase|verify-work|ship))\s+(\S+)([\s\S]*)$/);
  if (!match) return void 0;
  const [, command, phase, rest] = match;
  if (/\s--chain(?:\s|$)/.test(rest)) return { command, phase, mode: "chain" };
  if (/\s--auto(?:\s|$)/.test(rest)) return { command, phase, mode: "auto" };
  return void 0;
}
var commandStart = {
  "gsd-plan-phase": "plan",
  "gsd-execute-phase": "execute",
  "gsd-verify-work": "verify",
  "gsd-ship": "closeout"
};
function createNativeAutoHandoff(options) {
  return (input) => {
    const trigger = detectNativeAutoTrigger(input);
    if (!trigger) return void 0;
    if (!isValidPhaseId(trigger.phase)) {
      return { ok: false, messages: ["Invalid phase; expected two digits such as 09"], status: { status: "idle", remainingUnits: [], attempt: 0 } };
    }
    const orchestrator = options.createOrchestrator();
    let result = orchestrator.start({ phase: trigger.phase, mode: trigger.mode, cwd: options.cwd, startAt: commandStart[trigger.command] });
    let guard = 0;
    while (result.ok && result.status?.status === "running" && guard < 100) {
      result = orchestrator.advance();
      guard += 1;
    }
    return result;
  };
}

// src/extension.ts
var piGsdPackageRoot = resolve4(dirname4(fileURLToPath(import.meta.url)), "..");
var TEMP_DIR_SUBDIRS = ["async-subagent-results", "async-subagent-runs"];
function buildPiSubagentsTempRoot() {
  const username = (() => {
    for (const key of ["USERNAME", "USER", "LOGNAME"]) {
      const value = process.env[key];
      if (value) return value;
    }
    try {
      const os = __require("os");
      const info = os.userInfo();
      if (info.username) return info.username;
    } catch {
    }
    return "unknown";
  })();
  const sanitized = username.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  return join12(tmpdir(), `pi-subagents-user-${sanitized}`);
}
function guardPiSubagentsTempDirs(options) {
  try {
    const fsImpl = options?.fs ?? { accessSync, rmSync, mkdirSync: mkdirSync3 };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();
    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join12(tempRoot, subdir);
      try {
        fsImpl.accessSync(dirPath, fsConstants.R_OK | fsConstants.W_OK);
      } catch {
        try {
          fsImpl.rmSync(dirPath, { recursive: true, force: true });
          fsImpl.mkdirSync(dirPath, { recursive: true });
        } catch {
          globalThis.__piSubagentsTempAclBroken = true;
        }
      }
    }
  } catch {
  }
}
function piGsdExtension(pi) {
  let warnedResolveFailure = false;
  let cachedPackageRoot = null;
  function getPackageRoot(startDir) {
    if (cachedPackageRoot !== null) return cachedPackageRoot;
    try {
      const officialPackage = resolveOfficialPackage({ startDir });
      cachedPackageRoot = officialPackage.packageRoot;
      return cachedPackageRoot;
    } catch {
      return null;
    }
  }
  pi.on("session_start", (_event, ctx) => {
    guardPiSubagentsTempDirs();
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (pkgRoot) {
      try {
        const pkg = resolveOfficialPackage({ startDir: ctx.cwd });
        notify(ctx, `pi-gsd: using ${pkg.packageName}@${pkg.version}`, "info");
      } catch (error) {
        if (!warnedResolveFailure) {
          warnedResolveFailure = true;
          notify(ctx, `pi-gsd: failed to resolve official package: ${errorMessage(error)}`, "warning");
        }
      }
    } else if (!warnedResolveFailure) {
      warnedResolveFailure = true;
      notify(ctx, "pi-gsd: failed to resolve official package", "warning");
    }
  });
  pi.on("context", (event, ctx) => {
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (!pkgRoot) return void 0;
    const messages = event.messages.map((message) => rewriteMessageForRuntime(message, pkgRoot));
    return { messages };
  });
  pi.on("message_end", (event, ctx) => {
    if (!isRecord2(event.message) || event.message.role !== "assistant") {
      return void 0;
    }
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (!pkgRoot) return void 0;
    return { message: rewriteMessageForRuntime(event.message, pkgRoot) };
  });
  pi.on("input", (event, ctx) => {
    const text = isRecord2(event) && typeof event.text === "string" ? event.text : void 0;
    if (!text) return { action: "continue" };
    const resourceRoot = piGsdPackageRoot;
    const handoff = createNativeAutoHandoff({
      cwd: ctx.cwd,
      createOrchestrator: () => createAutoOrchestrator({
        journal: createJournalAdapter({ cwd: ctx.cwd }),
        stateDigest: createStateDigestAdapter({ cwd: ctx.cwd }),
        dispatch: createDispatchAdapter({ cwd: ctx.cwd, resourceRoot })
      })
    });
    const result = handoff(text);
    if (!result) return { action: "continue" };
    notify(ctx, result.messages.join("\n"), result.ok ? "info" : "warning");
    return { action: "handled" };
  });
  pi.registerCommand("gsd-models", {
    description: "Configure GSD model routing for Pi subagents",
    handler: async (args, ctx) => {
      const model = ctx.model;
      const allModels = ctx.modelRegistry.getAvailable();
      const gsdPackageRoot = getPackageRoot(ctx.cwd) ?? "";
      await runGsdModelsCommand(args, {
        cwd: ctx.cwd,
        sessionModel: model ? `${model.provider}/${model.id}` : "unknown/unknown",
        enabledModels: readEnabledModels(),
        gsdPackageRoot,
        modelRegistry: {
          getAvailable() {
            return allModels.map((m) => ({ provider: String(m.provider), id: m.id, name: m.name }));
          }
        },
        ui: {
          select: async (_title, items) => {
            const options = items.map((item) => item.label);
            const selectedLabel = await ctx.ui.select(_title, options);
            if (selectedLabel === void 0) return void 0;
            return items.find((item) => item.label === selectedLabel)?.value;
          },
          custom: (factory, options) => ctx.ui.custom(factory, options),
          notify: (message, type) => ctx.ui.notify(message, type)
        }
      });
    }
  });
}
function rewriteMessageForRuntime(message, officialRoot) {
  if (!isRecord2(message)) {
    return message;
  }
  const content = message.content;
  if (typeof content === "string") {
    return { ...message, content: rewriteRuntimeMessageText(content, officialRoot) };
  }
  if (Array.isArray(content)) {
    return {
      ...message,
      content: content.map((block) => rewriteTextBlock(block, officialRoot))
    };
  }
  return message;
}
function rewriteTextBlock(block, officialRoot) {
  if (!isRecord2(block) || block.type !== "text" || typeof block.text !== "string") {
    return block;
  }
  return { ...block, text: rewriteRuntimeMessageText(block.text, officialRoot) };
}
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function notify(ctx, message, type) {
  try {
    ctx.ui.notify(message, type);
  } catch {
  }
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export {
  commandFileToPiPromptName,
  normalizeGsdSlashReferences,
  transformGsdRunLauncher,
  addPiSubagentGuidance,
  splitCodeFences,
  transformAskUserQuestionForPi,
  transformSkillDispatchForPi,
  transformSubagentDispatchForPi,
  OFFICIAL_PACKAGE_NAME,
  OfficialPackageError,
  resolveOfficialPackage,
  rewriteOfficialClaudePaths,
  rewriteRuntimeMessageText,
  createCommandDispatchRunner,
  createDispatchAdapter,
  resolveWorkflowSettings,
  createAutoOrchestrator,
  start,
  advance,
  resume,
  stop,
  getStatus,
  createJournalAdapter,
  createStateDigestAdapter,
  isValidPhaseId,
  TEMP_DIR_SUBDIRS,
  buildPiSubagentsTempRoot,
  guardPiSubagentsTempDirs,
  piGsdExtension,
  rewriteMessageForRuntime
};
