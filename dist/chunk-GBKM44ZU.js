var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/extension.ts
import { accessSync, constants as fsConstants, mkdirSync as mkdirSync3, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname as dirname4, join as join7, resolve as resolve3 } from "path";
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
  const normalizedRoot = gsdPackageRoot.split("get-shit-done-redux").join("gsd-core");
  const candidates = [
    join2(normalizedRoot, "get-shit-done", "bin", "shared", "model-catalog.json"),
    join2(normalizedRoot, "sdk", "shared", "model-catalog.json"),
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
import { existsSync as existsSync5, readdirSync as readdirSync2, readFileSync as readFileSync4, statSync as statSync2 } from "fs";
import { basename, isAbsolute, join as join5, resolve } from "path";

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
  const phaseDir = join5(cwd, ".planning", "phases");
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
      ...readdirSync2(phaseRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join5(phaseRoot, entry.name)),
      ...readdirSync2(phaseRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`)).flatMap((entry) => readdirSync2(join5(phaseRoot, entry.name), { withFileTypes: true }).filter((child) => child.isFile()).map((child) => join5(phaseRoot, entry.name, child.name)))
    ];
    return candidates.some((path) => artifactPattern.test(basename(path)) && writtenSet.has(resolve(path)) && exists(path));
  } catch {
    return false;
  }
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeWrittenPath(cwd, value) {
  return resolve(isAbsolute(value) ? value : resolve(cwd, value));
}
function closeoutEvidence(cwd, phase, written) {
  if (!written?.length) return false;
  const writtenSet = new Set(written.map((path) => normalizeWrittenPath(cwd, path)));
  const roadmapPath = resolve(cwd, ".planning", "ROADMAP.md");
  const statePath = resolve(cwd, ".planning", "STATE.md");
  if (!writtenSet.has(roadmapPath) || !writtenSet.has(statePath)) return false;
  try {
    const roadmap = readFileSync4(roadmapPath, "utf8");
    const state = readFileSync4(statePath, "utf8");
    statSync2(join5(cwd, ".planning", "phases"));
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
import { existsSync as existsSync6, mkdirSync as mkdirSync2, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname3, isAbsolute as isAbsolute2, resolve as resolve2, relative } from "path";
var DEFAULT_JOURNAL_PATH = ".planning/orchestration-state.json";
var allowedEventKeys = /* @__PURE__ */ new Set(["type", "ts", "phase", "unitId", "status", "attempt", "reason", "resumeHint", "evidence"]);
var unsafeEventKeys = /* @__PURE__ */ new Set(["prompt", "userText", "env", "token", "secret", "password", "apiKey", "api_key", "authorization", "bearer", "args", "arguments", "rawArgs"]);
var safeMetadataKeys = /* @__PURE__ */ new Set(["setting", "source", "label", "safe"]);
var secretPattern = /(?:password|secret|token|api[_-]?key|authorization|bearer)/i;
var maxStringLength = 240;
var maxEvidenceItems = 20;
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
  if (!existsSync6(resolved.path)) {
    return { ok: true, messages: ["orchestration journal not found"] };
  }
  try {
    const parsed = JSON.parse(readFileSync5(resolved.path, "utf8"));
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
      redacted.evidence = evidence.filter((item) => typeof item === "string").slice(0, maxEvidenceItems).map(safeString);
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
    writeFileSync2(path, `${JSON.stringify(journal, null, 2)}
`, "utf8");
    return { ok: true, messages: ["orchestration journal written"], written: [path], snapshot: journal.snapshot, status: journal.snapshot ? void 0 : void 0 };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal write failed: ${error instanceof Error ? error.message : String(error)}`], written: [] };
  }
}
function resolveJournalPath(options) {
  const cwd = resolve2(options.cwd);
  const planningDir = resolve2(cwd, ".planning");
  const candidate = resolve2(cwd, options.journalPath ?? DEFAULT_JOURNAL_PATH);
  if (!isInsideOrSame(planningDir, candidate)) {
    return { ok: false, messages: [`refusing orchestration journal path outside .planning: ${candidate}`] };
  }
  return { ok: true, path: candidate };
}
function isInsideOrSame(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || !rel.startsWith("..") && !isAbsolute2(rel);
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
var piGsdPackageRoot = resolve3(dirname4(fileURLToPath(import.meta.url)), "..");
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
  return join7(tmpdir(), `pi-subagents-user-${sanitized}`);
}
function guardPiSubagentsTempDirs(options) {
  try {
    const fsImpl = options?.fs ?? { accessSync, rmSync, mkdirSync: mkdirSync3 };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();
    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join7(tempRoot, subdir);
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
