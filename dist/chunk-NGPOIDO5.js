var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/extension.ts
import { accessSync, constants as fsConstants, mkdirSync as mkdirSync6, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname as dirname6, join as join20, resolve as resolve7 } from "path";
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
  validateRequiredPath("get-shit-done/bin/shared/config-defaults.manifest.json", paths.configDefaultsManifest, "file", packageName);
  validateRequiredPath("get-shit-done/bin/shared/config-schema.manifest.json", paths.configSchemaManifest, "file", packageName);
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
    gsdTools: join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"),
    configDefaultsManifest: join(packageRoot, "get-shit-done", "bin", "shared", "config-defaults.manifest.json"),
    configSchemaManifest: join(packageRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json")
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
  if (trimmed.startsWith('\\"') && trimmed.endsWith('\\"')) {
    return trimmed.slice(2, -2).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
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
    const transformed = rewriteSkillDispatchInSegment(segment, formatSkillDispatchInstruction);
    if (transformed !== segment) changed = true;
    return transformed;
  }).join("");
  return changed ? result : input;
}
function rewriteSkillDispatchInSegment(segment, formatter) {
  return rewriteBalancedCalls(segment, "Skill", (argsText) => {
    const dispatch = parseDispatchArgs(argsText, "skill");
    return dispatch ? formatter(dispatch) : null;
  });
}
function formatSkillDispatchInstruction(dispatch) {
  if (dispatch.isPositional) {
    return formatWorkflowSkillDispatchInstruction(dispatch);
  }
  const slashCmd = formatSlashInvocation(dispatch);
  const invokePart = dispatch.args ? `invoke via slash command ${slashCmd} in Pi` : `invoke via slash command /${dispatch.name} in Pi`;
  return `Use the /${dispatch.name} skill (${invokePart}) or read the corresponding workflow prompt to continue.`;
}
function formatWorkflowSkillDispatchInstruction(dispatch) {
  const slashInvocation = formatSlashInvocation(dispatch);
  return `If PI_GSD_NATIVE_CHAIN_OWNER is set, return control to the native orchestrator for ${slashInvocation}; otherwise Invoke ${slashInvocation} in Pi.`;
}
function formatSlashInvocation(dispatch) {
  return dispatch.args ? `/${dispatch.name} ${dispatch.args}` : `/${dispatch.name}`;
}
function parseDispatchArgs(argsText, nameKey) {
  const tokens = tokenizeTopLevel(argsText);
  if (tokens.length === 0) return null;
  let name;
  let args;
  let isPositional = false;
  const firstPositional = unquote(tokens[0]);
  if (firstPositional !== null) {
    name = firstPositional;
    isPositional = true;
  }
  for (const token of tokens) {
    const named = parseNamedAssignment(token);
    if (!named) continue;
    if (named.key === nameKey) {
      name = named.value;
    } else if (named.key === "args") {
      args = named.value;
    }
  }
  return name ? { name, args, isPositional } : null;
}
function parseNamedAssignment(token) {
  const match = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
  if (!match) return null;
  const value = unquote(match[2].trim());
  if (value === null) return null;
  return { key: match[1], value };
}
function rewriteBalancedCalls(segment, functionName, transform) {
  let result = segment;
  let safety = 100;
  let searchFrom = 0;
  const callPattern = new RegExp(`\\b${functionName}\\s*\\(`);
  while (safety-- > 0) {
    const match = callPattern.exec(result.slice(searchFrom));
    if (!match || match.index === void 0) break;
    const callStart = searchFrom + match.index;
    const argsStart = callStart + match[0].length - 1;
    const argsText = extractBalancedParens(result, argsStart);
    if (!argsText) {
      searchFrom = argsStart + 1;
      continue;
    }
    const rewritten = transform(argsText);
    if (rewritten === null) {
      searchFrom = argsStart + 1;
      continue;
    }
    const callEnd = argsStart + argsText.length + 2;
    result = result.slice(0, callStart) + rewritten + result.slice(callEnd);
    searchFrom = callStart + rewritten.length;
  }
  if (safety <= 0) {
    console.warn(`[pi-gsd] rewriteBalancedCalls: safety limit reached for ${functionName}`);
  }
  return result;
}
function transformWorkflowDispatchForPi(input) {
  let result = rewriteSkillDispatchInSegment(input, formatWorkflowSkillDispatchInstruction);
  result = rewriteBalancedCalls(result, "Workflow", (argsText) => {
    const dispatch = parseDispatchArgs(argsText, "workflow");
    if (!dispatch) return null;
    const workflowPath = formatGeneratedWorkflowPath(dispatch.name);
    const argsPart = dispatch.args ? ` with arguments ${dispatch.args}` : "";
    return `Read and execute ${workflowPath}${argsPart}`;
  });
  result = rewriteBalancedCalls(result, "SlashCommand", (argsText) => {
    const tokens = tokenizeTopLevel(argsText);
    if (tokens.length === 0) return null;
    const command = unquote(tokens[0]);
    if (command === null) return null;
    return `Invoke ${normalizeGsdSlashReferences(command)} in Pi`;
  });
  result = rewriteAgentDispatchInSegment(result);
  return result;
}
function formatGeneratedWorkflowPath(path) {
  return path.replace(/^get-shit-done\/workflows\//, "generated/workflows/workflows/").replace(/^workflows\//, "generated/workflows/workflows/");
}
function rewriteAgentDispatchInSegment(segment) {
  return rewriteBalancedCalls(segment, "Agent", (argsText) => {
    const parsed = parseAgentDispatchArgs(argsText);
    if (!parsed) return null;
    const agent = parsed.agentType === "general-purpose" ? "general" : parsed.agentType;
    return `Use the Pi subagent tool: subagent({agent: "${escapeDoubleQuotedString(agent)}", task: "${escapeDoubleQuotedString(parsed.prompt)}"}). Wait for the subagent result before continuing this workflow.`;
  });
}
function parseAgentDispatchArgs(argsText) {
  const tokens = tokenizeTopLevel(argsText);
  let agentType;
  let prompt;
  for (const token of tokens) {
    const named = parseNamedAssignment(token);
    if (!named) continue;
    if (named.key === "subagent_type") agentType = named.value;
    if (named.key === "prompt") prompt = named.value;
  }
  return agentType && prompt ? { agentType, prompt } : null;
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
      const { unlinkSync: unlinkSync2 } = await import("fs");
      unlinkSync2(configPath);
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
import { existsSync as existsSync5 } from "fs";
import { spawnSync } from "child_process";
import { join as join6 } from "path";

// src/orchestration-contract/compile.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "fs";
import { join as join4, relative } from "path";

// src/orchestration-contract/snapshot.ts
import { createHash } from "crypto";
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join3 } from "path";
function calculateOrchestrationContractHash(snapshot) {
  return createHash("sha256").update(stableStringify({ ...snapshot, contractHash: "" }), "utf8").digest("hex");
}
function writeOrchestrationContractSnapshot(snapshot, options) {
  const outDir = options.outDir ?? join3(options.cwd, "generated");
  const outFileName = options.outFileName ?? "orchestration-contract.json";
  const outPath = join3(outDir, outFileName);
  mkdirSync2(outDir, { recursive: true });
  const stamped = {
    ...snapshot,
    contractHash: calculateOrchestrationContractHash(snapshot)
  };
  writeFileSync2(outPath, `${stableStringify(stamped)}
`, "utf8");
  return outPath;
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
}

// src/orchestration-contract/compile.ts
var DISCUSS_CHAIN_PATH = "generated/workflows/workflows/discuss-phase/modes/chain.md";
var PLAN_PATH = "generated/workflows/workflows/plan-phase.md";
var EXECUTE_PATH = "generated/workflows/workflows/execute-phase.md";
function compileOrchestrationContract(options) {
  const generatedRoot = join4(options.cwd, "generated");
  const discussChain = readRequired(options.cwd, DISCUSS_CHAIN_PATH);
  const plan = readRequired(options.cwd, PLAN_PATH);
  const execute = readRequired(options.cwd, EXECUTE_PATH);
  requireText(
    discussChain,
    /\bgsd-plan-phase\b[\s\S]{0,120}--auto\b/,
    DISCUSS_CHAIN_PATH,
    "discuss chain must launch plan --auto"
  );
  requireText(
    plan,
    /\bgsd-execute-phase\b[\s\S]{0,160}--auto\b[\s\S]{0,80}--no-transition\b/,
    PLAN_PATH,
    "plan auto must launch execute --auto --no-transition"
  );
  requireText(execute, /##\s*PHASE COMPLETE/i, EXECUTE_PATH, "execute must emit PHASE COMPLETE");
  requireText(execute, /Verification:\s*\{?\s*Passed\s*\|\s*Gaps Found\s*\}?/i, EXECUTE_PATH, "execute must report verification result");
  const executeOutcome = {
    artifactSuffixes: ["SUMMARY.md", "VERIFICATION.md"],
    requiredArtifacts: ["SUMMARY.md", "VERIFICATION.md"],
    passStatuses: ["passed", "pass"],
    pauseStatuses: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion."
    },
    pauseMarkers: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion.",
      verification_failed: "Execution verification failed; inspect VERIFICATION.md before continuing."
    },
    requireRecognizedOutcome: true,
    sourcePaths: [EXECUTE_PATH]
  };
  const snapshot = {
    contractVersion: 1,
    contractHash: "",
    ...options.officialPackage ? { officialPackage: options.officialPackage } : {},
    ...options.officialVersion ? { officialVersion: options.officialVersion } : {},
    generatedRoot: relative(options.cwd, generatedRoot) || "generated",
    phaseIdPolicy: {
      lexicalPattern: "^\\d+(?:\\.\\d+)*$",
      examples: ["9", "09", "2.1", "02.1"],
      validationHint: "Use upstream roadmap.get-phase/find-phase for existence checks."
    },
    chain: {
      defaultQueue: [
        { unitType: "discuss", argsByMode: { chain: "--chain", auto: "--auto" }, required: false, sourcePaths: [DISCUSS_CHAIN_PATH] },
        { unitType: "plan", argsByMode: { chain: "--auto", auto: "--auto" }, required: true, sourcePaths: [PLAN_PATH] },
        { unitType: "execute", argsByMode: { chain: "--auto --no-transition", auto: "--auto --no-transition" }, required: true, sourcePaths: [PLAN_PATH, EXECUTE_PATH] }
      ],
      standaloneStarts: {
        "gsd-discuss-phase": "discuss",
        "gsd-plan-phase": "plan",
        "gsd-execute-phase": "execute",
        "gsd-verify-work": "verify",
        "gsd-ship": "closeout"
      }
    },
    outcomes: {
      discuss: { artifactSuffixes: ["CONTEXT.md"], sourcePaths: [DISCUSS_CHAIN_PATH] },
      plan: { artifactSuffixes: ["PLAN.md"], sourcePaths: [PLAN_PATH] },
      execute: executeOutcome,
      verify: {
        artifactSuffixes: ["VERIFICATION.md"],
        passStatuses: ["passed", "pass"],
        pauseStatuses: {
          gaps_found: "Verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
          human_needed: "Phase verification requires human verification before closeout."
        },
        requireRecognizedOutcome: true,
        sourcePaths: ["generated/workflows/workflows/verify-work.md"]
      }
    },
    piOverlay: {
      nativeOwnerEnv: "PI_GSD_NATIVE_CHAIN_OWNER",
      noNestedWorkflowDispatchWhenNativeOwner: true
    }
  };
  snapshot.contractHash = calculateOrchestrationContractHash(snapshot);
  return snapshot;
}
function readRequired(cwd, path) {
  const abs = join4(cwd, path);
  if (!existsSync3(abs)) throw new Error(`orchestration contract source missing: ${path}`);
  return readFileSync3(abs, "utf8");
}
function requireText(content, pattern, sourcePath, reason) {
  if (!pattern.test(content)) {
    throw new Error(`orchestration contract drift in ${sourcePath}: ${reason}`);
  }
}

// src/orchestration-contract/validate.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "fs";
import { join as join5 } from "path";
function readOrchestrationContractSnapshot(cwd) {
  const path = join5(cwd, "generated", "orchestration-contract.json");
  if (!existsSync4(path)) return void 0;
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return void 0;
  }
}
function verifyOrchestrationContractSnapshot(options) {
  const loaded = options.snapshot ? { snapshot: options.snapshot } : loadSnapshotForValidation(options.cwd);
  if ("failure" in loaded) {
    return { ok: false, failures: [loaded.failure], warnings: [], snapshotPresent: loaded.snapshotPresent };
  }
  const snapshot = loaded.snapshot;
  if (!snapshot) return { ok: true, failures: [], warnings: [], snapshotPresent: false };
  const failures = [];
  const expectedHash = calculateOrchestrationContractHash(snapshot);
  if (snapshot.contractHash !== expectedHash) {
    failures.push({
      failedField: "contractHash",
      expected: expectedHash,
      actual: snapshot.contractHash,
      sourcePaths: ["generated/orchestration-contract.json"]
    });
  }
  if (!snapshot.chain.defaultQueue.some((unit2) => unit2.unitType === "execute")) {
    failures.push({
      failedField: "chain.defaultQueue",
      expected: "execute unit",
      actual: snapshot.chain.defaultQueue.map((unit2) => unit2.unitType).join(","),
      sourcePaths: ["generated/orchestration-contract.json"]
    });
  }
  if (!snapshot.outcomes.execute?.requireRecognizedOutcome) {
    failures.push({
      failedField: "outcomes.execute.requireRecognizedOutcome",
      expected: "true",
      actual: String(snapshot.outcomes.execute?.requireRecognizedOutcome),
      sourcePaths: ["generated/orchestration-contract.json"]
    });
  }
  for (const path of requiredSourcePaths(snapshot)) {
    if (!existsSync4(join5(options.cwd, path))) {
      failures.push({
        failedField: "sourcePaths",
        expected: "present",
        actual: "missing",
        sourcePaths: [path]
      });
    }
  }
  try {
    const compiled = compileOrchestrationContract({
      cwd: options.cwd,
      officialPackage: snapshot.officialPackage,
      officialVersion: snapshot.officialVersion
    });
    if (compiled.contractHash !== snapshot.contractHash) {
      failures.push({
        failedField: "generatedWorkflows",
        expected: snapshot.contractHash,
        actual: compiled.contractHash,
        sourcePaths: compiled.chain.defaultQueue.flatMap((unit2) => unit2.sourcePaths)
      });
    }
  } catch (error) {
    failures.push({
      failedField: "generatedWorkflows",
      expected: "compiled orchestration contract",
      actual: error instanceof Error ? error.message : String(error),
      sourcePaths: ["generated/workflows"]
    });
  }
  return { ok: failures.length === 0, failures, warnings: [], snapshotPresent: true };
}
function loadSnapshotForValidation(cwd) {
  const path = join5(cwd, "generated", "orchestration-contract.json");
  if (!existsSync4(path)) return {};
  try {
    return { snapshot: JSON.parse(readFileSync4(path, "utf8")) };
  } catch (error) {
    return {
      failure: {
        failedField: "contractJson",
        expected: "valid JSON",
        actual: error instanceof Error ? error.message : String(error),
        sourcePaths: ["generated/orchestration-contract.json"]
      },
      snapshotPresent: true
    };
  }
}
function requiredSourcePaths(snapshot) {
  return Array.from(/* @__PURE__ */ new Set([
    ...snapshot.chain.defaultQueue.flatMap((unit2) => unit2.sourcePaths),
    ...Object.values(snapshot.outcomes).flatMap((outcome) => outcome?.sourcePaths ?? [])
  ]));
}

