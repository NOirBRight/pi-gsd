import { splitFrontmatter, type FrontmatterData } from "./frontmatter.js";
import { normalizeGsdSlashReferences } from "./prompt-transform.js";

export const OFFICIAL_ROOT_PLACEHOLDER = "__PI_GSD_OFFICIAL_ROOT__";

const toolNameMap = new Map<string, string>([
  ["read", "read"],
  ["write", "write"],
  ["edit", "edit"],
  ["bash", "bash"],
  ["grep", "grep"],
  ["glob", "find"],
  ["ls", "ls"],
  ["list", "ls"],
]);

export type TransformOfficialAgentResult = {
  markdown: string;
  unsupportedTools: string[];
};

export function transformOfficialAgentMarkdown(input: string): TransformOfficialAgentResult {
  const parsed = splitFrontmatter(input);
  const name = scalar(parsed.data.name);
  const description = scalar(parsed.data.description);

  if (!name || !description) {
    throw new Error("Official agent markdown must include name and description frontmatter.");
  }

  const { mappedTools, unsupportedTools } = mapOfficialTools(parsed.data.tools);
  const body = rewriteOfficialAgentBody(parsed.body, unsupportedTools);
  const frontmatter: FrontmatterData = { name, description: normalizeGsdSlashReferences(description) };
  if (mappedTools.length > 0) {
    frontmatter.tools = mappedTools.join(", ");
  }

  return {
    markdown: writeAgentFrontmatter(frontmatter, body),
    unsupportedTools,
  };
}

export function materializeOfficialAgentPaths(input: string, officialRoot: string): string {
  const posixRoot = officialRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  return input.replaceAll(OFFICIAL_ROOT_PLACEHOLDER, posixRoot);
}

function rewriteOfficialAgentBody(body: string, unsupportedTools: string[]): string {
  const rewritten = normalizeGsdSlashReferences(body)
    .replace(/@(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `@${OFFICIAL_ROOT_PLACEHOLDER}/get-shit-done/`)
    .replace(/(^|[^@])(?:~|\$HOME)\/\.claude\/get-shit-done\//g, `$1${OFFICIAL_ROOT_PLACEHOLDER}/get-shit-done/`);

  if (unsupportedTools.length === 0) {
    return rewritten;
  }

  const note = `\n\n> Pi adapter note: unsupported official tools omitted: ${unsupportedTools.join(", ")}\n`;
  return `${note}${rewritten}`;
}

function mapOfficialTools(value: FrontmatterData[string] | undefined) {
  const rawTools = normalizeToolList(value);
  const mappedTools: string[] = [];
  const unsupportedTools: string[] = [];

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

function normalizeToolList(value: FrontmatterData[string] | undefined): string[] {
  if (typeof value === "string") {
    return value.split(",").map((tool) => tool.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((tool) => tool.split(",")).map((tool) => tool.trim()).filter(Boolean);
  }
  return [];
}

function scalar(value: FrontmatterData[string] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function writeAgentFrontmatter(data: FrontmatterData, body: string): string {
  const lines = [
    `name: ${data.name}`,
    `description: ${data.description}`,
  ];
  if (typeof data.tools === "string" && data.tools) {
    lines.push(`tools: ${data.tools}`);
  }
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
