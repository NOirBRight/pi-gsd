export function commandFileToPiPromptName(fileName: string): string {
  return `gsd-${fileName}`;
}

export function normalizeGsdSlashReferences(input: string): string {
  return input.replace(/(^|[\s([{'"`])\/gsd:([a-z0-9][a-z0-9-]*)/g, "$1/gsd-$2");
}

const gsdToolsRequireResolve = "require.resolve('@opengsd/gsd-core/get-shit-done/bin/gsd-tools.cjs')";

export function transformGsdRunLauncher(input: string): string {
  if (input.includes(gsdToolsRequireResolve)) return input;

  return input.replace(/^.*_GSD_SHIM_NAME="gsd-tools\.cjs".*$/gm, (launcherLine) => {
    const nodeModulesFallback =
      `_GSD_SHIM_NAME="gsd-tools.cjs"; GSD_TOOLS="$(node -e "console.log(${gsdToolsRequireResolve})" 2>/dev/null)"; ` +
      `if [ -n "$GSD_TOOLS" ] && [ -f "$GSD_TOOLS" ]; then gsd_run() { node "$GSD_TOOLS" "$@"; }; ` +
      `else ${launcherLine}; fi`;
    return nodeModulesFallback;
  });
}

const piSubagentGuidance = `<pi_subagents_runtime_note>
Pi runtime: when this workflow calls for spawning GSD subagents, use the Pi \`subagent\` tool from \`pi-subagents\`.
Before delegation, inspect available agents with \`subagent({ action: "list" })\`.
Use exact official GSD agent names such as \`gsd-planner\`, \`gsd-executor\`, and \`gsd-code-reviewer\`.
If the \`subagent\` tool is unavailable, stop and ask the user to install or enable \`pi-subagents\`; do not simulate subagents inline.
</pi_subagents_runtime_note>

`;

export function addPiSubagentGuidance(input: string): string {
  if (input.includes("<pi_subagents_runtime_note>")) return input;
  if (!mentionsSubagentDelegation(input)) return input;
  return `${piSubagentGuidance}${input}`;
}

function mentionsSubagentDelegation(input: string): boolean {
  return splitCandidateSentences(input).some((candidate) => {
    if (mentionsNegatedSubagentDelegation(candidate)) return false;
    return mentionsPositiveSubagentDelegation(candidate) || mentionsGsdSubagentPair(candidate);
  });
}

function splitCandidateSentences(input: string): string[] {
  return input.match(/[^.!?\n]+[.!?]?/g) ?? [];
}

function mentionsNegatedSubagentDelegation(input: string): boolean {
  return /\bwithout\b/i.test(input)
    || /\bno\s+subagents?\b/i.test(input)
    || /\bdo\s+not\s+spawn\b/i.test(input)
    || /\bdon't\s+spawn\b/i.test(input);
}

function mentionsPositiveSubagentDelegation(input: string): boolean {
  return /\b(?:re-?spawn(?:s|ing|ed)?|spawn(?:s|ing|ed)?|delegat(?:e|es|ed|ing)|orchestrat(?:e|es|ed|ing)|dispatch(?:es|ed|ing)?)\b/i.test(input)
    && /\b(?:subagents?|agents?|gsd-[a-z0-9-]+|checkers?|research(?:ers?)?|writers?|planners?|executors?|auditors?|mappers?|synthesizers?|reviewers?|debuggers?)\b/i.test(input);
}

function mentionsGsdSubagentPair(input: string): boolean {
  return /\bgsd-[a-z0-9-]+\b[\s\S]{0,80}\bsubagents?\b/i.test(input)
    || /\bsubagents?\b[\s\S]{0,80}\bgsd-[a-z0-9-]+\b/i.test(input);
}

/**
 * Split text into code-fenced and non-code segments.
 * Triple-backtick fenced regions are preserved as-is.
 *
 * Limitation (WR-01): Only triple-backtick code fences are protected.
 * 4-space indented code blocks are not detected because official GSD
 * workflows consistently use triple backticks. If indented code blocks
 * appear in custom content, wrap them in triple backticks first.
 */
export function splitCodeFences(text: string): { segment: string; isCode: boolean }[] {
  const parts: { segment: string; isCode: boolean }[] = [];
  const regex = /(`{3}[\s\S]*?`{3})/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
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

/**
 * Rewrites AskUserQuestion calls in GSD workflow markdown to Pi-compatible
 * ask_user_question schema.
 *
 * Supported forms:
 * 1. AskUserQuestion("header", "question", ["A", "B"])
 * 2. AskUserQuestion("header", "question", ["A", "B"], multiSelect: true)
 * 3. AskUserQuestion("header", "question", [{ label: "A", description: "desc A" }])
 * 4. AskUserQuestion(header: "...", question: "...", options: [...], multiSelect: true/false)
 * 5. AskUserQuestion([{ header: "...", question: "...", ... }])
 * 6. Multi-line variants of all the above
 *
 * Idempotency: does not transform text already containing ask_user_question.
 * Code-fence safe: does not transform within ```...``` blocks.
 */
export function transformAskUserQuestionForPi(input: string): string {
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

/**
 * Process a single non-code segment, replacing all AskUserQuestion calls.
 */
function rewriteAskUserQuestionInSegment(segment: string): string {
  let result = segment;
  let safety = 100;
  let searchFrom = 0;

  while (safety-- > 0) {
    const match = /AskUserQuestion\s*\(/.exec(result.slice(searchFrom));
    if (!match || match.index === undefined) break;

    const callStart = searchFrom + match.index;
    const argsStart = callStart + match[0].length - 1; // position of '('
    const argsText = extractBalancedParens(result, argsStart);
    if (!argsText) {
      searchFrom = argsStart + 1;
      continue;
    }

    const callEnd = argsStart + argsText.length + 2; // after closing )
    const rewritten = transformAskUserQuestionCall(argsText);

    if (rewritten === null) {
      searchFrom = argsStart + 1;
      continue;
    }
    result = result.slice(0, callStart) + rewritten + result.slice(callEnd);
    searchFrom = callStart + rewritten.length;
  }

  if (safety <= 0) {
    console.warn("[pi-gsd] rewriteAskUserQuestionInSegment: safety limit reached — possible unbalanced AskUserQuestion in input");
  }

  return result;
}

/**
 * Extract content between balanced parentheses starting at the open paren position.
 * Returns the inner content (without the parens), or null if unbalanced.
 */
function extractBalancedParens(text: string, openParenPos: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let i = openParenPos;

  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped char
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

/**
 * Transform an AskUserQuestion call's inner arguments text into ask_user_question schema.
 */
function transformAskUserQuestionCall(argsText: string): string | null {
  const trimmed = argsText.trim();

  // Form 5: Array of question objects — AskUserQuestion([{...}, {...}])
  if (trimmed.startsWith("[")) {
    return transformArrayQuestionForm(trimmed);
  }

  // Form 1-4: positional args or named params
  // Try named params first: AskUserQuestion(header: "...", question: "...", options: [...])
  const namedParsed = parseNamedParams(trimmed);
  if (namedParsed) {
    return formatAskUserQuestion(namedParsed);
  }

  // Try positional args: AskUserQuestion("header", "question", [...], multiSelect: true)
  const positionalParsed = parsePositionalArgs(trimmed);
  if (positionalParsed) {
    return formatAskUserQuestion(positionalParsed);
  }

  return null;
}

interface ParsedQuestion {
  header: string;
  question: string;
  options: ParsedOption[];
  multiSelect?: boolean;
}

interface ParsedOption {
  label: string;
  description: string;
}

/**
 * Escape a string for embedding inside double-quoted JSON-like values.
 * Escapes backslashes first, then double quotes.
 */
function escapeDoubleQuotedString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Unescape a string that was inside double quotes.
 * Reverses escapeDoubleQuotedString: \" → " and \\ → \.
 */
function unescapeDoubleQuotedString(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function formatAskUserQuestion(questions: ParsedQuestion[]): string {
  const formattedQuestions = questions.map((q) => {
    const opts = q.options
      .map((o) => `{ label: "${escapeDoubleQuotedString(o.label)}", description: "${escapeDoubleQuotedString(o.description)}" }`)
      .join(", ");
    const parts = [
      `question: "${escapeDoubleQuotedString(q.question)}"`,
      `header: "${escapeDoubleQuotedString(q.header)}"`,
      `options: [${opts}]`,
    ];
    if (q.multiSelect) {
      parts.push("multiSelect: true");
    }
    return `{ ${parts.join(", ")} }`;
  });

  return `ask_user_question({ questions: [${formattedQuestions.join(", ")}] })`;
}

/**
 * Parse named params: header: "...", question: "...", options: [...], multiSelect: ...
 */
function parseNamedParams(argsText: string): ParsedQuestion[] | null {
  const headerMatch = argsText.match(/header:\s*"((?:[^"]*\\.)*[^"]*)"/);
  const questionMatch = argsText.match(/question:\s*"((?:[^"]*\\.)*[^"]*)"/);
  if (!headerMatch || !questionMatch) return null;

  const header = unescapeDoubleQuotedString(headerMatch[1]);
  const question = unescapeDoubleQuotedString(questionMatch[1]);

  // Handle multi-line question strings (pipe or block)
  const questionBlockMatch = argsText.match(/question:\s*\|\n?([\s\S]*?)\n\s*\|?/);
  const finalQuestion = questionBlockMatch ? questionBlockMatch[1].trim() : question;

  // Extract options
  const options = parseOptionsBlock(argsText);
  if (!options) return null;

  const multiSelectMatch = argsText.match(/multiSelect:\s*(true|false)/);
  const multiSelect = multiSelectMatch ? multiSelectMatch[1] === "true" : undefined;

  return [{ header, question: finalQuestion, options, multiSelect }];
}

/**
 * Parse positional args: "header", "question", [...], multiSelect?: ...
 */
function parsePositionalArgs(argsText: string): ParsedQuestion[] | null {
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

  let multiSelect: boolean | undefined;
  for (let i = 3; i < topTokens.length; i++) {
    const ms = topTokens[i].trim();
    if (ms.startsWith("multiSelect")) {
      const val = ms.match(/multiSelect\s*:\s*(true|false)/);
      if (val) multiSelect = val[1] === "true";
    }
  }

  return [{ header, question, options, multiSelect }];
}

/**
 * Tokenize top-level comma-separated args within an AskUserQuestion call.
 * Respects nesting in brackets and strings.
 */
function tokenizeTopLevel(text: string): string[] {
  const tokens: string[] = [];
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

/**
 * Remove surrounding quotes from a string and unescape internal escapes.
 * For double-quoted strings: unescapes \" → " and \\ → \.
 * For single-quoted strings: strips delimiters only (no escape processing).
 */
function unquote(s: string): string | null {
  const trimmed = s.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (trimmed.startsWith('\\"') && trimmed.endsWith('\\"')) {
    return trimmed.slice(2, -2).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return null;
}

/**
 * Parse an options array string like ["A", "B"] or [{ label: "A", description: "B" }]
 */
function parseOptionsArray(raw: string): ParsedOption[] | null {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return []; // empty options []

  // Try object options first: { label: "...", description: "..." }
  if (inner.includes("{")) {
    return parseObjectOptions(inner);
  }

  // Simple string options: "A", "B"
  const strings: string[] = [];
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

/**
 * Parse object options from inner array content.
 */
function parseObjectOptions(inner: string): ParsedOption[] | null {
  const options: ParsedOption[] = [];
  const objPattern = /\{\s*label:\s*"((?:[^"\\]|\\.)*)"\s*,\s*description:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let match: RegExpExecArray | null;

  while ((match = objPattern.exec(inner)) !== null) {
    options.push({ label: match[1], description: match[2] });
  }

  return options.length > 0 ? options : null;
}

/**
 * Parse the options block from named params form.
 */
function parseOptionsBlock(argsText: string): ParsedOption[] | null {
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

/**
 * Parse the array-of-questions form: [{ header: "...", ... }, { ... }]
 */
function transformArrayQuestionForm(trimmed: string): string | null {
  const questions: ParsedQuestion[] = [];

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

/**
 * Parse a single question object like { header: "...", question: "...", options: [...], multiSelect: true }
 */
function parseQuestionObject(block: string): ParsedQuestion | null {
  const headerMatch = block.match(/header:\s*"((?:[^"]*\\.)*[^"]*)"/);
  const questionMatch = block.match(/question:\s*"((?:[^"]*\\.)*[^"]*)"/);
  if (!headerMatch || !questionMatch) return null;

  const header = unescapeDoubleQuotedString(headerMatch[1]);
  const question = unescapeDoubleQuotedString(questionMatch[1]);
  const options = parseOptionsBlock(block);
  if (!options) return null;

  const multiSelectMatch = block.match(/multiSelect:\s*(true|false)/);
  const multiSelect = multiSelectMatch ? multiSelectMatch[1] === "true" : undefined;

  return { header, question, options, multiSelect };
}

/**
 * Rewrites Skill(skill="gsd-xxx", args="yyy") calls to Pi-equivalent instructions.
 *
 * Pattern: Skill(skill="gsd-NAME", args="ARGS") →
 *   Use the /gsd-NAME skill (invoke via slash command /gsd-NAME ARGS in Pi) or read the corresponding workflow prompt to continue.
 *
 * Pattern: Skill(skill="gsd-NAME") (no args) →
 *   Use the /gsd-NAME skill (invoke via slash command /gsd-NAME in Pi) or read the corresponding workflow prompt to continue.
 *
 * Code-fence safe: does not transform within ```...``` blocks.
 */
export function transformSkillDispatchForPi(input: string): string {
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

/**
 * Rewrite all Skill() dispatch calls in a non-code segment.
 * Handles:
 *   - Double quotes: Skill(skill="gsd-xxx", args="yyy")
 *   - Escaped double quotes in strings: Skill(skill=\"gsd-xxx\", args=\"yyy\")
 *   - Single quotes: Skill(skill='gsd-xxx', args='yyy')
 *   - Non-gsd prefix: Skill(skill="update-config")
 */
function rewriteSkillDispatchInSegment(
  segment: string,
  formatter: (dispatch: ParsedDispatch) => string,
): string {
  return rewriteBalancedCalls(segment, "Skill", (argsText) => {
    const dispatch = parseDispatchArgs(argsText, "skill");
    return dispatch ? formatter(dispatch) : null;
  });
}

interface ParsedDispatch {
  name: string;
  args?: string;
  isPositional: boolean;
}

function formatSkillDispatchInstruction(dispatch: ParsedDispatch): string {
  if (dispatch.isPositional) {
    return formatWorkflowSkillDispatchInstruction(dispatch);
  }

  const slashCmd = formatSlashInvocation(dispatch);
  const invokePart = dispatch.args
    ? `invoke via slash command ${slashCmd} in Pi`
    : `invoke via slash command /${dispatch.name} in Pi`;
  return `Use the /${dispatch.name} skill (${invokePart}) or read the corresponding workflow prompt to continue.`;
}

function formatWorkflowSkillDispatchInstruction(dispatch: ParsedDispatch): string {
  return `Invoke ${formatSlashInvocation(dispatch)} in Pi`;
}

function formatSlashInvocation(dispatch: ParsedDispatch): string {
  return dispatch.args ? `/${dispatch.name} ${dispatch.args}` : `/${dispatch.name}`;
}

function parseDispatchArgs(argsText: string, nameKey: string): ParsedDispatch | null {
  const tokens = tokenizeTopLevel(argsText);
  if (tokens.length === 0) return null;

  let name: string | undefined;
  let args: string | undefined;
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

function parseNamedAssignment(token: string): { key: string; value: string } | null {
  const match = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
  if (!match) return null;

  const value = unquote(match[2].trim());
  if (value === null) return null;
  return { key: match[1], value };
}

function rewriteBalancedCalls(
  segment: string,
  functionName: string,
  transform: (argsText: string) => string | null,
): string {
  let result = segment;
  let safety = 100;
  let searchFrom = 0;
  const callPattern = new RegExp(`\\b${functionName}\\s*\\(`);

  while (safety-- > 0) {
    const match = callPattern.exec(result.slice(searchFrom));
    if (!match || match.index === undefined) break;

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

/**
 * Rewrites executable workflow dispatch syntax in both prose and code fences.
 * Workflow prompts use fenced pseudo-code as executable instructions, so this
 * transform intentionally does not preserve code-fenced regions.
 */
export function transformWorkflowDispatchForPi(input: string): string {
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

function formatGeneratedWorkflowPath(path: string): string {
  return path
    .replace(/^get-shit-done\/workflows\//, "generated/workflows/workflows/")
    .replace(/^workflows\//, "generated/workflows/workflows/");
}

function rewriteAgentDispatchInSegment(segment: string): string {
  return rewriteBalancedCalls(segment, "Agent", (argsText) => {
    const parsed = parseAgentDispatchArgs(argsText);
    if (!parsed) return null;
    const agent = parsed.agentType === "general-purpose" ? "general" : parsed.agentType;
    return `Use the Pi subagent tool: subagent({agent: "${escapeDoubleQuotedString(agent)}", task: "${escapeDoubleQuotedString(parsed.prompt)}"}). Wait for the subagent result before continuing this workflow.`;
  });
}

function parseAgentDispatchArgs(argsText: string): { agentType: string; prompt: string } | null {
  const tokens = tokenizeTopLevel(argsText);
  let agentType: string | undefined;
  let prompt: string | undefined;

  for (const token of tokens) {
    const named = parseNamedAssignment(token);
    if (!named) continue;
    if (named.key === "subagent_type") agentType = named.value;
    if (named.key === "prompt") prompt = named.value;
  }

  return agentType && prompt ? { agentType, prompt } : null;
}

/**
 * Rewrites subagent_type="general-purpose" to subagent_type="general" in prompt text.
 * Also rewrites Agent(subagent_type="xxx", prompt="yyy") to subagent({agent: "xxx", task: "yyy"}).
 *
 * Code-fence safe: does not transform within ```...``` blocks.
 */
export function transformSubagentDispatchForPi(input: string): string {
  const segments = splitCodeFences(input);
  let changed = false;
  const result = segments.map(({ segment, isCode }) => {
    if (isCode) return segment;
    let transformed = segment;
    // Rewrite subagent_type="general-purpose" to subagent_type="general"
    const before1 = transformed;
    transformed = transformed.replace(/subagent_type="general-purpose"/g, 'subagent_type="general"');
    if (transformed !== before1) changed = true;
    // Rewrite Agent(subagent_type="xxx", prompt="yyy") to subagent({agent: "xxx", task: "yyy"})
    const before2 = transformed;
    transformed = transformed.replace(
      /Agent\(subagent_type="([^"]+)",\s*prompt="([\s\S]*?)"\)/g,
      (_match, agentType: string, promptText: string) => {
        return `subagent({agent: "${agentType}", task: "${promptText}"})`;
      },
    );
    if (transformed !== before2) changed = true;
    return transformed;
  }).join("");

  return changed ? result : input;
}