// src/orchestrator/dispatch.ts
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
  const promptPath = join6(resourceRoot, target.prompt);
  if (!existsSync5(promptPath)) {
    return { ok: false, messages: [`missing dispatch prompt: ${target.prompt}`] };
  }
  if (target.agent && !existsSync5(join6(resourceRoot, "generated", "agents", `${target.agent}.md`))) {
    return { ok: false, messages: [`missing dispatch agent: ${target.agent}`] };
  }
  if (!options.runner) {
    return {
      ok: false,
      messages: [`native Pi dispatch unavailable for ${unit2.type}; provide a dispatch runner or Pi subagent bridge`]
    };
  }
  const nativeOwnerEnv = readOrchestrationContractSnapshot(options.cwd)?.piOverlay.nativeOwnerEnv ?? "PI_GSD_NATIVE_CHAIN_OWNER";
  return options.runner({ unit: unit2, snapshot, target, env: { GSD_AUDIT: "1", [nativeOwnerEnv]: "1" } });
}
function createCommandDispatchRunner(options) {
  return (request) => {
    const command = options.command ?? process.env.PI_GSD_DISPATCH_COMMAND;
    if (!command) return { ok: false, messages: ["PI_GSD_DISPATCH_COMMAND is required for native dispatch"] };
    const args = request.unit.metadata?.args ?? "";
    const payload = JSON.stringify({ unit: request.unit, snapshot: request.snapshot, target: request.target, args });
    const child = spawnSync(command, [], {
      cwd: options.cwd,
      env: { ...process.env, ...request.env, PI_GSD_DISPATCH_REQUEST: payload, PI_GSD_DISPATCH_ARGS: args },
      input: `${payload}
`,
      shell: true,
      encoding: "utf8"
    });
    const messages = [child.stdout, child.stderr].filter(Boolean).map((part) => part.trim()).filter(Boolean);
    if (child.error) return { ok: false, messages: [`dispatch command failed: ${child.error.message}`, ...messages] };
    if (child.status !== 0) return { ok: false, messages: [`dispatch command exited ${child.status ?? "unknown"}`, ...messages] };
    const parsed = parseDispatchCommandOutput(child.stdout);
    return { ok: true, messages: messages.length ? messages : ["dispatch command completed"], written: parsed.written, outcome: parsed.outcome };
  };
}
function createDispatchAdapter(options) {
  const runner = options.runner ?? createCommandDispatchRunner({ cwd: options.cwd });
  return (unit2, snapshot) => dispatchUnit({ ...options, runner }, unit2, snapshot);
}
function parseDispatchCommandOutput(output) {
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === "object") {
      const record2 = parsed;
      const written = Array.isArray(record2.written) ? record2.written.filter((path) => typeof path === "string") : void 0;
      return {
        written,
        outcome: parseOutcome(record2.outcome ?? record2)
      };
    }
  } catch {
  }
  return { outcome: parsePlainTextOutcome(output) };
}
function parseOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record2 = value;
  const status = typeof record2.status === "string" ? record2.status : void 0;
  const marker = typeof record2.marker === "string" ? record2.marker : void 0;
  const verdict = typeof record2.verdict === "string" ? record2.verdict : void 0;
  const data = parseOutcomeData(record2.data);
  if (!status && !marker && !verdict && !data) return void 0;
  return { ...status ? { status } : {}, ...marker ? { marker } : {}, ...verdict ? { verdict } : {}, ...data ? { data } : {} };
}
function parseOutcomeData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const entries = Object.entries(value).filter((entry) => {
    const candidate = entry[1];
    return typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean";
  });
  return entries.length ? Object.fromEntries(entries) : void 0;
}
function parsePlainTextOutcome(output) {
  const marker = /##\s*PHASE COMPLETE/i.test(output) ? "phase_complete" : void 0;
  if (hasLineMarker(output, "GAPS FOUND")) return { status: "gaps_found", ...marker ? { marker } : {} };
  if (hasLineMarker(output, "HUMAN NEEDED")) return { status: "human_needed", ...marker ? { marker } : {} };
  if (hasLineMarker(output, "VERIFICATION FAILED")) return { status: "verification_failed", ...marker ? { marker } : {} };
  const verification = output.match(/^\s*Verification:\s*(Passed|Gaps Found)\s*$/im);
  const verificationValue = verification?.[1]?.toLowerCase();
  if (verificationValue === "passed") return { status: "passed", ...marker ? { marker } : {} };
  if (verificationValue === "gaps found") return { status: "gaps_found", ...marker ? { marker } : {} };
  return marker ? { marker } : void 0;
}
function hasLineMarker(output, marker) {
  return new RegExp(`(?:^|\\n)\\s*(?:#{1,3}\\s*)?${marker}\\b`, "i").test(output);
}

// src/orchestrator/settings.ts
import { readdirSync, readFileSync as readFileSync7 } from "fs";
import { join as join9 } from "path";

