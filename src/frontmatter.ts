export type FrontmatterValue = string | string[];
export type FrontmatterData = Record<string, FrontmatterValue>;
export type ParsedMarkdown = { data: FrontmatterData; body: string };

const supportedPromptKeys = ["description", "argument-hint"] as const;

export function splitFrontmatter(input: string): ParsedMarkdown {
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

export function writeFrontmatter(data: FrontmatterData, body: string): string {
  const lines = supportedPromptKeys.flatMap((key) => {
    const value = data[key];
    return typeof value === "string" ? [`${key}: ${formatScalar(value)}`] : [];
  });

  return `---\n${lines.join("\n")}\n---\n${body}`;
}

function parseFrontmatter(rawFrontmatter: string): FrontmatterData {
  const data: FrontmatterData = {};
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

    const list: string[] = [];
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
function unquoteScalar(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function formatScalar(value: string): string {
  if (!needsQuoting(value)) {
    return value;
  }

  if (!value.includes("'")) {
    return `'${value}'`;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}

function needsQuoting(value: string): boolean {
  return value === "" || value !== value.trim() || /[:[\]{}#,&*!|>'"%@`]/.test(value);
}
