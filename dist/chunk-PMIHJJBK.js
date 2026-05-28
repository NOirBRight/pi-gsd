import {
  commandFileToPiPromptName,
  normalizeGsdSlashReferences,
  resolveOfficialPackage
} from "./chunk-JTETA7Z5.js";

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

// src/generator.ts
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { isAbsolute, join, parse, relative, resolve } from "path";
function generatePrompts(options) {
  const officialRoot = resolve(options.officialRoot);
  const outDir = resolve(options.outDir);
  assertSafeOutDir(officialRoot, outDir);
  const commandsDir = join(officialRoot, "commands", "gsd");
  const fileNames = readdirSync(commandsDir).filter((fileName) => fileName.endsWith(".md")).sort((a, b) => a.localeCompare(b));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const written = fileNames.map((fileName) => {
    const source = readFileSync(join(commandsDir, fileName), "utf8");
    const parsed = splitFrontmatter(source);
    const targetPath = join(outDir, commandFileToPiPromptName(fileName));
    const body = normalizeGsdSlashReferences(parsed.body);
    writeFileSync(targetPath, writeFrontmatter(parsed.data, body), "utf8");
    return targetPath;
  });
  return { written };
}
function assertSafeOutDir(officialRoot, outDir) {
  if (parse(outDir).root === outDir || samePath(outDir, process.cwd()) || samePath(outDir, officialRoot) || isInside(outDir, officialRoot) || isInside(officialRoot, outDir)) {
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

// src/doctor.ts
import { mkdtempSync, readdirSync as readdirSync2, readFileSync as readFileSync2, rmSync as rmSync2 } from "fs";
import { tmpdir } from "os";
import { basename, join as join2 } from "path";
function runDoctor(options) {
  const officialPackage = resolveOfficialPackage({ startDir: options.startDir });
  const messages = [
    `official package: ${officialPackage.packageName}@${officialPackage.version}`,
    `official root: ${officialPackage.packageRoot}`
  ];
  const tempDir = mkdtempSync(join2(tmpdir(), "pi-gsd-doctor-"));
  try {
    const expectedDir = join2(tempDir, "prompts");
    const expected = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: expectedDir });
    const expectedFileNames = new Set(expected.written.map((expectedPath) => basename(expectedPath)));
    let ok = true;
    for (const expectedPath of expected.written) {
      const fileName = basename(expectedPath);
      const actualPath = join2(options.generatedPromptsDir, fileName);
      let actual;
      try {
        actual = readFileSync2(actualPath, "utf8");
      } catch (error) {
        if (isMissingFileError(error)) {
          ok = false;
          messages.push(`missing generated prompt: ${fileName}`);
          continue;
        }
        throw error;
      }
      const expectedContent = readFileSync2(expectedPath, "utf8");
      if (actual !== expectedContent) {
        ok = false;
        messages.push(`stale generated prompt: ${fileName}`);
      }
    }
    for (const fileName of readGeneratedPromptFileNames(options.generatedPromptsDir)) {
      if (!expectedFileNames.has(fileName)) {
        ok = false;
        messages.push(`unexpected generated prompt: ${fileName}`);
      }
    }
    return { ok, messages };
  } finally {
    rmSync2(tempDir, { recursive: true, force: true });
  }
}
function isMissingFileError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function readGeneratedPromptFileNames(generatedPromptsDir) {
  try {
    return readdirSync2(generatedPromptsDir).filter((name) => name.endsWith(".md")).sort();
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
  generatePrompts,
  runDoctor
};