// src/settings-bridge/source.ts
import { existsSync as existsSync6, readFileSync as readFileSync5, statSync as statSync2 } from "fs";
import { createHash as createHash2 } from "crypto";
import { isAbsolute, join as join7, resolve } from "path";
function resolveGsdConfigSource(options) {
  const projectRoot = resolve(options.projectRoot ?? options.cwd);
  if (options.configPath) {
    const absolutePath = isAbsolute(options.configPath) ? options.configPath : resolve(projectRoot, options.configPath);
    return readSource(absolutePath, "explicit");
  }
  const activeWorkstreamPath = join7(projectRoot, ".planning", "active-workstream");
  if (existsSync6(activeWorkstreamPath)) {
    try {
      const slug = readFileSync5(activeWorkstreamPath, "utf8").trim();
      if (isSafeWorkstreamSlug(slug)) {
        const workstreamConfigPath = join7(projectRoot, ".planning", "workstreams", slug, "config.json");
        if (existsSync6(workstreamConfigPath)) {
          return readSource(workstreamConfigPath, "active-workstream");
        }
      }
    } catch {
    }
  }
  const planningConfigPath = join7(projectRoot, ".planning", "config.json");
  if (existsSync6(planningConfigPath)) {
    return readSource(planningConfigPath, "planning-config");
  }
  const rootConfigPath = join7(projectRoot, "config.json");
  if (existsSync6(rootConfigPath)) {
    return readSource(rootConfigPath, "root-config");
  }
  return {
    path: void 0,
    kind: "default",
    hash: void 0,
    mtimeMs: void 0,
    config: void 0
  };
}
function isSafeWorkstreamSlug(slug) {
  return /^(?=.*[A-Za-z0-9])[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) && slug !== "." && slug !== "..";
}
function readSource(path, kind) {
  try {
    const content = readFileSync5(path, "utf8");
    const stat = statSync2(path);
    const hash = createHash2("sha256").update(content, "utf8").digest("hex");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return {
        path,
        kind,
        hash,
        mtimeMs: stat.mtimeMs,
        config: void 0,
        parseError: error instanceof Error ? error.message : String(error)
      };
    }
    return {
      path,
      kind,
      hash,
      mtimeMs: stat.mtimeMs,
      config: parsed
    };
  } catch (error) {
    return {
      path,
      kind,
      hash: void 0,
      mtimeMs: void 0,
      config: void 0,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

// src/orchestrator/official-config.ts
import { readFileSync as readFileSync6 } from "fs";
import { join as join8 } from "path";
function loadOfficialWorkflowConfig(options = {}) {
  const official = options.officialRoot ? {
    packageName: OFFICIAL_PACKAGE_NAME,
    version: readPackageVersion(options.officialRoot),
    packageRoot: options.officialRoot,
    paths: {
      configDefaultsManifest: join8(options.officialRoot, "get-shit-done", "bin", "shared", "config-defaults.manifest.json"),
      configSchemaManifest: join8(options.officialRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json")
    }
  } : resolveOfficialPackage({ startDir: options.startDir });
  const defaults = readJson(official.paths.configDefaultsManifest);
  const schema = readJson(official.paths.configSchemaManifest);
  const workflow = isRecord(defaults.workflow) ? defaults.workflow : {};
  const validKeys = Array.isArray(schema.valid_keys) ? schema.valid_keys.filter((key) => typeof key === "string") : Array.isArray(schema.validKeys) ? schema.validKeys.filter((key) => typeof key === "string") : [];
  return {
    official: {
      packageName: official.packageName,
      version: official.version,
      packageRoot: official.packageRoot
    },
    defaults: { workflow },
    schema: {
      validKeys,
      workflowKeys: validKeys.filter((key) => key.startsWith("workflow."))
    }
  };
}
function readPackageVersion(officialRoot) {
  try {
    const parsed = readJson(join8(officialRoot, "package.json"));
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}
function readJson(path) {
  return JSON.parse(readFileSync6(path, "utf8"));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/orchestrator/settings.ts
var OrchestratorSettingsError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OrchestratorSettingsError";
  }
};
var PI_WORKFLOW_DEFAULTS = {
  state_reconciliation_apply: false,
  subagent_timeout: 900,
  inline_plan_threshold: 1
};
function resolveWorkflowSettings(options = {}) {
  const officialConfig = loadOfficialWorkflowConfig({ startDir: options.cwd ?? process.cwd() });
  const workflow = {
    ...normalizeOfficialWorkflowDefaults(officialConfig.defaults.workflow),
    ...PI_WORKFLOW_DEFAULTS,
    ...options.defaults
  };
  const sources = Object.fromEntries(Object.keys(workflow).map((key) => [key, "default"]));
  const rawWorkflow = { ...officialConfig.defaults.workflow };
  const configSource = resolveGsdConfigSource({
    cwd: options.cwd ?? process.cwd(),
    ...options.configPath ? { configPath: options.configPath } : {}
  });
  if (configSource.parseError) {
    throw new OrchestratorSettingsError(`Could not read orchestrator settings from ${configSource.path ?? "resolved config source"}: ${configSource.parseError}`);
  }
  if (configSource.config) {
    const configWorkflow = isRecord2(configSource.config) && isRecord2(configSource.config.workflow) ? configSource.config.workflow : {};
    Object.assign(rawWorkflow, configWorkflow);
    applyKnownWorkflowConfig(configWorkflow, workflow, sources);
  }
  return {
    workflow,
    rawWorkflow,
    workflowMetadata: {
      officialPackage: officialConfig.official.packageName,
      officialVersion: officialConfig.official.version,
      officialRoot: officialConfig.official.packageRoot,
      schemaKeys: officialConfig.schema.workflowKeys
    },
    sources,
    settingsSource: {
      path: configSource.path,
      kind: configSource.kind,
      hash: configSource.hash,
      mtimeMs: configSource.mtimeMs
    }
  };
}
function buildUnitQueue(input) {
  const settings = input.settings ?? resolveWorkflowSettings({ cwd: input.cwd, configPath: input.configPath });
  const phase = input.phase;
  if (input.phaseSignals?.isUiPhase && !settings.workflow.ui_phase) {
    const resumeHint = "Phase signals require UI planning but workflow.ui_phase is disabled. Ask the user whether to enable workflow.ui_phase or continue without the UI Unit.";
    return { decision: "pause_for_user", settings, resumeHint, units: [unit(phase, "pause-for-user", settings, { resumeHint, source: "phase-signal" })] };
  }
  const orchestrationContract = readOrchestrationContractSnapshot(input.cwd ?? process.cwd());
  const queueContract = orchestrationContract?.chain.defaultQueue ?? fallbackDefaultQueue();
  const units = buildContractQueue(input, settings, queueContract);
  if (input.startAt) {
    const startIndex = units.findIndex((candidate) => candidate.type === input.startAt);
    if (startIndex >= 0) {
      return { decision: "dispatch", settings, units: appendExtraArgsToFirstUnit(units.slice(startIndex), input.extraArgs) };
    }
    if (standaloneUnitEnabled(input.startAt, settings)) {
      return { decision: "dispatch", settings, units: appendExtraArgsToFirstUnit([unit(phase, input.startAt, settings, { source: "default" })], input.extraArgs) };
    } else {
      const resumeHint = `Cannot start at ${input.startAt}; the Unit is disabled by workflow settings. Enable it or run without native auto handoff.`;
      return { decision: "pause_for_user", settings, resumeHint, units: [unit(phase, "pause-for-user", settings, { resumeHint, source: "phase-signal" })] };
    }
  }
  return { decision: "dispatch", settings, units };
}
function appendExtraArgsToFirstUnit(units, extraArgs) {
  const normalizedExtraArgs = normalizeUnitArgs(extraArgs);
  if (!normalizedExtraArgs || units.length === 0) return units;
  const [first, ...rest] = units;
  const firstWithArgs = {
    ...first,
    metadata: {
      ...first.metadata,
      args: mergeUnitArgs(first.metadata?.args, normalizedExtraArgs)
    }
  };
  if (isTerminalNativeMode(first.type, normalizedExtraArgs)) return [firstWithArgs];
  return [firstWithArgs, ...rest];
}
function mergeUnitArgs(baseArgs, extraArgs) {
  return [normalizeUnitArgs(baseArgs), normalizeUnitArgs(extraArgs)].filter(Boolean).join(" ") || void 0;
}
function normalizeUnitArgs(args) {
  return args?.trim().replace(/\s+/g, " ") ?? "";
}
function isTerminalNativeMode(type, extraArgs) {
  if (type === "discuss") return hasFlag(extraArgs, "assumptions");
  if (type === "plan") return hasFlag(extraArgs, "research-phase");
  return false;
}
function hasFlag(args, flag) {
  return new RegExp(`(?:^|\\s)--${flag}(?=\\s|$)`).test(args);
}
function buildContractQueue(input, settings, queueContract) {
  const phase = input.phase;
  const units = [];
  for (const entry of queueContract) {
    if (entry.unitType === "discuss" && settings.workflow.skip_discuss) continue;
    if (entry.unitType === "plan") units.push(...prePlanSignalUnits(input, settings));
    units.push(unitFromContract(phase, entry, input, settings));
    if (entry.unitType === "execute") units.push(...postExecuteSignalUnits(input, settings));
  }
  return units;
}
function unitFromContract(phase, entry, input, settings) {
  const args = entry.argsByMode[input.mode];
  return unit(phase, entry.unitType, settings, {
    required: entry.required,
    source: "default",
    metadata: {
      ...args ? { args } : {},
      contractSource: entry.sourcePaths.join(",")
    }
  });
}
function prePlanSignalUnits(input, settings) {
  const phase = input.phase;
  const units = [];
  if (input.phaseSignals?.isUiPhase && settings.workflow.ui_phase) units.push(unit(phase, "settings-gate", settings, { label: "UI phase settings gate", source: "phase-signal", metadata: { setting: "workflow.ui_phase" } }));
  if (input.phaseSignals?.isUiPhase && settings.workflow.ui_safety_gate) units.push(unit(phase, "ui-safety-gate", settings, { label: "UI Safety Gate", source: "phase-signal", metadata: { setting: "workflow.ui_safety_gate" } }));
  if (input.phaseSignals?.isAiPhase && settings.workflow.ai_integration_phase) units.push(unit(phase, "ai-integration", settings, { label: "AI Integration", source: "phase-signal", metadata: { setting: "workflow.ai_integration_phase" } }));
  return units;
}
function postExecuteSignalUnits(input, settings) {
  const phase = input.phase;
  const units = [];
  if (input.phaseSignals?.requiresSecurityReview && settings.workflow.security_enforcement) units.push(unit(phase, "security-review", settings, { source: "phase-signal", metadata: { setting: "workflow.security_enforcement" } }));
  if (input.phaseSignals?.requiresNyquistValidation && settings.workflow.nyquist_validation) units.push(unit(phase, "nyquist-validation", settings, { source: "phase-signal", metadata: { setting: "workflow.nyquist_validation" } }));
  if (input.phaseSignals?.requiresUiReview && settings.workflow.ui_review) units.push(unit(phase, "ui-review", settings));
  return units;
}
function fallbackDefaultQueue() {
  return [
    { unitType: "discuss", argsByMode: { chain: "--chain", auto: "--auto" }, required: false, sourcePaths: ["fallback"] },
    { unitType: "plan", argsByMode: { chain: "--auto", auto: "--auto" }, required: true, sourcePaths: ["fallback"] },
    { unitType: "execute", argsByMode: { chain: "--auto --no-transition", auto: "--auto --no-transition" }, required: true, sourcePaths: ["fallback"] }
  ];
}
function standaloneUnitEnabled(type, settings) {
  if (type === "verify") return settings.workflow.verifier;
  if (type === "closeout") return true;
  if (type === "code-review") return settings.workflow.code_review;
  if (type === "research") return settings.workflow.research;
  if (type === "plan-check") return Boolean(settings.workflow.plan_review_convergence);
  if (type === "settings-gate") return Boolean(settings.workflow.ui_phase);
  if (type === "ui-safety-gate") return Boolean(settings.workflow.ui_safety_gate);
  if (type === "security-review") return Boolean(settings.workflow.security_enforcement);
  if (type === "nyquist-validation") return Boolean(settings.workflow.nyquist_validation);
  if (type === "ai-integration") return Boolean(settings.workflow.ai_integration_phase);
  if (type === "ui-review") return Boolean(settings.workflow.ui_review);
  return type !== "pause-for-user";
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
  const phaseRoot = join9(cwd, ".planning", "phases");
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
    return readdirSync(join9(phaseRoot, direct.name)).filter((name) => /(^|-)PLAN\.md$/i.test(name) || /^phase-signals\.(md|json|ya?ml)$/i.test(name)).map((name) => {
      try {
        return readFileSync7(join9(phaseRoot, direct.name, name), "utf8");
      } catch {
        return "";
      }
    }).filter((text) => /(?:requires|phase[_ -]signals?|phase-kind):/i.test(text)).join("\n");
  } catch {
    return "";
  }
}
function normalizeOfficialWorkflowDefaults(source) {
  return {
    _auto_chain_active: booleanValue(source._auto_chain_active, false),
    auto_advance: booleanValue(source.auto_advance, false),
    research: booleanValue(source.research, true),
    plan_check: booleanValue(source.plan_check, true),
    verifier: booleanValue(source.verifier, true),
    ui_phase: booleanValue(source.ui_phase, true),
    ui_review: booleanValue(source.ui_review, true),
    code_review: booleanValue(source.code_review, true),
    code_review_depth: stringValue(source.code_review_depth, "standard"),
    code_review_command: nullableStringValue(source.code_review_command),
    plan_review_convergence: booleanValue(source.plan_review_convergence, false),
    max_discuss_passes: positiveIntegerValue(source.max_discuss_passes, 3),
    plan_bounce: booleanValue(source.plan_bounce, false),
    plan_bounce_passes: positiveIntegerValue(source.plan_bounce_passes, 2),
    post_planning_gaps: booleanValue(source.post_planning_gaps, true),
    security_enforcement: booleanValue(source.security_enforcement, true),
    nyquist_validation: booleanValue(source.nyquist_validation, true),
    ai_integration_phase: booleanValue(source.ai_integration_phase, true),
    ui_safety_gate: booleanValue(source.ui_safety_gate, true),
    auto_prune_state: booleanValue(source.auto_prune_state, false),
    research_before_questions: booleanValue(source.research_before_questions, false),
    skip_discuss: booleanValue(source.skip_discuss, false),
    worktrees: booleanValue(source.use_worktrees ?? source.worktrees, true),
    node_repair: booleanValue(source.node_repair, true),
    node_repair_budget: positiveIntegerValue(source.node_repair_budget, 2),
    state_reconciliation_apply: false,
    subagent_timeout: positiveIntegerValue(source.subagent_timeout, 3e5),
    inline_plan_threshold: 1
  };
}
function applyKnownWorkflowConfig(source, workflow, sources) {
  applyBoolean(source, "_auto_chain_active", workflow, sources);
  applyBoolean(source, "auto_advance", workflow, sources);
  applyBoolean(source, "research", workflow, sources);
  applyBoolean(source, "plan_check", workflow, sources);
  applyBoolean(source, "verifier", workflow, sources);
  applyBoolean(source, "ui_phase", workflow, sources);
  applyBoolean(source, "ui_review", workflow, sources);
  applyBoolean(source, "code_review", workflow, sources);
  applyString(source, "code_review_depth", workflow, sources);
  applyNullableString(source, "code_review_command", workflow, sources);
  applyBoolean(source, "plan_review_convergence", workflow, sources);
  applyPositiveInteger(source, "max_discuss_passes", workflow, sources);
  applyBoolean(source, "plan_bounce", workflow, sources);
  applyPositiveInteger(source, "plan_bounce_passes", workflow, sources);
  applyBoolean(source, "post_planning_gaps", workflow, sources);
  applyBoolean(source, "security_enforcement", workflow, sources);
  applyBoolean(source, "nyquist_validation", workflow, sources);
  applyBoolean(source, "ai_integration_phase", workflow, sources);
  applyBoolean(source, "ui_safety_gate", workflow, sources);
  applyBoolean(source, "auto_prune_state", workflow, sources);
  applyBoolean(source, "research_before_questions", workflow, sources);
  applyBoolean(source, "skip_discuss", workflow, sources);
  applyBooleanAlias(source, "worktrees", "use_worktrees", workflow, sources);
  applyBooleanAlias(source, "plan_check", "plan_checker", workflow, sources);
  applyBoolean(source, "node_repair", workflow, sources);
  applyBoolean(source, "state_reconciliation_apply", workflow, sources);
  applyPositiveInteger(source, "node_repair_budget", workflow, sources);
  applyPositiveInteger(source, "subagent_timeout", workflow, sources);
  applyPositiveInteger(source, "inline_plan_threshold", workflow, sources);
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
function applyString(source, key, workflow, sources) {
  if (typeof source[key] === "string") {
    workflow[key] = source[key];
    sources[key] = "config";
  }
}
function applyNullableString(source, key, workflow, sources) {
  if (typeof source[key] === "string" || source[key] === null) {
    workflow[key] = source[key];
    sources[key] = "config";
  }
}
function applyPositiveInteger(source, key, workflow, sources) {
  if (typeof source[key] === "number" && Number.isInteger(source[key]) && source[key] > 0) {
    workflow[key] = source[key];
    sources[key] = "config";
  }
}
function booleanValue(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function stringValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
function nullableStringValue(value) {
  return typeof value === "string" || value === null ? value : null;
}
function positiveIntegerValue(value, fallback) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/worktree-safety/git.ts
import { execFileSync } from "child_process";
import { existsSync as existsSync8, lstatSync, mkdirSync as mkdirSync3, readFileSync as readFileSync8, unlinkSync, writeFileSync as writeFileSync3 } from "fs";
import { hostname } from "os";
function readCurrentBranch(root) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, stdio: "pipe", encoding: "utf8" }).trim();
  } catch {
    return void 0;
  }
}
function hasGitMarker(root, deps = defaultWorktreeSafetyDeps) {
  return deps.existsSync(`${root}/.git`);
}
var defaultWorktreeSafetyDeps = {
  existsSync: existsSync8,
  lstatSync,
  readFileSync: (path) => readFileSync8(path, "utf8"),
  writeFileSync: (path, content) => writeFileSync3(path, content, "utf8"),
  unlinkSync,
  mkdirSync: mkdirSync3,
  cwd: () => process.cwd(),
  env: (name) => process.env[name],
  currentBranch: readCurrentBranch,
  now: () => (/* @__PURE__ */ new Date()).toISOString(),
  hostname,
  pid: () => process.pid,
  isProcessAlive(pid, host) {
    if (host && host !== hostname()) return void 0;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
};

// src/worktree-safety/lease.ts
import { dirname as dirname3, isAbsolute as isAbsolute2, relative as relative2, resolve as resolve2 } from "path";

// src/recovery/types.ts
var RECOVERY_CLASSES = [
  "transient-external-failure",
  "repairable-state-drift",
  "unrepaired-state-drift",
  "worktree-invalid",
  "dispatch-contract-invalid",
  "artifact-gate-failed",
  "user-input-required",
  "internal-invariant-violation"
];
var RECOVERY_ACTION_VALUES = ["retry", "pause-with-remediation", "self-heal", "stop"];
var RECOVERY_ACTIONS = {
  "transient-external-failure": "retry",
  "repairable-state-drift": "self-heal",
  "unrepaired-state-drift": "pause-with-remediation",
  "worktree-invalid": "stop",
  "dispatch-contract-invalid": "stop",
  "artifact-gate-failed": "pause-with-remediation",
  "user-input-required": "pause-with-remediation",
  "internal-invariant-violation": "stop"
};

// src/recovery/classify-failure.ts
var RECONCILIATION_REASON_TO_RECOVERY_CLASS = {
  "sketch-flag-drift": "repairable-state-drift",
  "completion-timestamp-drift": "repairable-state-drift",
  "roadmap-divergence": "repairable-state-drift",
  "stale-worker": "unrepaired-state-drift",
  "unregistered-milestone": "unrepaired-state-drift",
  "summary-count-mismatch": "unrepaired-state-drift",
  "noncanonical-plan-like-file": "unrepaired-state-drift",
  "unknown-drift": "unrepaired-state-drift",
  "partial-write": "internal-invariant-violation"
};
function classifyFailure(input) {
  switch (input.kind) {
    case "reconciliation": {
      const klass = RECONCILIATION_REASON_TO_RECOVERY_CLASS[input.reasonCode];
      const written = input.written?.length ? input.written : input.blockers?.flatMap((blocker) => blocker.written ?? []);
      return decision(klass, `State reconciliation failed: ${input.reasonCode}.`, remediationFor(klass), {
        reasonCode: input.reasonCode,
        blockers: input.blockers,
        written,
        reconciliationEvidence: input.evidence
      });
    }
    case "artifact-gate":
      return decision("artifact-gate-failed", input.reason ?? "Artifact gate failed.", "Create or repair the required artifact before continuing.", input.evidence);
    case "dispatch":
      return decision("dispatch-contract-invalid", input.reason ?? "Dispatch contract was invalid.", "Inspect the dispatch contract and generated resources before retrying.", input.evidence);
    case "gate":
      return decision(input.retryable ? "transient-external-failure" : "dispatch-contract-invalid", input.reason ?? `Gate ${input.gate} failed.`, input.retryable ? "Retry after the transient dependency recovers." : "Inspect the gate input and dispatch contract.", input.evidence);
    case "worktree":
      return decision(input.class ?? "worktree-invalid", input.message ?? `Worktree safety check failed: ${input.reasonCode}.`, input.remediation ?? remediationFor(input.class ?? "worktree-invalid"), { ...input.evidence, reasonCode: input.reasonCode });
    case "external":
      if (input.reasonCode === "provider-network") return decision("transient-external-failure", input.message ?? "Provider or network failure.", "Retry after the external dependency recovers.", input.evidence);
      if (input.reasonCode === "missing-auth" || input.reasonCode === "user-input") return decision("user-input-required", input.message ?? "User input is required.", "Provide the missing user input or authentication, then resume.", input.evidence);
      return decision("internal-invariant-violation", input.message ?? "Unmodeled external failure shape.", remediationFor("internal-invariant-violation"), input.evidence);
  }
}
function decision(klass, message, remediation, evidence) {
  return {
    class: klass,
    action: RECOVERY_ACTIONS[klass],
    reasonCode: evidence?.reasonCode,
    message,
    remediation,
    evidence
  };
}
function remediationFor(klass) {
  switch (klass) {
    case "transient-external-failure":
      return "Retry after the transient dependency recovers.";
    case "repairable-state-drift":
      return "Run deterministic state reconciliation repair, then retry dispatch.";
    case "unrepaired-state-drift":
      return "Inspect planning state drift and remediate before resuming.";
    case "worktree-invalid":
      return "Repair or recreate the expected worktree/root before source-writing dispatch.";
    case "dispatch-contract-invalid":
      return "Fix the dispatch contract before continuing.";
    case "artifact-gate-failed":
      return "Create or repair the required artifact before continuing.";
    case "user-input-required":
      return "Provide the required user input before resuming.";
    case "internal-invariant-violation":
      return "Stop and inspect the invariant violation before continuing.";
  }
}

// src/worktree-safety/lease.ts
function readLeaseRecord(root, leasePath, deps = defaultWorktreeSafetyDeps) {
  const result = readLeaseRecordStrict(root, leasePath, deps);
  return result.ok ? result.record : void 0;
}
function readLeaseRecordStrict(root, leasePath, deps = defaultWorktreeSafetyDeps) {
  const resolved = resolveLeasePath(root, leasePath);
  const path = resolved.ok ? resolved.path : leasePath ?? `.planning/worktree-leases/lease.json`;
  if (!resolved.ok) return { ok: false, path, message: resolved.message };
  if (!deps.existsSync(resolved.path)) return { ok: true, path: resolved.path };
  try {
    const parsed = JSON.parse(deps.readFileSync(resolved.path));
    const validation = validateLeaseRecord(parsed);
    if (!validation.ok) return { ok: false, path: resolved.path, message: validation.message };
    return { ok: true, path: resolved.path, record: validation.record };
  } catch (error) {
    return { ok: false, path: resolved.path, message: error instanceof Error ? error.message : String(error) };
  }
}
function checkLeaseOwnership(input, root, branch, deps = defaultWorktreeSafetyDeps) {
  const resolved = resolveLeasePath(root, input.leasePath);
  if (!resolved.ok) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-path-outside-planning", class: "worktree-invalid", message: resolved.message, remediation: "Use a lease path under .planning.", evidence: { unitId: input.unitId, unitType: input.unitType, root, branch, paths: [input.leasePath ?? ""] } }) };
  }
  const leaseRead = readLeaseRecordStrict(root, input.leasePath, deps);
  if (!leaseRead.ok) {
    return leaseIoFailure(input, root, branch, "lease-invalid", "user-input-required", `Cannot prove lease ownership because the lease file is unreadable or invalid: ${leaseRead.message}`, "Inspect and repair or remove the lease only after proving ownership or process inactivity.", [leaseRead.path], [leaseRead.message]);
  }
  const record2 = leaseRead.record;
  const expected = expectedRecord(input, root, branch, deps);
  if (!record2) {
    try {
      deps.mkdirSync(dirname3(resolved.path), { recursive: true });
      deps.writeFileSync(resolved.path, JSON.stringify(expected, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return leaseIoFailure(input, root, branch, "lease-acquire-failed", "worktree-invalid", `Cannot acquire lease: ${message}`, "Inspect lease path permissions and retry only after source-writing ownership can be recorded.", [resolved.path], [message]);
    }
    return { ok: true, record: expected, journalEvents: [leaseAcquiredEvent(expected, resolved.path, input.attempt)] };
  }
  if (isOwner(record2, expected)) return { ok: true, record: record2 };
  const stale = reclaimStaleLeaseIfSafe(record2, expected, resolved.path, deps, input.attempt);
  if (stale.ok) return stale;
  const evidence = { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, expected, actual: record2 };
  const partial = !record2.pid || !record2.host || !record2.root || !record2.branch;
  const contradictory = Boolean(record2.root && record2.root !== root) || Boolean(record2.branch && branch && record2.branch !== branch);
  if (partial || contradictory) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: partial ? "lease-stale-incomplete" : "lease-stale-contradictory", class: partial ? "user-input-required" : "unrepaired-state-drift", message: "Stale lease evidence is incomplete or contradictory.", remediation: "Inspect and remediate the stale lease before continuing.", evidence }) };
  }
  return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-wrong-owner", class: "worktree-invalid", message: "Lease is held by a different owner.", remediation: "Stop and inspect lease ownership before source-writing dispatch.", evidence }) };
}
function releaseLeaseOwnership(input, root, branch, deps = defaultWorktreeSafetyDeps) {
  const effectiveDeps = { ...deps, ...input.deps };
  const resolved = resolveLeasePath(root, input.leasePath);
  if (!resolved.ok) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-path-outside-planning", class: "worktree-invalid", message: resolved.message, remediation: "Use a lease path under .planning.", evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, paths: [input.leasePath ?? ""] } }) };
  }
  const leaseRead = readLeaseRecordStrict(root, input.leasePath, effectiveDeps);
  if (!leaseRead.ok) {
    return leaseIoFailure(input, root, branch, "lease-invalid", "user-input-required", `Cannot release lease because the lease file is unreadable or invalid: ${leaseRead.message}`, "Inspect and repair or remove the lease only after proving ownership or process inactivity.", [leaseRead.path], [leaseRead.message]);
  }
  const record2 = leaseRead.record;
  const expected = expectedRecord(input, root, branch, effectiveDeps);
  if (!record2) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-missing", class: "worktree-invalid", message: "Cannot release a missing lease.", remediation: "Inspect lease lifecycle evidence before continuing.", evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, paths: [resolved.path] } }) };
  }
  if (!isOwner(record2, expected)) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-wrong-owner", class: "worktree-invalid", message: "Cannot release a lease held by a different owner.", remediation: "Stop and inspect lease ownership before releasing source-writing ownership.", evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, expected, actual: record2, paths: [resolved.path] } }) };
  }
  try {
    effectiveDeps.unlinkSync(resolved.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return leaseIoFailure(input, root, branch, "lease-release-failed", "worktree-invalid", `Cannot release lease: ${message}`, "Inspect and remove the lease only after proving ownership or process inactivity.", [resolved.path], [message], { expected, actual: record2 });
  }
  return { ok: true, record: record2, journalEvents: [leaseReleasedEvent(record2, resolved.path, input.attempt)] };
}
function reclaimStaleLeaseIfSafe(record2, expected, path, deps = defaultWorktreeSafetyDeps, attempt) {
  const alive = record2.pid ? deps.isProcessAlive?.(record2.pid, record2.host) : void 0;
  if (alive !== false || !record2.root || !record2.branch || record2.root !== expected.root || record2.branch !== expected.branch) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-not-reclaimable", class: "unrepaired-state-drift", message: "Lease is not safely reclaimable.", remediation: "Inspect the lease owner before continuing.", evidence: { unitId: expected.unitId, phase: expected.phase, root: expected.root, branch: expected.branch } }) };
  }
  try {
    deps.mkdirSync(dirname3(path), { recursive: true });
    deps.writeFileSync(path, JSON.stringify(expected, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return leaseIoFailure({ unitId: expected.unitId, unitType: "execute", phase: expected.phase }, expected.root ?? "", expected.branch, "lease-reclaim-failed", "worktree-invalid", `Cannot reclaim stale lease: ${message}`, "Inspect lease path permissions and retry only after source-writing ownership can be recorded.", [path], [message], { expected, actual: record2 });
  }
  return { ok: true, record: expected, selfHealed: true, journalEvents: [leaseStaleReclaimedEvent(expected, path, attempt)] };
}
function leaseAcquiredEvent(record2, path, attempt) {
  return leaseEvent("lease_acquired", record2, path, attempt, "self-heal", "repairable-state-drift", "lease-acquired");
}
function leaseReleasedEvent(record2, path, attempt) {
  return leaseEvent("lease_released", record2, path, attempt, "self-heal", "repairable-state-drift", "lease-released");
}
function leaseStaleReclaimedEvent(record2, path, attempt) {
  return leaseEvent("lease_stale_reclaimed", record2, path, attempt, "self-heal", "repairable-state-drift", "lease-stale-reclaimed");
}
function leaseEvent(type, record2, path, attempt, action, recoveryClass, reasonCode) {
  return { type, event: type, unitId: record2.unitId, phase: record2.phase, root: record2.root, branch: record2.branch, paths: path ? [path] : void 0, attempt, action, recoveryClass, reasonCode, message: type, host: record2.host, pid: record2.pid };
}
function validateLeaseRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "lease record must be a JSON object" };
  const record2 = value;
  if (typeof record2.unitId !== "string" || record2.unitId.length === 0) return { ok: false, message: "lease record must include a unitId" };
  if (record2.sessionId !== void 0 && typeof record2.sessionId !== "string") return { ok: false, message: "lease record sessionId must be a string" };
  if (record2.phase !== void 0 && typeof record2.phase !== "string") return { ok: false, message: "lease record phase must be a string" };
  if (record2.branch !== void 0 && typeof record2.branch !== "string") return { ok: false, message: "lease record branch must be a string" };
  if (record2.root !== void 0 && typeof record2.root !== "string") return { ok: false, message: "lease record root must be a string" };
  if (record2.host !== void 0 && typeof record2.host !== "string") return { ok: false, message: "lease record host must be a string" };
  if (record2.pid !== void 0 && typeof record2.pid !== "number") return { ok: false, message: "lease record pid must be a number" };
  if (record2.updatedAt !== void 0 && typeof record2.updatedAt !== "string") return { ok: false, message: "lease record updatedAt must be a string" };
  return { ok: true, record: record2 };
}
function leaseIoFailure(input, root, branch, reasonCode, recoveryClass, message, remediation, paths, messages, ownership) {
  return {
    ok: false,
    decision: classifyFailure({
      kind: "worktree",
      reasonCode,
      class: recoveryClass,
      message,
      remediation,
      evidence: {
        unitId: input.unitId,
        unitType: input.unitType,
        phase: input.phase,
        root,
        branch,
        paths,
        messages,
        ...ownership?.expected ? { expected: ownership.expected } : {},
        ...ownership?.actual ? { actual: ownership.actual } : {}
      }
    })
  };
}
function expectedRecord(input, root, branch, deps) {
  return { unitId: input.unitId, sessionId: input.sessionId, phase: input.phase, branch, root, host: deps.hostname(), pid: deps.pid(), updatedAt: deps.now() };
}
function isOwner(record2, expected) {
  return record2.unitId === expected.unitId && record2.sessionId === expected.sessionId && record2.phase === expected.phase && record2.branch === expected.branch && record2.root === expected.root && record2.host === expected.host && record2.pid === expected.pid;
}
function resolveLeasePath(root, leasePath) {
  const planningDir = resolve2(root, ".planning");
  const candidate = resolve2(root, leasePath ?? `.planning/worktree-leases/lease.json`);
  if (!isInsideOrSame(planningDir, candidate)) return { ok: false, message: `refusing lease path outside .planning: ${candidate}` };
  return { ok: true, path: candidate };
}
function isInsideOrSame(parent, child) {
  const rel = relative2(parent, child);
  return rel === "" || !rel.startsWith("..") && !isAbsolute2(rel);
}

