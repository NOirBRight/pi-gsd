export type FrontmatterValue = string | string[];
export type FrontmatterData = Record<string, FrontmatterValue>;
export type ParsedMarkdown = { data: FrontmatterData; body: string };

const supportedPromptKeys = [
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
  "requires",
] as const;

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
    if (value === undefined || value === null) return [] as string[];
    return formatValue(key, value);
  });

  return `---\n${lines.join("\n")}\n---\n${body}`;
}

/**
 * Format a frontmatter value for writing, handling strings, arrays, and multiline strings.
 */
function formatValue(key: string, value: FrontmatterValue): string[] {
  if (Array.isArray(value)) {
    return [`${key}:`, ...value.map((v) => `  - ${formatScalar(v)}`)];
  }
  if (typeof value === "string") {
    if (value.includes("\n")) {
      // Multi-line string: use YAML block scalar with |
      return [`${key}: |`, ...value.split("\n").map((l) => `  ${l}`)];
    }
    return [`${key}: ${formatScalar(value)}`];
  }
  return [String(value)];
}

function parseFrontmatter(rawFrontmatter: string): FrontmatterData {
  const data: FrontmatterData = {};
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

    // YAML block scalar: key: | or key: >
    // The value after : is just the block indicator, and the actual content
    // is on subsequent indented lines.
    const trimmedValue = value.trim();
    if (trimmedValue === "|" || trimmedValue === ">") {
      const blockLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith("  ") || lines[j].startsWith("\t") || lines[j] === "")) {
        if (lines[j] !== "") {
          // Remove one level of indentation (2 spaces or 1 tab)
          blockLines.push(lines[j].replace(/^  /, "").replace(/^\t/, ""));
        } else {
          // Preserve blank lines within block scalar
          blockLines.push("");
        }
        j += 1;
      }
      // Trim trailing blank lines from block scalar
      while (blockLines.length > 0 && blockLines[blockLines.length - 1] === "") {
        blockLines.pop();
      }
      data[key] = blockLines.join("\n");
      i = j;
      continue;
    }

    // Non-empty scalar value on the same line
    if (value !== "" && trimmedValue !== "") {
      data[key] = unquoteScalar(value);
      i += 1;
      continue;
    }

    // Empty value — check for list (key: followed by - items on next lines)
    if (value === "" || trimmedValue === "") {
      const list: string[] = [];
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

      // Key with empty value (no list, no block scalar)
      data[key] = "";
      i += 1;
      continue;
    }

    i += 1;
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