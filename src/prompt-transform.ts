export function commandFileToPiPromptName(fileName: string): string {
  return `gsd-${fileName}`;
}

export function normalizeGsdSlashReferences(input: string): string {
  return input.replace(/(^|[\s([{'"`])\/gsd:([a-z0-9][a-z0-9-]*)/g, "$1/gsd-$2");
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