// src/worktree-safety/prepare-unit-root.ts
import { resolve as resolve3 } from "path";
var SOURCE_WRITING_UNITS = {
  discuss: false,
  research: false,
  plan: false,
  "plan-check": false,
  execute: true,
  "code-review": false,
  verify: false,
  "ui-review": false,
  "security-review": false,
  "nyquist-validation": false,
  "ai-integration": false,
  "ui-safety-gate": false,
  closeout: false,
  "settings-gate": false,
  "pause-for-user": false
};
function isSourceWritingUnit(unitType) {
  return SOURCE_WRITING_UNITS[unitType] === true;
}
function resolveExpectedUnitRoot(input, deps) {
  return resolve3(input.unitRoot ?? input.projectRoot ?? deps.cwd());
}
function prepareUnitRoot(unitTypeOrInput, unitId2, options = {}) {
  const input = typeof unitTypeOrInput === "string" ? { ...options, unitType: unitTypeOrInput, unitId: unitId2 ?? `${options.phase ?? "unit"}:${unitTypeOrInput}` } : unitTypeOrInput;
  const deps = { ...defaultWorktreeSafetyDeps, ...input.deps };
  const projectRoot = resolve3(input.projectRoot ?? deps.env("GSD_PROJECT_ROOT") ?? deps.cwd());
  const root = resolveExpectedUnitRoot({ ...input, projectRoot }, deps);
  const branch = deps.currentBranch(root);
  if (!isSourceWritingUnit(input.unitType)) {
    return { ok: true, root, evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, messages: [`${input.unitType} does not require isolated source worktree validation`] } };
  }
  if (!deps.existsSync(`${root}/.git`)) {
    return fail("missing-git-marker", "Worktree root is missing a .git marker.", "Recover or recreate the expected Git root before dispatch.", input, root, branch);
  }
  const envRoot = deps.env("GSD_PROJECT_ROOT");
  if (envRoot && resolve3(envRoot) !== projectRoot) {
    return fail("project-root-mismatch", "GSD_PROJECT_ROOT does not match the expected project root.", "Run from the expected project root or update GSD_PROJECT_ROOT before dispatch.", input, root, branch, { expectedProjectRoot: projectRoot, actualCwd: deps.cwd(), resolvedUnitRoot: root });
  }
  if (input.expectedBranch && branch !== input.expectedBranch) {
    return fail("branch-mismatch", "Current branch does not match the expected branch.", "Switch to the expected branch manually before dispatch; the orchestrator will not checkout branches.", input, root, branch, { expectedBranch: input.expectedBranch });
  }
  if (input.workflow?.worktrees === false) {
    return { ok: true, root, evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, messages: ["project-root validation passed; isolated lease skipped by workflow.worktrees=false"] } };
  }
  const lease = checkLeaseOwnership(input, root, branch, deps);
  if (!lease.ok) return lease;
  return { ok: true, root, evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, journalEvents: lease.journalEvents, messages: lease.selfHealed ? ["stale lease reclaimed"] : ["worktree validation passed"] } };
}
function fail(reasonCode, message, remediation, input, root, branch, extra = {}) {
  return {
    ok: false,
    decision: classifyFailure({
      kind: "worktree",
      reasonCode,
      class: "worktree-invalid",
      message,
      remediation,
      evidence: {
        unitId: input.unitId,
        unitType: input.unitType,
        phase: input.phase,
        root,
        branch,
        resolvedUnitRoot: root,
        actualCwd: input.deps?.cwd?.(),
        ...extra
      }
    })
  };
}

// src/orchestrator/gates.ts
import { existsSync as existsSync18, readdirSync as readdirSync3, readFileSync as readFileSync17, statSync as statSync4 } from "fs";
import { basename as basename3, isAbsolute as isAbsolute4, join as join18, resolve as resolve5 } from "path";

// src/tool-contract/compile.ts
import { existsSync as existsSync10, readFileSync as readFileSync10 } from "fs";
import { createHash as createHash4 } from "crypto";
import { basename, join as join11, posix, relative as relative3 } from "path";

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

// src/tool-contract/snapshot.ts
import { existsSync as existsSync9, mkdirSync as mkdirSync4, readFileSync as readFileSync9, writeFileSync as writeFileSync4 } from "fs";
import { dirname as dirname4, join as join10 } from "path";
import { createHash as createHash3 } from "crypto";
function writeToolContractSnapshot(snapshot, options) {
  const outDir = options.outDir ?? join10(options.cwd, "generated");
  const outFileName = options.outFileName ?? "tool-contracts.json";
  const outPath = join10(outDir, outFileName);
  mkdirSync4(outDir, { recursive: true });
  const contentHash = calculateToolContractHash(snapshot);
  const stamped = { ...snapshot, contractHash: contentHash };
  const stampedJson = stableStringify2(stamped);
  writeFileSync4(outPath, `${stampedJson}
`, "utf8");
  return outPath;
}
function calculateToolContractHash(snapshot) {
  return createHash3("sha256").update(stableStringify2({ ...snapshot, contractHash: "" }), "utf8").digest("hex");
}
function stableStringify2(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify2(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify2(v)}`).join(",")}}`;
}

// src/tool-contract/compile.ts
var PROMPT_OBLIGATION_MARKERS = [
  { marker: /SUMMARY\.md/i, obligation: "write-phase-summary" },
  { marker: /PLAN\.md/i, obligation: "produce-plan-artifact" },
  { marker: /VERIFICATION\.md/i, obligation: "produce-verification" },
  { marker: /REVIEW\.md/i, obligation: "produce-review" },
  { marker: /RESEARCH\.md/i, obligation: "produce-research" },
  { marker: /CONTEXT\.md/i, obligation: "produce-context" },
  { marker: /UI-SPEC\.md/i, obligation: "produce-ui-spec" },
  { marker: /VALIDATION\.md/i, obligation: "produce-validation" }
];
var CLOSEOUT_REQUIREMENTS = ["update-roadmap", "update-state", "phase-summary-exists"];
function compileToolContracts(options) {
  const cwd = options.cwd;
  const generatedRoot = join11(cwd, "generated");
  const official = resolveOfficialPackage({ startDir: cwd });
  const officialConfig = loadOfficialWorkflowConfig({ startDir: cwd });
  const schemaKeys = officialConfig.schema.workflowKeys;
  const contracts = [];
  const unitTypes = [
    "discuss",
    "research",
    "plan",
    "plan-check",
    "execute",
    "code-review",
    "verify",
    "ui-review",
    "security-review",
    "nyquist-validation",
    "ai-integration",
    "ui-safety-gate",
    "closeout",
    "settings-gate"
  ];
  for (const unitType of unitTypes) {
    const target = resolveUnitDispatchTarget({ type: unitType, id: `${unitType}-compile`, status: "pending", phase: "compile", label: unitType, required: true, source: "default" });
    const promptRelative = target.prompt;
    const promptAbs = join11(cwd, promptRelative);
    if (!existsSync10(promptAbs)) continue;
    const promptContent = readFileSync10(promptAbs, "utf8");
    const promptHash = hashContent(promptContent);
    const agent = target.agent;
    let allowedTools = [];
    let agentPath;
    if (agent) {
      const agentRel = posix.join("generated", "agents", `${agent}.md`);
      const agentAbs = join11(cwd, agentRel);
      if (existsSync10(agentAbs)) {
        agentPath = agentRel;
        const agentContent = readFileSync10(agentAbs, "utf8");
        const parsed = splitFrontmatter(agentContent);
        allowedTools = parseToolList(parsed.data.tools);
      }
    }
    const promptObligations = extractPromptObligations(promptContent);
    const validationRequirements = [];
    for (const key of schemaKeys) {
      if (key.includes(`${unitType}`) || key.includes(`workflow.${unitType.replace(/-/g, "_")}`)) {
        validationRequirements.push(key);
      }
    }
    if (validationRequirements.length === 0) validationRequirements.push("dispatch-target-present");
    const closeoutRequirements = unitType === "closeout" ? [...CLOSEOUT_REQUIREMENTS] : [];
    const sourcePaths = Array.from(/* @__PURE__ */ new Set([promptRelative, ...agentPath ? [agentPath] : []]));
    const base = {
      unitType,
      promptName: basename(promptRelative),
      promptPath: promptRelative,
      promptHash,
      ...agent ? { agent } : {},
      ...agentPath ? { agentPath } : {},
      allowedTools,
      schemaKeys: validationRequirements,
      validationRequirements,
      closeoutRequirements,
      sourcePaths
    };
    contracts.push(applyOverlay(base, options.overlay?.[unitType]));
  }
  const snapshot = {
    contractVersion: 1,
    contractHash: "",
    officialPackage: official.packageName,
    officialVersion: official.version,
    generatedRoot: relative3(cwd, generatedRoot) || "generated",
    contracts
  };
  snapshot.contractHash = calculateToolContractHash(snapshot);
  return snapshot;
}
function applyOverlay(base, overlayEntry) {
  if (!overlayEntry) return base;
  if (overlayEntry.allowedTools) {
    const overlaySet = new Set(overlayEntry.allowedTools);
    const baseSet = new Set(base.allowedTools);
    let isRelaxation = false;
    if (baseSet.size > 0) {
      for (const tool of baseSet) {
        if (!overlaySet.has(tool)) {
          isRelaxation = true;
          break;
        }
      }
    }
    if (isRelaxation) {
      throw new Error(
        `Tool Contract overlay cannot relax upstream allowed tools for unit ${base.unitType} (D-02).`
      );
    }
  }
  if (overlayEntry.validationRequirements) {
    const overlaySet = new Set(overlayEntry.validationRequirements);
    for (const req of base.validationRequirements) {
      if (!overlaySet.has(req)) {
        throw new Error(
          `Tool Contract overlay cannot relax upstream validation requirements for unit ${base.unitType} (D-02).`
        );
      }
    }
  }
  if (overlayEntry.closeoutRequirements) {
    const overlaySet = new Set(overlayEntry.closeoutRequirements);
    for (const req of base.closeoutRequirements) {
      if (!overlaySet.has(req)) {
        throw new Error(
          `Tool Contract overlay cannot relax upstream closeout requirements for unit ${base.unitType} (D-02).`
        );
      }
    }
  }
  const merged = {
    ...base,
    ...overlayEntry.allowedTools ? { allowedTools: [.../* @__PURE__ */ new Set([...base.allowedTools, ...overlayEntry.allowedTools])] } : {},
    ...overlayEntry.validationRequirements ? { validationRequirements: [.../* @__PURE__ */ new Set([...base.validationRequirements, ...overlayEntry.validationRequirements])] } : {},
    ...overlayEntry.closeoutRequirements ? { closeoutRequirements: [.../* @__PURE__ */ new Set([...base.closeoutRequirements, ...overlayEntry.closeoutRequirements])] } : {}
  };
  return merged;
}
function extractPromptObligations(promptContent) {
  const obligations = /* @__PURE__ */ new Set();
  for (const { marker, obligation } of PROMPT_OBLIGATION_MARKERS) {
    if (marker.test(promptContent)) obligations.add(obligation);
  }
  return Array.from(obligations);
}
function parseToolList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((tool) => tool.trim()).filter(Boolean);
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map((tool) => tool.trim()).filter(Boolean);
  }
  return trimmed.split(",").map((tool) => tool.trim()).filter(Boolean);
}
function hashContent(content) {
  return createHash4("sha256").update(content, "utf8").digest("hex");
}
function verifyToolContractSnapshot(options) {
  const cwd = options.cwd;
  const snapshot = options.snapshot ?? readSnapshot(cwd);
  if (!snapshot) {
    return {
      ok: true,
      failures: [],
      warnings: [],
      snapshotPresent: false
    };
  }
  const failures = [];
  const warnings = [];
  const expectedHash = calculateToolContractHash(snapshot);
  if (snapshot.contractHash !== expectedHash) {
    failures.push({
      unitType: "snapshot",
      contractHash: snapshot.contractHash,
      contractVersion: snapshot.contractVersion,
      failedField: "contractHash",
      expected: expectedHash,
      actual: snapshot.contractHash,
      sourcePaths: ["generated/tool-contracts.json"]
    });
  }
  for (const contract of snapshot.contracts) {
    const promptAbs = join11(cwd, contract.promptPath);
    if (!existsSync10(promptAbs)) {
      failures.push({
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "promptPath",
        expected: contract.promptPath,
        actual: "missing",
        sourcePaths: [contract.promptPath]
      });
      continue;
    }
    const currentPromptHash = hashContent(readFileSync10(promptAbs, "utf8"));
    if (currentPromptHash !== contract.promptHash) {
      const currentPrompt = readFileSync10(promptAbs, "utf8");
      const currentObligations = extractPromptObligations(currentPrompt);
      const missing = contract.validationRequirements.filter((req) => {
        if (req === "dispatch-target-present") return false;
        return false;
      });
      if (missing.length > 0) {
        failures.push({
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "validationRequirements",
          expected: contract.validationRequirements.join(","),
          actual: missing.join(","),
          sourcePaths: [contract.promptPath]
        });
      } else if (currentObligations.length === 0) {
        warnings.push({
          unitType: contract.unitType,
          field: "promptHash",
          expected: contract.promptHash.slice(0, 12),
          actual: currentPromptHash.slice(0, 12),
          sourcePaths: [contract.promptPath]
        });
      } else {
        warnings.push({
          unitType: contract.unitType,
          field: "promptHash",
          expected: contract.promptHash.slice(0, 12),
          actual: currentPromptHash.slice(0, 12),
          sourcePaths: [contract.promptPath]
        });
      }
    }
    if (contract.agentPath) {
      const agentAbs = join11(cwd, contract.agentPath);
      if (!existsSync10(agentAbs)) {
        failures.push({
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: contract.agentPath,
          actual: "missing",
          sourcePaths: [contract.agentPath]
        });
        continue;
      }
      const currentAgent = readFileSync10(agentAbs, "utf8");
      const currentTools = parseToolList(splitFrontmatter(currentAgent).data.tools);
      const contractToolSet = new Set(contract.allowedTools);
      const currentToolSet = new Set(currentTools);
      for (const tool of contractToolSet) {
        if (!currentToolSet.has(tool)) {
          failures.push({
            unitType: contract.unitType,
            contractHash: snapshot.contractHash,
            contractVersion: snapshot.contractVersion,
            failedField: "allowedTools",
            expected: Array.from(contractToolSet).join(","),
            actual: currentTools.join(","),
            sourcePaths: [contract.agentPath]
          });
          break;
        }
      }
      for (const tool of currentToolSet) {
        if (!contractToolSet.has(tool)) {
          warnings.push({
            unitType: contract.unitType,
            field: "allowedTools",
            expected: Array.from(contractToolSet).join(","),
            actual: currentTools.join(","),
            sourcePaths: [contract.agentPath]
          });
          break;
        }
      }
    }
  }
  return { ok: failures.length === 0, failures, warnings, snapshotPresent: true };
}
function readSnapshot(cwd) {
  const path = join11(cwd, "generated", "tool-contracts.json");
  if (!existsSync10(path)) return void 0;
  try {
    return JSON.parse(readFileSync10(path, "utf8"));
  } catch {
    return void 0;
  }
}

// src/tool-contract/validate.ts
import { existsSync as existsSync11 } from "fs";
import { join as join12 } from "path";
var MAX_FIELD_SUMMARY = 80;
function validateUnitToolContract(unit2, options) {
  const { snapshot } = options;
  const expectedHash = calculateToolContractHash(snapshot);
  if (snapshot.contractHash !== expectedHash) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit2.id,
        unitType: String(unit2.type),
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "contractHash",
        expected: expectedHash,
        actual: snapshot.contractHash,
        sourcePaths: ["generated/tool-contracts.json"]
      })
    };
  }
  const contract = snapshot.contracts.find((entry) => entry.unitType === unit2.type);
  if (!contract) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit2.id,
        unitType: String(unit2.type),
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "unitType",
        expected: "known unit type",
        actual: truncate(String(unit2.type)),
        sourcePaths: []
      })
    };
  }
  return { ok: true, contract };
}
function validateUnitToolContractAgainstDisk(options) {
  const { snapshot, unit: unit2, cwd } = options;
  const cheap = validateUnitToolContract(unit2, { snapshot });
  if (!cheap.ok) return cheap;
  const contract = cheap.contract;
  const target = resolveUnitDispatchTarget(unit2);
  const expectedPromptRel = target.prompt;
  const expectedAgent = target.agent;
  if (contract.promptPath !== expectedPromptRel) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit2.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "promptPath",
        expected: truncate(expectedPromptRel),
        actual: truncate(contract.promptPath),
        sourcePaths: [contract.promptPath, expectedPromptRel]
      })
    };
  }
  const promptAbs = join12(cwd, expectedPromptRel);
  if (!existsSync11(promptAbs)) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit2.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "promptPath",
        expected: truncate(expectedPromptRel),
        actual: "missing",
        sourcePaths: [expectedPromptRel]
      })
    };
  }
  if (contract.agent !== expectedAgent) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit2.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "agent",
        expected: expectedAgent ?? "none",
        actual: contract.agent ?? "none",
        sourcePaths: [contract.agentPath, expectedAgent ? `generated/agents/${expectedAgent}.md` : void 0].filter((path) => Boolean(path))
      })
    };
  }
  if (expectedAgent) {
    const expectedAgentPath = `generated/agents/${expectedAgent}.md`;
    if (contract.agentPath !== expectedAgentPath) {
      return {
        ok: false,
        failure: boundedFailure({
          unitId: unit2.id,
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: truncate(expectedAgentPath),
          actual: truncate(contract.agentPath ?? "missing"),
          sourcePaths: [contract.agentPath, expectedAgentPath].filter((path) => Boolean(path))
        })
      };
    }
  } else if (contract.agentPath) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit2.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "agentPath",
        expected: "none",
        actual: truncate(contract.agentPath),
        sourcePaths: [contract.agentPath]
      })
    };
  }
  if (contract.agent) {
    if (!contract.agentPath) {
      return {
        ok: false,
        failure: boundedFailure({
          unitId: unit2.id,
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: "agentPath present",
          actual: "missing",
          sourcePaths: [contract.agentPath ?? ""].filter(Boolean)
        })
      };
    }
    const agentAbs = join12(cwd, contract.agentPath);
    if (!existsSync11(agentAbs)) {
      return {
        ok: false,
        failure: boundedFailure({
          unitId: unit2.id,
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: truncate(contract.agentPath),
          actual: "missing",
          sourcePaths: [contract.agentPath]
        })
      };
    }
  }
  return { ok: true, contract };
}
function boundedFailure(failure) {
  return {
    unitId: failure.unitId,
    unitType: failure.unitType,
    contractHash: failure.contractHash,
    contractVersion: failure.contractVersion,
    failedField: failure.failedField,
    expected: failure.expected ? truncate(failure.expected) : void 0,
    actual: failure.actual ? truncate(failure.actual) : void 0,
    sourcePaths: (failure.sourcePaths ?? []).map((path) => truncate(path, 160)).slice(0, 6)
  };
}
function truncate(value, max = MAX_FIELD_SUMMARY) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

// src/orchestrator/outcomes.ts
import { readFileSync as readFileSync11 } from "fs";
var POST_DISPATCH_POLICIES = {
  discuss: { artifactSuffix: "CONTEXT.md" },
  research: { artifactSuffix: "RESEARCH.md" },
  plan: { artifactSuffix: "PLAN.md" },
  "plan-check": {
    passMarkers: ["verification_passed"],
    pauseMarkers: {
      issues_found: "Plan checker found issues; revise the plan before execution."
    },
    requireRecognizedOutcome: true
  },
  execute: {
    artifactSuffixes: ["SUMMARY.md", "VERIFICATION.md"],
    requiredArtifacts: ["SUMMARY.md", "VERIFICATION.md"],
    passStatuses: ["passed", "pass"],
    pauseStatuses: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion."
    },
    pauseMarkers: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion.",
      verification_failed: "Execution verification failed; inspect VERIFICATION.md before continuing."
    },
    requireRecognizedOutcome: true
  },
  "code-review": {
    artifactSuffix: "REVIEW.md",
    passStatuses: ["clean", "skipped", "issues_found"],
    requireRecognizedOutcome: true
  },
  verify: {
    artifactSuffix: "VERIFICATION.md",
    passStatuses: ["passed", "pass"],
    pauseStatuses: {
      gaps_found: "Verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Phase verification requires human verification before closeout."
    },
    requireRecognizedOutcome: true
  },
  "security-review": {
    artifactSuffix: "SECURITY.md",
    custom: "security",
    requireRecognizedOutcome: true
  },
  "nyquist-validation": {
    artifactSuffix: "VALIDATION.md",
    custom: "nyquist",
    requireRecognizedOutcome: true
  },
  "ai-integration": { artifactSuffix: "AI-SPEC.md" },
  "settings-gate": { artifactSuffix: "UI-SPEC.md" },
  "ui-safety-gate": {
    artifactSuffix: "UI-SPEC.md",
    passStatuses: ["approved"],
    pauseStatuses: {
      blocked: "UI-SPEC checker blocked this phase; fix UI-SPEC.md before planning.",
      draft: "UI-SPEC is still draft; checker approval is required before planning."
    },
    passMarkers: ["ui_spec_verified", "approved"],
    pauseMarkers: {
      ui_spec_blocked: "UI-SPEC checker blocked this phase; fix UI-SPEC.md before planning.",
      issues_found: "UI-SPEC checker found blocking issues; fix UI-SPEC.md before planning.",
      blocked: "UI-SPEC checker blocked this phase; fix UI-SPEC.md before planning."
    },
    requireRecognizedOutcome: true
  },
  "ui-review": { artifactSuffix: "UI-REVIEW.md", passMarkers: ["ui_review_complete"] }
};
function resolvePostDispatchPolicy(unitType, cwd) {
  const fallback = POST_DISPATCH_POLICIES[unitType];
  const contractPolicy = cwd ? readOrchestrationContractSnapshot(cwd)?.outcomes[unitType] : void 0;
  if (!contractPolicy) return fallback;
  return {
    ...fallback,
    ...contractPolicy
  };
}
function evaluatePostDispatchPolicy(policy, input) {
  const signals = collectSignals(input);
  if (policy.custom === "security") {
    return evaluateSecurityPolicy(input.phase, signals);
  }
  if (policy.custom === "nyquist") {
    return evaluateNyquistPolicy(signals);
  }
  for (const [status, hint] of Object.entries(policy.pauseStatuses ?? {})) {
    if (signals.statuses.has(normalizeSignal(status))) {
      return fail2(hint, input.phase, signals.evidence);
    }
  }
  for (const [marker, hint] of Object.entries(policy.pauseMarkers ?? {})) {
    if (signals.markers.has(normalizeSignal(marker))) {
      return fail2(hint, input.phase, signals.evidence);
    }
  }
  for (const status of policy.passStatuses ?? []) {
    if (signals.statuses.has(normalizeSignal(status))) {
      return { ok: true, evidence: signals.evidence };
    }
  }
  for (const marker of policy.passMarkers ?? []) {
    if (signals.markers.has(normalizeSignal(marker))) {
      return { ok: true, evidence: signals.evidence };
    }
  }
  if (policy.requireRecognizedOutcome) {
    return {
      ok: false,
      resumeHint: `${input.unitType} did not report a recognized completion outcome.`,
      evidence: signals.evidence.length ? signals.evidence : ["outcome:missing"]
    };
  }
  return { ok: true, evidence: signals.evidence };
}
function collectSignals(input) {
  const statuses = /* @__PURE__ */ new Set();
  const markers = /* @__PURE__ */ new Set();
  const fields = /* @__PURE__ */ new Map();
  const evidence = [];
  const addStatus = (value) => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return;
    const normalized = normalizeSignal(String(value));
    if (!normalized) return;
    statuses.add(normalized);
    evidence.push(`status:${normalized}`);
  };
  const addMarker = (value) => {
    if (typeof value !== "string") return;
    const normalized = normalizeSignal(value);
    if (!normalized) return;
    markers.add(normalized);
    evidence.push(`marker:${normalized}`);
  };
  const addField = (key, value) => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return;
    const normalizedKey = normalizeSignal(key);
    const normalizedValue = normalizeScalar(String(value));
    fields.set(normalizedKey, normalizedValue);
    evidence.push(`field:${normalizedKey}:${normalizedValue}`);
    if (["status", "verification", "verdict", "outcome"].includes(normalizedKey)) addStatus(String(value));
  };
  const artifactPaths = unique([...input.artifactPath ? [input.artifactPath] : [], ...input.artifactPaths ?? []]);
  for (const artifactPath of artifactPaths) {
    evidence.push(`artifact:${artifactPath}`);
    const parsed = splitFrontmatter(readFileSync11(artifactPath, "utf8"));
    for (const [key, value] of Object.entries(parsed.data)) {
      if (Array.isArray(value)) continue;
      addField(key, value);
    }
    for (const [key, value] of knownFields(parsed.body)) addField(key, value);
    for (const marker of knownMarkers(parsed.body)) addMarker(marker);
  }
  if (input.outcome) {
    addStatus(input.outcome.status);
    addStatus(input.outcome.verdict);
    addMarker(input.outcome.marker);
    addMarker(input.outcome.verdict);
    for (const [key, value] of Object.entries(input.outcome.data ?? {})) addField(key, value);
  }
  for (const message of input.messages ?? []) {
    for (const [key, value] of knownFields(message)) addField(key, value);
    for (const marker of knownMarkers(message)) addMarker(marker);
  }
  return { statuses, markers, fields, evidence: unique(evidence) };
}
function evaluateSecurityPolicy(phase, signals) {
  const threatsOpen = numberField(signals.fields.get("threats_open"));
  if (threatsOpen !== void 0) {
    return threatsOpen === 0 ? { ok: true, evidence: signals.evidence } : fail2("Security review has open threats; resolve or accept risks before continuing.", phase, signals.evidence);
  }
  if (signals.markers.has("open_threats") || signals.markers.has("escalate")) {
    return fail2("Security review reported open threats; resolve or accept risks before continuing.", phase, signals.evidence);
  }
  if (signals.markers.has("secured") || signals.statuses.has("verified") || signals.statuses.has("passed")) {
    return { ok: true, evidence: signals.evidence };
  }
  return { ok: false, resumeHint: "Security review did not report threats_open: 0 or SECURED.", evidence: signals.evidence.length ? signals.evidence : ["security-outcome:missing"] };
}
function evaluateNyquistPolicy(signals) {
  const compliant = signals.fields.get("nyquist_compliant");
  if (signals.markers.has("escalate")) {
    return { ok: false, resumeHint: "Nyquist validation escalated unresolved coverage gaps.", evidence: signals.evidence };
  }
  if (compliant === "true") return { ok: true, evidence: signals.evidence };
  if (compliant === "false") {
    return { ok: false, resumeHint: "Nyquist validation is not compliant yet.", evidence: signals.evidence };
  }
  if (signals.markers.has("gaps_filled") || signals.statuses.has("passed") || signals.statuses.has("verified")) {
    return { ok: true, evidence: signals.evidence };
  }
  return { ok: false, resumeHint: "Nyquist validation did not report compliant coverage.", evidence: signals.evidence.length ? signals.evidence : ["nyquist-outcome:missing"] };
}
function fail2(template, phase, evidence) {
  return { ok: false, resumeHint: template.replaceAll("{phase}", phase), evidence };
}
function knownMarkers(text) {
  const markers = [
    "PHASE COMPLETE",
    "VERIFICATION PASSED",
    "ISSUES FOUND",
    "UI-SPEC VERIFIED",
    "UI-SPEC BLOCKED",
    "GAPS FILLED",
    "OPEN_THREATS",
    "SECURED",
    "ESCALATE",
    "UI REVIEW COMPLETE",
    "APPROVED",
    "BLOCKED",
    "GAPS FOUND",
    "HUMAN NEEDED",
    "VERIFICATION FAILED"
  ];
  return markers.filter((marker) => new RegExp(`(?:^|\\n)\\s*(?:#{1,3}\\s*)?${escapeRegExp(marker)}\\b`, "i").test(text));
}
function knownFields(text) {
  const fields = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(Verification|Status|Outcome|Verdict):\s*(.+?)\s*$/i);
    if (match) fields.push([match[1], match[2]]);
  }
  return fields;
}
function normalizeSignal(value) {
  return normalizeScalar(value.replace(/^#+\s*/, ""));
}
function normalizeScalar(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function numberField(value) {
  if (value === void 0) return void 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : void 0;
}
function unique(values) {
  return [...new Set(values)];
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/orchestrator/reconciliation.ts
import { relative as relative5 } from "path";

// src/state-reconciliation/index.ts
import { existsSync as existsSync17 } from "fs";
import { join as join17 } from "path";

// src/state-reconciliation/drift/noncanonical-plan-like-file.ts
function detectNoncanonicalPlanLikeFiles(input) {
  return {
    repairs: [],
    blockers: [],
    evidence: input.snapshot.phases.flatMap((phase) => phase.noncanonical)
  };
}

// src/state-reconciliation/drift/completion-timestamp.ts
import { readFileSync as readFileSync12 } from "fs";
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
    const match = /^completed:\s*["']?(?<date>\d{4}-\d{2}-\d{2})["']?\s*$/m.exec(readFileSync12(path, "utf8"));
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
    if (expectedTotal === 0 && expectedComplete === 0 && row.plansComplete === 0 && row.status === "Not started") {
      continue;
    }
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
import { basename as basename2 } from "path";
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
      message: `Canonical plan ${basename2(path)} has no matching ${phase.phase}-${plan}-SUMMARY.md artifact.`
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
  return pattern.exec(basename2(path))?.[1];
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
import { existsSync as existsSync12, readFileSync as readFileSync13 } from "fs";
import { join as join13 } from "path";
function readJournalState(basePath) {
  const path = join13(basePath, ".planning", "orchestration-state.json");
  if (!existsSync12(path)) {
    return { ok: true, path, blockers: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync13(path, "utf8"));
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
import { existsSync as existsSync15, readFileSync as readFileSync16, writeFileSync as writeFileSync5 } from "fs";
import { isAbsolute as isAbsolute3, relative as relative4, resolve as resolve4 } from "path";

// src/state-reconciliation/roadmap.ts
import { existsSync as existsSync13, readFileSync as readFileSync14 } from "fs";
import { join as join14 } from "path";
function readRoadmapState(basePath) {
  const path = join14(basePath, ".planning", "ROADMAP.md");
  if (!existsSync13(path)) {
    return {
      path,
      phases: [],
      blockers: [metadataBlocker("roadmap", path, "Missing ROADMAP.md metadata file.")]
    };
  }
  const lines = readFileSync14(path, "utf8").split(/\r?\n/);
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
import { existsSync as existsSync14, readFileSync as readFileSync15 } from "fs";
import { join as join15 } from "path";
function readStateDigest(basePath) {
  const path = join15(basePath, ".planning", "STATE.md");
  if (!existsSync14(path)) {
    return {
      path,
      frontmatter: {},
      currentPosition: {},
      blockers: [metadataBlocker2(path, "Missing STATE.md metadata file.")]
    };
  }
  const content = readFileSync15(path, "utf8");
  return {
    path,
    frontmatter: parseFrontmatter2(content),
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
function parseFrontmatter2(content) {
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
  const planningRoot = resolve4(basePath, ".planning");
  const target = resolve4(path);
  const rel = relative4(planningRoot, target);
  return rel === "" || !!rel && !rel.startsWith("..") && !isAbsolute3(rel);
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
  exists: existsSync15,
  readFile: (path) => readFileSync16(path, "utf8"),
  writeFile: (path, content) => writeFileSync5(path, content, "utf8")
};

// src/state-reconciliation/scan.ts
import { existsSync as existsSync16, readdirSync as readdirSync2, statSync as statSync3 } from "fs";
import { join as join16 } from "path";

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
  const phasesPath = join16(basePath, ".planning", "phases");
  if (!existsSync16(phasesPath)) {
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
    const phaseDir = join16(phasesPath, entry.name);
    for (const file of readdirSync2(phaseDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isFile()) continue;
      const path = join16(phaseDir, file.name);
      if (!statSync3(path).isFile()) continue;
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
  const requestedPhase = options.phase?.padStart(2, "0");
  const phases = requestedPhase ? scan.phases.filter((phase) => phase.phase === requestedPhase) : scan.phases;
  const snapshot = {
    phasesPath: scan.phasesPath,
    phases,
    totals: options.phase ? totalsFor(phases) : scan.totals
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
function totalsFor(phases) {
  return {
    plans: phases.reduce((total, phase) => total + phase.plans.length, 0),
    summaries: phases.reduce((total, phase) => total + phase.summaries.length, 0),
    verifications: phases.reduce((total, phase) => total + phase.verifications.length, 0),
    reviews: phases.reduce((total, phase) => total + phase.reviews.length, 0),
    contexts: phases.reduce((total, phase) => total + phase.contexts.length, 0),
    noncanonical: phases.reduce((total, phase) => total + phase.noncanonical.length, 0)
  };
}
function readOptionalRoadmapState(basePath) {
  return existsSync17(join17(basePath, ".planning", "ROADMAP.md")) ? readRoadmapState(basePath) : void 0;
}
function readOptionalStateDigest(basePath) {
  return existsSync17(join17(basePath, ".planning", "STATE.md")) ? readStateDigest(basePath) : void 0;
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
    phase: unit2.phase,
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
  const recoveryDecision = classifyFailure({
    kind: "reconciliation",
    reasonCode: error.reasonCode,
    blockers: error.blockers,
    written: error.report.written,
    evidence: error.evidence
  });
  return {
    ok: false,
    gate: "reconcileBeforeDispatch",
    reason: recoveryDecision.class,
    retryable: recoveryDecision.action === "retry",
    resumeHint: recoveryDecision.remediation,
    evidence: boundedGateEvidence(error, basePath),
    recoveryDecision,
    exitReason: recoveryDecision.class
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
  const rel = relative5(basePath, path);
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
    ["prepareUnitRoot", overrides.prepareUnitRoot ?? prepareUnitRoot2],
    ["persistRuntimeState", overrides.persistRuntimeState ?? persistRuntimeState]
  ];
  const journalEvents = [];
  const releaseEvidence = [];
  for (const [, gate] of orderedGates) {
    const result = gate(snapshot, unit2);
    if (result.ok) releaseEvidence.push(...result.evidence.filter((item) => item.startsWith("branch:")));
    if (result.journalEvents?.length) journalEvents.push(...result.journalEvents);
    if (!result.ok) return { ...result, journalEvents: result.journalEvents?.length ? result.journalEvents : journalEvents };
  }
  return { ok: true, gate: "persistRuntimeState", evidence: [...orderedGates.map(([name]) => name), ...releaseEvidence], journalEvents: journalEvents.length ? journalEvents : void 0 };
}
function runPostDispatchGate(snapshot, unit2, options = {}) {
  const exists = options.exists ?? existsSync18;
  const cwd = options.cwd ?? process.cwd();
  const phaseDir = join18(cwd, ".planning", "phases");
  if (unit2.type === "verify") {
    if (options.verifierSkip || !snapshot.settings.workflow.verifier) return pass("artifact", "verifier skipped by settings");
  }
  if (unit2.type === "closeout") {
    if (!closeoutEvidence(cwd, unit2.phase, options.written)) {
      return fail3("Closeout Unit requires ROADMAP and STATE evidence for the phase.", [`missing-closeout-evidence:${unit2.phase}`]);
    }
    if (snapshot.settings.workflow.verifier && !phaseVerificationPassed(cwd, phaseDir, unit2.phase, exists)) {
      return fail3("Closeout requires latest VERIFICATION.md with status: passed.", [`verification-not-passed:${unit2.phase}`]);
    }
    return pass("artifact", "closeout roadmap/state evidence exists");
  }
  const policy = resolvePostDispatchPolicy(unit2.type, cwd);
  if (policy) {
    const suffixes = unique2([
      ...policy.artifactSuffix ? [policy.artifactSuffix] : [],
      ...policy.artifactSuffixes ?? [],
      ...policy.requiredArtifacts ?? []
    ]);
    const artifactPaths = suffixes.map((suffix) => [suffix, findMatchingArtifact(cwd, phaseDir, unit2.phase, suffix, exists, options.written)]);
    const requiredSuffixes = policy.requiredArtifacts ?? (policy.artifactSuffix ? [policy.artifactSuffix] : []);
    const missingRequired = requiredSuffixes.filter((suffix) => !artifactPaths.some(([candidateSuffix, path]) => candidateSuffix === suffix && path));
    if (missingRequired.length > 0) {
      const evidence = missingRequired.map((suffix) => `missing:${unit2.phase}-*-${suffix}`);
      const resumeHint = policy.requiredArtifacts ? `${unit2.label} Unit did not produce required verification artifacts.` : `${unit2.label} Unit did not produce a *-${missingRequired[0]} artifact.`;
      return fail3(resumeHint, evidence);
    }
    const outcome = evaluatePostDispatchPolicy(policy, {
      artifactPaths: artifactPaths.map(([, path]) => path).filter((path) => Boolean(path)),
      messages: options.messages,
      outcome: options.outcome,
      phase: unit2.phase,
      unitType: unit2.type
    });
    return outcome.ok ? { ok: true, gate: "artifact", evidence: outcome.evidence.length ? outcome.evidence : [`${unit2.type} outcome accepted`] } : fail3(outcome.resumeHint, outcome.evidence);
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
function validateToolContract(snapshot, unit2) {
  const cwd = snapshot.cwd ?? process.cwd();
  let contractSnapshot = readSnapshot(cwd);
  if (!contractSnapshot) {
    try {
      contractSnapshot = compileToolContracts({ cwd });
    } catch (error) {
      return toolContractGateFailure(unit2, {
        unitId: unit2.id,
        unitType: unit2.type,
        failedField: "snapshot",
        expected: "generated/tool-contracts.json or upstream package",
        actual: error instanceof Error ? error.message : String(error),
        sourcePaths: ["generated/tool-contracts.json"]
      });
    }
  }
  if (contractSnapshot.contracts.length === 0) {
    return pass("validateToolContract", `contract:empty-snapshot:${unit2.type}`);
  }
  if (!contractSnapshot.contracts.some((entry) => entry.unitType === unit2.type)) {
    return toolContractGateFailure(unit2, {
      unitId: unit2.id,
      unitType: unit2.type,
      failedField: "unitType",
      expected: "known unit type",
      actual: String(unit2.type),
      sourcePaths: ["generated/tool-contracts.json"]
    });
  }
  const cheap = validateUnitToolContract(unit2, { snapshot: contractSnapshot });
  if (!cheap.ok) {
    return toolContractGateFailure(unit2, cheap.failure);
  }
  const disk = validateUnitToolContractAgainstDisk({ cwd, snapshot: contractSnapshot, unit: unit2 });
  if (!disk.ok) {
    return toolContractGateFailure(unit2, disk.failure);
  }
  return pass("validateToolContract", `contract:${unit2.type}:${disk.contract.promptHash.slice(0, 12)}`);
}
function toolContractGateFailure(unit2, failure) {
  const recoveryDecision = classifyFailure({
    kind: "dispatch",
    reason: "dispatch-contract-invalid",
    evidence: {
      reasonCode: "dispatch-contract-invalid",
      unitId: unit2.id,
      unitType: unit2.type,
      contractHash: failure.contractHash,
      contractVersion: failure.contractVersion,
      failedField: failure.failedField,
      expected: failure.expected,
      actual: failure.actual,
      sourcePaths: failure.sourcePaths
    }
  });
  return {
    ok: false,
    gate: "validateToolContract",
    reason: recoveryDecision.class,
    retryable: false,
    resumeHint: recoveryDecision.remediation,
    evidence: [
      `failedField:${failure.failedField}`,
      `unitId:${unit2.id}`,
      failure.contractHash ? `contractHash:${failure.contractHash}` : void 0,
      ...(failure.sourcePaths ?? []).map((path) => `path:${path}`)
    ].filter((item) => Boolean(item)),
    recoveryDecision,
    exitReason: recoveryDecision.class
  };
}
function prepareUnitRoot2(snapshot, unit2) {
  const result = prepareUnitRoot({
    unitType: unit2.type,
    unitId: unit2.id,
    phase: unit2.phase,
    projectRoot: snapshot.cwd,
    unitRoot: snapshot.cwd,
    expectedBranch: typeof unit2.metadata?.expectedBranch === "string" ? unit2.metadata.expectedBranch : void 0,
    workflow: { worktrees: snapshot.settings.workflow.worktrees },
    attempt: snapshot.attempt
  });
  if (result.ok) {
    return {
      ok: true,
      gate: "prepareUnitRoot",
      evidence: ["worktree-safety", `root:${result.root}`, result.evidence.branch ? `branch:${result.evidence.branch}` : void 0, ...result.evidence.messages ?? []].filter((item) => Boolean(item)),
      journalEvents: result.evidence.journalEvents
    };
  }
  return {
    ok: false,
    gate: "prepareUnitRoot",
    reason: result.decision.class,
    retryable: result.decision.action === "retry",
    resumeHint: result.decision.remediation,
    evidence: evidenceFromDecision(result.decision),
    recoveryDecision: result.decision,
    exitReason: result.decision.class,
    journalEvents: Array.isArray(result.decision.evidence?.journalEvents) ? result.decision.evidence.journalEvents : void 0
  };
}
function persistRuntimeState(_snapshot, unit2) {
  return pass("persistRuntimeState", `persist-ready:${unit2.id}`);
}
function evidenceFromDecision(decision2) {
  const evidence = decision2.evidence ?? {};
  return [
    `class:${decision2.class}`,
    `action:${decision2.action}`,
    evidence.reasonCode ? `reasonCode:${String(evidence.reasonCode)}` : void 0,
    evidence.unitId ? `unitId:${evidence.unitId}` : void 0,
    evidence.root ? `root:${evidence.root}` : void 0,
    evidence.branch ? `branch:${evidence.branch}` : void 0
  ].filter((item) => Boolean(item));
}
function pass(gate, evidence) {
  return { ok: true, gate, evidence: [evidence] };
}
function fail3(resumeHint, evidence) {
  const recoveryDecision = classifyFailure({
    kind: "artifact-gate",
    reason: resumeHint,
    evidence: { messages: evidence }
  });
  return {
    ok: false,
    gate: "artifact",
    reason: recoveryDecision.class,
    retryable: false,
    resumeHint,
    evidence,
    recoveryDecision,
    exitReason: recoveryDecision.class
  };
}
function findMatchingArtifact(cwd, phaseRoot, phase, suffix, exists, written, requireWritten = true) {
  if (requireWritten && !written?.length) return void 0;
  const writtenSet = written?.length ? new Set(written.map((path) => normalizeWrittenPath(cwd, path))) : void 0;
  const artifactPattern = new RegExp(`^${escapeRegExp2(phase)}(?:-\\d+)?-${escapeRegExp2(suffix)}$`);
  try {
    const candidates = [
      ...readdirSync3(phaseRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join18(phaseRoot, entry.name)),
      ...readdirSync3(phaseRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`)).flatMap((entry) => readdirSync3(join18(phaseRoot, entry.name), { withFileTypes: true }).filter((child) => child.isFile()).map((child) => join18(phaseRoot, entry.name, child.name)))
    ];
    return candidates.find((path) => artifactPattern.test(basename3(path)) && (!writtenSet || writtenSet.has(resolve5(path))) && exists(path));
  } catch {
    return void 0;
  }
}
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeWrittenPath(cwd, value) {
  return resolve5(isAbsolute4(value) ? value : resolve5(cwd, value));
}
function unique2(values) {
  return [...new Set(values)];
}
function closeoutEvidence(cwd, phase, written) {
  if (!written?.length) return false;
  const writtenSet = new Set(written.map((path) => normalizeWrittenPath(cwd, path)));
  const roadmapPath = resolve5(cwd, ".planning", "ROADMAP.md");
  const statePath = resolve5(cwd, ".planning", "STATE.md");
  if (!writtenSet.has(roadmapPath) || !writtenSet.has(statePath)) return false;
  try {
    const roadmap = readFileSync17(roadmapPath, "utf8");
    const state = readFileSync17(statePath, "utf8");
    statSync4(join18(cwd, ".planning", "phases"));
    return roadmapPhaseComplete(roadmap, phase) && statePhaseComplete(state, phase);
  } catch {
    return false;
  }
}
function phaseVerificationPassed(cwd, phaseRoot, phase, exists) {
  const verificationPath = findMatchingArtifact(cwd, phaseRoot, phase, "VERIFICATION.md", exists, void 0, false);
  if (!verificationPath) return false;
  const content = readFileSync17(verificationPath, "utf8");
  const status = /^status:\s*(\S+)/m.exec(content)?.[1]?.trim().toLowerCase();
  return status === "passed" || status === "pass";
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
var PLAN_CHECK_REVISION_CAP = 3;
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
    const releaseGate2 = releaseLeaseAfterUnit(snapshot, unit2, preGate, options.worktreeSafetyDeps);
    if (!releaseGate2.ok) {
      const releaseFailure = handleGateFailure(snapshot, unit2, releaseGate2, options.now);
      return { ...releaseFailure, dispatched: unit2, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit2, options.now), ...releaseFailure.events ?? []].filter((event) => Boolean(event)) };
    }
    const paused = pause(snapshot, unit2, "dispatch-failed", dispatchResult.messages[0] ?? "Dispatch failed; inspect adapter output.", options.now, dispatchResult.messages);
    return { ok: false, messages: dispatchResult.messages, snapshot: paused, status: getSnapshotStatus(paused), dispatched: unit2, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit2, options.now), ...leaseEvents(releaseGate2, snapshot, unit2, options.now), paused.lastEvent].filter((event) => Boolean(event)) };
  }
  const postGate = options.postDispatchGate ? options.postDispatchGate(snapshot, unit2) : runPostDispatchGate(snapshot, unit2, { cwd: snapshot.cwd, written: dispatchResult.written, messages: dispatchResult.messages, outcome: dispatchResult.outcome });
  if (!postGate.ok) {
    const revision = handlePlanCheckIssues(snapshot, unit2, postGate, unitStarted, preGate, options.now);
    if (revision) return revision;
    const releaseGate2 = releaseLeaseAfterUnit(snapshot, unit2, preGate, options.worktreeSafetyDeps);
    const failure = handleGateFailure(snapshot, unit2, postGate, options.now);
    if (!releaseGate2.ok) {
      const releaseFailure = handleGateFailure(snapshot, unit2, releaseGate2, options.now);
      return { ...releaseFailure, dispatched: unit2, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit2, options.now), ...failure.events ?? [], ...releaseFailure.events ?? []].filter((event) => Boolean(event)) };
    }
    return { ...failure, events: [unitStarted, ...leaseEvents(preGate, snapshot, unit2, options.now), ...failure.events ?? [], ...leaseEvents(releaseGate2, snapshot, unit2, options.now)] };
  }
  const releaseGate = releaseLeaseAfterUnit(snapshot, unit2, preGate, options.worktreeSafetyDeps);
  if (!releaseGate.ok) {
    const releaseFailure = handleGateFailure(snapshot, unit2, releaseGate, options.now);
    const gatePassed2 = [...evidenceOf(preGate), ...evidenceOf(postGate)].map((evidence) => ({
      type: "gate_passed",
      ts: timestamp(options.now),
      phase: snapshot.phase,
      unitId: unit2.id,
      status: "completed",
      attempt: snapshot.attempt,
      evidence: [evidence]
    }));
    return { ...releaseFailure, dispatched: unit2, events: [unitStarted, ...gatePassed2, ...leaseEvents(preGate, snapshot, unit2, options.now), ...leaseEvents(postGate, snapshot, unit2, options.now), ...releaseFailure.events ?? []].filter((event) => Boolean(event)) };
  }
  const [nextUnit, ...remainingUnits] = snapshot.remainingUnits;
  const status = nextUnit ? "running" : "completed";
  const advanced = withEvent({
    ...snapshot,
    status,
    currentUnit: nextUnit ? { ...nextUnit, status: "running" } : void 0,
    remainingUnits,
    attempt: 0,
    loopState: unit2.type === "plan-check" ? void 0 : snapshot.loopState,
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
  return { ok: true, messages: dispatchResult.messages, snapshot: completed ? withEvent(advanced, completed) : advanced, status: getSnapshotStatus(completed ? withEvent(advanced, completed) : advanced), dispatched: unit2, events: [unitStarted, ...gatePassed, ...leaseEvents(preGate, snapshot, unit2, options.now), ...leaseEvents(postGate, snapshot, unit2, options.now), ...leaseEvents(releaseGate, snapshot, unit2, options.now), advanced.lastEvent, completed].filter((event) => Boolean(event)) };
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
function handlePlanCheckIssues(snapshot, unit2, gate, unitStarted, preGate, now) {
  if (unit2.type !== "plan-check" || !hasPlanCheckIssues(gate)) return void 0;
  const currentIteration = snapshot.loopState?.planCheckIterations ?? 1;
  if (currentIteration >= PLAN_CHECK_REVISION_CAP) {
    const resumeHint = "Plan checker reached maximum iterations. Provide guidance and retry, force proceed, or abandon.";
    const paused = pause(snapshot, unit2, "plan-check-iteration-cap", resumeHint, now, gate.evidence, gate.recoveryDecision);
    const gateFailed = {
      type: "gate_failed",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit2.id,
      status: "failed",
      attempt: snapshot.attempt,
      reason: "plan-check-iteration-cap",
      resumeHint,
      evidence: gate.evidence,
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision?.class,
      action: gate.recoveryDecision?.action
    };
    return {
      ok: false,
      messages: [resumeHint],
      snapshot: paused,
      status: getSnapshotStatus(paused),
      dispatched: unit2,
      events: [unitStarted, gateFailed, paused.lastEvent, ...leaseEvents(preGate, snapshot, unit2, now)].filter((event) => Boolean(event))
    };
  }
  const revisionNumber = currentIteration;
  const revisionUnit = {
    id: `${snapshot.phase}:plan:revision-${revisionNumber}`,
    type: "plan",
    status: "running",
    phase: snapshot.phase,
    label: "Plan Revision",
    required: true,
    source: unit2.source,
    metadata: { args: "--auto --revision", revision: revisionNumber }
  };
  const recheckUnit = { ...unit2, status: "pending" };
  const scheduled = withEvent({
    ...snapshot,
    status: "running",
    currentUnit: revisionUnit,
    remainingUnits: [recheckUnit, ...snapshot.remainingUnits],
    attempt: 0,
    loopState: {
      ...snapshot.loopState,
      planCheckIterations: currentIteration + 1
    },
    resumeHint: void 0
  }, {
    type: "retry_scheduled",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: revisionUnit.id,
    status: "running",
    attempt: 0,
    reason: "plan-check-issues-found",
    resumeHint: `Plan checker found issues; scheduled revision ${revisionNumber}/${PLAN_CHECK_REVISION_CAP}.`,
    evidence: gate.evidence
  });
  return {
    ok: true,
    messages: [`plan revision scheduled: ${revisionNumber}`],
    snapshot: scheduled,
    status: getSnapshotStatus(scheduled),
    dispatched: unit2,
    events: [unitStarted, scheduled.lastEvent, ...leaseEvents(preGate, snapshot, unit2, now)].filter((event) => Boolean(event))
  };
}
function hasPlanCheckIssues(gate) {
  return (gate.evidence ?? []).some((item) => {
    const normalized = item.toLowerCase();
    return normalized === "marker:issues_found" || normalized === "status:issues_found" || normalized === "field:status:issues_found";
  });
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
      evidence: gate.evidence,
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision?.class,
      action: gate.recoveryDecision?.action
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
      evidence: gate.evidence,
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision?.class,
      action: gate.recoveryDecision?.action
    };
    return { ok: true, messages: [`retry scheduled: ${gate.reason}`], snapshot: retrying, status: getSnapshotStatus(retrying), events: [gateFailed2, retrying.lastEvent, ...leaseEvents(gate, snapshot, unit2, now)].filter((event) => Boolean(event)) };
  }
  const reason = gate.retryable ? "retry-budget-exhausted" : gate.reason;
  if (gate.recoveryDecision?.action === "stop") {
    const stopped = stopFromGate(snapshot, unit2, String(reason), gate.resumeHint, now, gate.evidence, gate.recoveryDecision);
    const gateFailed2 = {
      type: "gate_failed",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit2.id,
      status: "failed",
      attempt: snapshot.attempt,
      reason,
      resumeHint: gate.resumeHint,
      evidence: gate.evidence,
      recoveryDecision: gate.recoveryDecision,
      exitReason: gate.recoveryDecision.class,
      action: gate.recoveryDecision.action
    };
    return { ok: false, messages: [gate.resumeHint], snapshot: stopped, status: getSnapshotStatus(stopped), events: [gateFailed2, stopped.lastEvent, ...leaseEvents(gate, snapshot, unit2, now)].filter((event) => Boolean(event)) };
  }
  const paused = pause(snapshot, unit2, String(reason), gate.resumeHint, now, gate.evidence, gate.recoveryDecision);
  const gateFailed = {
    type: "gate_failed",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "failed",
    attempt: snapshot.attempt,
    reason,
    resumeHint: gate.resumeHint,
    evidence: gate.evidence,
    recoveryDecision: gate.recoveryDecision,
    exitReason: gate.recoveryDecision?.class,
    action: gate.recoveryDecision?.action
  };
  return { ok: false, messages: [gate.resumeHint], snapshot: paused, status: getSnapshotStatus(paused), events: [gateFailed, paused.lastEvent, ...leaseEvents(gate, snapshot, unit2, now)].filter((event) => Boolean(event)) };
}
function pause(snapshot, unit2, reason, resumeHint, now, evidence, recoveryDecision) {
  return withEvent({ ...snapshot, status: "paused", resumeHint }, {
    type: "pause",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "paused",
    attempt: snapshot.attempt,
    reason,
    resumeHint,
    evidence,
    recoveryDecision,
    exitReason: recoveryDecision?.class,
    action: recoveryDecision?.action
  });
}
function stopFromGate(snapshot, unit2, reason, resumeHint, now, evidence, recoveryDecision) {
  return withEvent({ ...snapshot, status: "stopped", resumeHint }, {
    type: "stop",
    ts: timestamp(now),
    phase: snapshot.phase,
    unitId: unit2.id,
    status: "stopped",
    attempt: snapshot.attempt,
    reason,
    resumeHint,
    evidence,
    recoveryDecision,
    exitReason: recoveryDecision?.class,
    action: recoveryDecision?.action
  });
}
function releaseLeaseAfterUnit(snapshot, unit2, ownershipGate, worktreeSafetyDeps) {
  if (!isSourceWritingUnit(unit2.type) || snapshot.settings.workflow.worktrees === false || !snapshot.cwd) {
    return { ok: true, gate: "prepareUnitRoot", evidence: [] };
  }
  const acquired = ownershipGate.journalEvents?.find((event) => event.type === "lease_acquired" || event.type === "lease_stale_reclaimed");
  const branch = acquired?.branch ?? branchFromGateEvidence(ownershipGate) ?? (typeof unit2.metadata?.expectedBranch === "string" ? unit2.metadata.expectedBranch : void 0);
  const result = releaseLeaseOwnership({
    unitType: unit2.type,
    unitId: unit2.id,
    phase: unit2.phase,
    projectRoot: snapshot.cwd,
    unitRoot: snapshot.cwd,
    expectedBranch: branch,
    workflow: { worktrees: snapshot.settings.workflow.worktrees },
    attempt: snapshot.attempt,
    deps: worktreeSafetyDeps
  }, snapshot.cwd, branch);
  if (result.ok) {
    return { ok: true, gate: "prepareUnitRoot", evidence: ["lease released"], journalEvents: result.journalEvents };
  }
  return {
    ok: false,
    gate: "prepareUnitRoot",
    reason: result.decision.class,
    retryable: false,
    resumeHint: result.decision.remediation,
    evidence: evidenceFromRecoveryDecision(result.decision),
    recoveryDecision: result.decision,
    exitReason: result.decision.class
  };
}
function branchFromGateEvidence(gate) {
  return gate.evidence?.find((item) => item.startsWith("branch:"))?.slice("branch:".length);
}
function evidenceFromRecoveryDecision(decision2) {
  const evidence = decision2.evidence ?? {};
  return [
    `class:${decision2.class}`,
    `action:${decision2.action}`,
    evidence.reasonCode ? `reasonCode:${String(evidence.reasonCode)}` : void 0,
    evidence.unitId ? `unitId:${evidence.unitId}` : void 0,
    evidence.root ? `root:${evidence.root}` : void 0,
    evidence.branch ? `branch:${evidence.branch}` : void 0,
    ...Array.isArray(evidence.messages) ? evidence.messages : []
  ].filter((item) => Boolean(item));
}
function leaseEvents(gate, snapshot, unit2, now) {
  return (gate.journalEvents ?? []).map((event) => ({
    type: event.type,
    ts: event.ts ?? timestamp(now),
    phase: event.phase ?? snapshot.phase,
    unitId: event.unitId ?? unit2.id,
    status: "running",
    attempt: event.attempt ?? snapshot.attempt,
    reason: event.reasonCode,
    action: event.action,
    recoveryClass: event.recoveryClass,
    root: event.root,
    branch: event.branch,
    paths: event.paths,
    written: event.written,
    message: event.message
  }));
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
        extraArgs: sessionContext.extraArgs,
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
      const result = advanceOrchestration(snapshot, { dispatch: deps.dispatch, gates: deps.gates, now: deps.clock, worktreeSafetyDeps: deps.worktreeSafetyDeps });
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
import { existsSync as existsSync19, mkdirSync as mkdirSync5, readFileSync as readFileSync18, writeFileSync as writeFileSync6 } from "fs";
import { dirname as dirname5, isAbsolute as isAbsolute5, resolve as resolve6, relative as relative6 } from "path";
var DEFAULT_JOURNAL_PATH = ".planning/orchestration-state.json";
var allowedEventKeys = /* @__PURE__ */ new Set(["type", "event", "ts", "phase", "unitId", "status", "attempt", "reason", "resumeHint", "evidence", "recoveryDecision", "exitReason", "action", "recoveryClass", "reasonCode", "root", "branch", "paths", "written", "message", "host", "pid"]);
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
  if (!existsSync19(resolved.path)) {
    return { ok: true, messages: ["orchestration journal not found"] };
  }
  try {
    const parsed = JSON.parse(readFileSync18(resolved.path, "utf8"));
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
    if (key === "recoveryDecision") {
      const recoveryDecision = sanitizeRecoveryDecision(value);
      if (recoveryDecision) redacted.recoveryDecision = recoveryDecision;
      continue;
    }
    if (key === "paths" || key === "written") {
      const values = Array.isArray(value) ? value : [];
      redacted[key] = values.filter((item) => typeof item === "string").slice(0, maxEvidenceItems2).map(safeString);
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
function sanitizeRecoveryDecision(value) {
  if (!value || typeof value !== "object") return void 0;
  const input = value;
  const output = {};
  for (const key of ["class", "action", "reasonCode", "message", "remediation"]) {
    const item = input[key];
    if (typeof item === "string") output[key] = safeString(item);
  }
  const evidence = input.evidence;
  if (evidence && typeof evidence === "object") {
    const source = evidence;
    const safeEvidence = {};
    for (const key of ["reasonCode", "unitId", "unitType", "phase", "branch", "expectedBranch", "root", "expectedProjectRoot", "actualCwd", "resolvedUnitRoot"]) {
      const item = source[key];
      if (typeof item === "string") safeEvidence[key] = safeString(item);
    }
    for (const key of ["paths", "messages"]) {
      const item = source[key];
      if (Array.isArray(item)) safeEvidence[key] = item.filter((entry) => typeof entry === "string").slice(0, maxEvidenceItems2).map(safeString);
    }
    const written = source.written;
    if (Array.isArray(written)) safeEvidence.written = written.slice(0, maxEvidenceItems2).map(sanitizeWrittenEvidence).filter((entry) => Boolean(entry));
    output.evidence = safeEvidence;
  }
  return output;
}
function sanitizeWrittenEvidence(value) {
  if (!value || typeof value !== "object") return void 0;
  const input = value;
  const output = {};
  for (const key of ["path", "action", "reasonCode", "kind"]) {
    const item = input[key];
    if (typeof item === "string") output[key] = safeString(item);
  }
  return Object.keys(output).length ? output : void 0;
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
    mkdirSync5(dirname5(path), { recursive: true });
    writeFileSync6(path, `${JSON.stringify(journal, null, 2)}
`, "utf8");
    return { ok: true, messages: ["orchestration journal written"], written: [path], snapshot: journal.snapshot, status: journal.snapshot ? void 0 : void 0 };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal write failed: ${error instanceof Error ? error.message : String(error)}`], written: [] };
  }
}
function resolveJournalPath(options) {
  const cwd = resolve6(options.cwd);
  const planningDir = resolve6(cwd, ".planning");
  const candidate = resolve6(cwd, options.journalPath ?? DEFAULT_JOURNAL_PATH);
  if (!isInsideOrSame2(planningDir, candidate)) {
    return { ok: false, messages: [`refusing orchestration journal path outside .planning: ${candidate}`] };
  }
  return { ok: true, path: candidate };
}
function isInsideOrSame2(parent, child) {
  const rel = relative6(parent, child);
  return rel === "" || !rel.startsWith("..") && !isAbsolute5(rel);
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
  return secretPattern.test(value) ? "[REDACTED]" : truncate2(value);
}
function truncate2(value) {
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
var PHASE_ID_PATTERN = /^\d+(?:\.\d+)*$/;
function isValidPhaseId(phase, options = {}) {
  const pattern = phasePattern(options.cwd);
  return pattern.test(phase);
}
function phasePattern(cwd) {
  if (!cwd) return PHASE_ID_PATTERN;
  const lexicalPattern = readOrchestrationContractSnapshot(cwd)?.phaseIdPolicy.lexicalPattern;
  if (!lexicalPattern) return PHASE_ID_PATTERN;
  try {
    return new RegExp(lexicalPattern);
  } catch {
    return PHASE_ID_PATTERN;
  }
}

// src/orchestrator/trigger.ts
function detectNativeAutoTrigger(input) {
  const match = input.trim().match(/^\/(gsd-(?:discuss-phase|plan-phase|execute-phase|verify-work|ship))\s+(\S+)([\s\S]*)$/);
  if (!match) return void 0;
  const [, command, phase, rest] = match;
  if (phase.startsWith("--")) return void 0;
  if (/\s--chain(?:\s|$)/.test(rest)) return trigger(command, phase, "chain", rest);
  if (/\s--auto(?:\s|$)/.test(rest)) return trigger(command, phase, "auto", rest);
  return void 0;
}
var commandStart = {
  "gsd-discuss-phase": "discuss",
  "gsd-plan-phase": "plan",
  "gsd-execute-phase": "execute",
  "gsd-verify-work": "verify",
  "gsd-ship": "closeout"
};
function createNativeAutoHandoff(options) {
  return (input) => {
    const trigger2 = detectNativeAutoTrigger(input);
    if (!trigger2) return void 0;
    if (!isValidPhaseId(trigger2.phase, { cwd: options.cwd })) {
      return { ok: false, messages: ["Invalid phase; expected integer or decimal phase id such as 9 or 2.1"], status: { status: "idle", remainingUnits: [], attempt: 0 } };
    }
    const orchestrator = options.createOrchestrator();
    let result = orchestrator.start({ phase: trigger2.phase, mode: trigger2.mode, cwd: options.cwd, startAt: commandStart[trigger2.command], extraArgs: trigger2.extraArgs });
    let guard = 0;
    while (result.ok && result.status?.status === "running" && guard < 100) {
      result = orchestrator.advance();
      guard += 1;
    }
    return result;
  };
}
function trigger(command, phase, mode, rest) {
  const extraArgs = rest.replace(/(^|\s)--(?:chain|auto)(?=\s|$)/g, " ").trim().replace(/\s+/g, " ");
  return {
    command,
    phase,
    mode,
    ...extraArgs ? { extraArgs } : {}
  };
}

// src/settings-bridge/cache.ts
import { createHash as createHash5 } from "crypto";

// src/settings-bridge/format.ts
function formatSettingsContext(resolved, options) {
  const lines = [];
  lines.push("## GSD Settings");
  if (resolved.parseError) {
    lines.push("");
    lines.push(`\u26A0\uFE0F parse error: ${resolved.parseError}`);
    lines.push("Settings context disabled. Run `/gsd-settings` to repair, or fix the JSON manually before GSD dispatch.");
    return lines.join("\n");
  }
  if (!resolved.source.path) {
    lines.push("");
    lines.push("No GSD settings found. Default workflow toggles apply.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push(`- source: ${resolved.source.path} (${resolved.source.kind})`);
  if (resolved.source.hash) {
    lines.push(`- hash: ${resolved.source.hash.slice(0, 16)}`);
  }
  if (typeof resolved.source.mtimeMs === "number") {
    lines.push(`- mtime: ${new Date(resolved.source.mtimeMs).toISOString()}`);
  }
  if (options.packageName && options.packageVersion) {
    lines.push(`- package: ${options.packageName}@${options.packageVersion}`);
  }
  if (resolved.model.profile) {
    lines.push("");
    lines.push(`### Model routing`);
    lines.push(`- profile: ${resolved.model.profile}`);
    if (Object.keys(resolved.model.overrides).length > 0) {
      const overrideCount = Object.keys(resolved.model.overrides).length;
      lines.push(`- overrides: ${overrideCount} agent mapping${overrideCount === 1 ? "" : "s"}`);
    } else {
      lines.push("- overrides: (none)");
    }
  } else {
    lines.push("");
    lines.push("### Model routing");
    lines.push("- profile: inherit (uses Pi session model)");
  }
  if (Object.keys(resolved.workflow).length > 0) {
    lines.push("");
    lines.push("### Workflow toggles");
    for (const key of Object.keys(resolved.workflow).sort()) {
      const value = resolved.workflow[key];
      lines.push(`- ${key}: ${formatScalar2(key, value)}`);
    }
  }
  return lines.join("\n");
}
function formatScalar2(key, value) {
  if (value === null) return "null";
  if (typeof value === "string") return redactScalar(key, value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "[redacted non-scalar]";
}
function redactScalar(key, value) {
  if (/token|secret|password|apikey|api_key|credential|command|script/i.test(key)) return "[redacted]";
  if (/token|secret|password|apikey|api_key|credential|bearer\s+[a-z0-9._-]+|sk-[a-z0-9._-]+/i.test(value)) return "[redacted]";
  return value;
}

// src/settings-bridge/cache.ts
var SettingsBridgeCache = class {
  constructor(options) {
    this.options = options;
    this.resolveOptions = {
      cwd: options.cwd,
      ...options.configPath ? { configPath: options.configPath } : {},
      projectRoot: options.cwd
    };
  }
  options;
  resolved;
  lastNotifiedHash;
  notifications = [];
  resolveOptions;
  refresh() {
    const source = resolveGsdConfigSource(this.resolveOptions);
    const next = toResolvedSettings(source);
    const previous = this.resolved;
    if (source.hash && source.hash !== this.lastNotifiedHash) {
      const previousHash = previous?.source.hash;
      const isNewHash = previousHash !== source.hash;
      if (isNewHash) {
        if (next.parseError) {
          this.notifications.push({
            kind: "warning",
            message: `pi-gsd: settings parse failed for ${source.path ?? "default"}. ${next.parseError}. Run \`/gsd-settings\` to repair, or fix the JSON manually.`,
            observedHash: source.hash
          });
        } else if (previous) {
          this.notifications.push({
            kind: "info",
            message: `pi-gsd: settings updated (${describeChange(previous.source, source)}). hash=${source.hash.slice(0, 12)}`,
            observedHash: source.hash
          });
        }
        this.lastNotifiedHash = source.hash;
      }
    }
    this.resolved = next;
    return next;
  }
  current() {
    if (!this.resolved) return this.refresh();
    return this.resolved;
  }
  isParseError() {
    return Boolean(this.resolved?.parseError);
  }
  /**
   * Refresh and throw if parsing failed. Used by the native auto orchestrator
   * to block dispatch when settings are unparseable (D-16).
   */
  ensureGsdSettingsReady() {
    const resolved = this.refresh();
    if (resolved.parseError) {
      const error = new Error(`GSD settings parse failed: ${resolved.parseError}`);
      error.code = "GSD_SETTINGS_PARSE_ERROR";
      throw error;
    }
    return resolved;
  }
  formatContext() {
    const resolved = this.refresh();
    return formatSettingsContext(resolved, {
      packageName: this.options.officialPackageName,
      packageVersion: this.options.officialPackageVersion
    });
  }
  popNotifications() {
    const drained = [...this.notifications];
    this.notifications.length = 0;
    return drained;
  }
  dispose() {
    this.resolved = void 0;
    this.lastNotifiedHash = void 0;
    this.notifications.length = 0;
  }
};
function toResolvedSettings(source) {
  if (!source.path) {
    return {
      source,
      parseError: void 0,
      workflow: {},
      model: { profile: null, overrides: {} }
    };
  }
  if (!source.config) {
    return {
      source,
      parseError: source.parseError ? `Could not parse JSON at ${source.path}: ${source.parseError}` : `Could not parse JSON at ${source.path}`,
      workflow: {},
      model: { profile: null, overrides: {} }
    };
  }
  const workflow = isRecord3(source.config.workflow) ? filterSafeWorkflowSettings(source.config.workflow) : {};
  const overrides = isRecord3(source.config.model_overrides) ? filterStringRecord(source.config.model_overrides) : {};
  return {
    source,
    parseError: void 0,
    workflow,
    model: {
      profile: typeof source.config.model_profile === "string" ? source.config.model_profile : null,
      overrides
    }
  };
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var SAFE_WORKFLOW_KEYS = /* @__PURE__ */ new Set([
  "_auto_chain_active",
  "ai_integration_phase",
  "auto_advance",
  "auto_prune_state",
  "code_review",
  "code_review_depth",
  "code_review_command",
  "discuss_mode",
  "inline_plan_threshold",
  "max_discuss_passes",
  "node_repair",
  "node_repair_budget",
  "nyquist_validation",
  "pattern_mapper",
  "plan_bounce",
  "plan_bounce_passes",
  "plan_check",
  "plan_checker",
  "plan_review_convergence",
  "post_planning_gaps",
  "research",
  "research_before_questions",
  "security_asvs_level",
  "security_block_on",
  "security_enforcement",
  "skip_discuss",
  "subagent_timeout",
  "tdd_mode",
  "text_mode",
  "ui_phase",
  "ui_review",
  "ui_safety_gate",
  "use_worktrees",
  "verifier",
  "worktrees"
]);
function filterSafeWorkflowSettings(source) {
  const filtered = {};
  for (const [key, value] of Object.entries(source)) {
    if (!SAFE_WORKFLOW_KEYS.has(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
      filtered[key] = value;
    }
  }
  return filtered;
}
function filterStringRecord(source) {
  return Object.fromEntries(
    Object.entries(source).filter((entry) => typeof entry[1] === "string")
  );
}
function describeChange(previous, next) {
  if (previous.path !== next.path) {
    return `source=${next.kind}`;
  }
  const changedKeys = [];
  const previousConfig = previous.config ?? {};
  const nextConfig = next.config ?? {};
  const previousWorkflow = isRecord3(previousConfig.workflow) ? previousConfig.workflow : {};
  const nextWorkflow = isRecord3(nextConfig.workflow) ? nextConfig.workflow : {};
  for (const key of /* @__PURE__ */ new Set([...Object.keys(previousWorkflow), ...Object.keys(nextWorkflow)])) {
    if (JSON.stringify(previousWorkflow[key]) !== JSON.stringify(nextWorkflow[key])) {
      changedKeys.push(`workflow.${key}`);
    }
  }
  if (previousConfig.model_profile !== nextConfig.model_profile) {
    changedKeys.push("model_profile");
  }
  return changedKeys.length > 0 ? changedKeys.join(",") : "settings changed";
}

// src/settings-bridge/index.ts
function createSettingsBridge(options) {
  return new SettingsBridgeCache(options);
}

// src/extension.ts
var piGsdPackageRoot = resolve7(dirname6(fileURLToPath(import.meta.url)), "..");
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
  return join20(tmpdir(), `pi-subagents-user-${sanitized}`);
}
function guardPiSubagentsTempDirs(options) {
  try {
    const fsImpl = options?.fs ?? { accessSync, rmSync, mkdirSync: mkdirSync6 };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();
    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join20(tempRoot, subdir);
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
  const packageRootByCwd = /* @__PURE__ */ new Map();
  const officialPackageByCwd = /* @__PURE__ */ new Map();
  const settingsBridgeByCwd = /* @__PURE__ */ new Map();
  function getPackageRoot(startDir) {
    const cached = packageRootByCwd.get(startDir);
    if (cached) return cached;
    try {
      const officialPackage = resolveOfficialPackage({ startDir });
      packageRootByCwd.set(startDir, officialPackage.packageRoot);
      officialPackageByCwd.set(startDir, { packageName: officialPackage.packageName, version: officialPackage.version });
      return officialPackage.packageRoot;
    } catch {
      return null;
    }
  }
  function getSettingsBridge(cwd) {
    const cached = settingsBridgeByCwd.get(cwd);
    if (cached) return cached;
    const officialPackage = officialPackageByCwd.get(cwd);
    const bridge = createSettingsBridge({
      cwd,
      ...officialPackage ? { officialPackageName: officialPackage.packageName, officialPackageVersion: officialPackage.version } : {}
    });
    settingsBridgeByCwd.set(cwd, bridge);
    return bridge;
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
    const bridge = getSettingsBridge(ctx.cwd);
    bridge.refresh();
    for (const notification of bridge.popNotifications()) {
      notify(ctx, notification.message, notification.kind);
    }
  });
  pi.on("context", (event, ctx) => {
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (!pkgRoot) return void 0;
    const messages = event.messages.map((message) => rewriteMessageForRuntime(message, pkgRoot));
    if (!isGsdRelatedContext(event)) {
      return { messages };
    }
    const bridge = getSettingsBridge(ctx.cwd);
    const settingsContext = bridge.formatContext();
    for (const notification of bridge.popNotifications()) {
      notify(ctx, notification.message, notification.kind);
    }
    return { messages: appendSettingsContext(messages, settingsContext) };
  });
  pi.on("message_end", (event, ctx) => {
    if (!isRecord4(event.message) || event.message.role !== "assistant") {
      return void 0;
    }
    const pkgRoot = getPackageRoot(ctx.cwd);
    if (!pkgRoot) return void 0;
    return { message: rewriteMessageForRuntime(event.message, pkgRoot) };
  });
  pi.on("input", (event, ctx) => {
    const text = isRecord4(event) && typeof event.text === "string" ? event.text : void 0;
    if (!text) return { action: "continue" };
    const trigger2 = detectNativeAutoTrigger(text);
    if (!trigger2) return { action: "continue" };
    if (!process.env.PI_GSD_DISPATCH_COMMAND) return { action: "continue" };
    const bridge = getSettingsBridge(ctx.cwd);
    bridge.refresh();
    for (const notification of bridge.popNotifications()) {
      notify(ctx, notification.message, notification.kind);
    }
    if (bridge.isParseError()) {
      return { action: "handled" };
    }
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
function isGsdRelatedContext(event) {
  if (!Array.isArray(event.messages)) return false;
  const gsdPattern = /\/gsd-|gsd-(?:planner|executor|verifier|code-reviewer|security-auditor|nyquist-auditor|ui-auditor|ui-checker|ui-researcher|plan-checker|roadmapper|debugger|debug-session-manager)/i;
  for (const message of event.messages) {
    if (!isRecord4(message)) continue;
    if (typeof message.text === "string" && gsdPattern.test(message.text)) {
      return true;
    }
    if (typeof message.content === "string" && gsdPattern.test(message.content)) {
      return true;
    }
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isRecord4(block) || typeof block.text !== "string") continue;
        if (gsdPattern.test(block.text)) {
          return true;
        }
      }
    }
  }
  return false;
}
function appendSettingsContext(messages, context) {
  if (!context) return messages;
  const settingsBlock = { role: "system", content: context };
  return [settingsBlock, ...messages];
}
function rewriteMessageForRuntime(message, officialRoot) {
  if (!isRecord4(message)) {
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
  if (!isRecord4(block) || block.type !== "text" || typeof block.text !== "string") {
    return block;
  }
  return { ...block, text: rewriteRuntimeMessageText(block.text, officialRoot) };
}
function isRecord4(value) {
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
  splitFrontmatter,
  writeFrontmatter,
  commandFileToPiPromptName,
  normalizeGsdSlashReferences,
  transformGsdRunLauncher,
  addPiSubagentGuidance,
  splitCodeFences,
  transformAskUserQuestionForPi,
  transformSkillDispatchForPi,
  transformWorkflowDispatchForPi,
  transformSubagentDispatchForPi,
  OFFICIAL_PACKAGE_NAME,
  OfficialPackageError,
  resolveOfficialPackage,
  rewriteOfficialClaudePaths,
  rewriteRuntimeMessageText,
  writeOrchestrationContractSnapshot,
  compileOrchestrationContract,
  verifyOrchestrationContractSnapshot,
  createCommandDispatchRunner,
  createDispatchAdapter,
  loadOfficialWorkflowConfig,
  resolveWorkflowSettings,
  readCurrentBranch,
  hasGitMarker,
  defaultWorktreeSafetyDeps,
  RECOVERY_CLASSES,
  RECOVERY_ACTION_VALUES,
  RECOVERY_ACTIONS,
  RECONCILIATION_REASON_TO_RECOVERY_CLASS,
  classifyFailure,
  readLeaseRecord,
  checkLeaseOwnership,
  releaseLeaseOwnership,
  reclaimStaleLeaseIfSafe,
  leaseAcquiredEvent,
  leaseReleasedEvent,
  leaseStaleReclaimedEvent,
  isSourceWritingUnit,
  resolveExpectedUnitRoot,
  prepareUnitRoot,
  writeToolContractSnapshot,
  compileToolContracts,
  verifyToolContractSnapshot,
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
