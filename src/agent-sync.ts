import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { materializeOfficialAgentPaths } from "./agent-transform.js";

export type AgentSyncScope = "project" | "user";

export type SyncAgentsOptions = {
  generatedAgentsDir: string;
  cwd: string;
  officialRoot: string;
  scope: AgentSyncScope;
  dryRun?: boolean;
  check?: boolean;
};

export type SyncAgentsResult = {
  ok: boolean;
  messages: string[];
  written: string[];
};

const generatedMarker = "<!-- pi-gsd generated agent -->";

export function syncAgents(options: SyncAgentsOptions): SyncAgentsResult {
  const generatedAgentsDir = resolve(options.generatedAgentsDir);
  const targetDir = resolveAgentTargetDir(options.cwd, options.scope);
  const messages: string[] = [];
  const written: string[] = [];
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
    const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : undefined;

    if (existing !== undefined && !isGeneratedSyncedAgent(existing)) {
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
      messages.push(`${existing === undefined ? "missing" : "stale"} synced agent: ${fileName}`);
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

export function resolveAgentTargetDir(cwd: string, scope: AgentSyncScope): string {
  if (scope === "project") {
    return join(resolve(cwd), ".pi", "agents");
  }
  return join(homedir(), ".pi", "agent", "agents");
}

function readGeneratedAgentFileNames(generatedAgentsDir: string): string[] {
  try {
    return readdirSync(generatedAgentsDir).filter((fileName) => fileName.endsWith(".md") && fileName.startsWith("gsd-")).sort();
  } catch {
    return [];
  }
}

function withGeneratedMarker(markdown: string): string {
  const opening = /^---\r?\n/.exec(markdown);
  if (!opening) {
    return `${generatedMarker}\n${markdown}`;
  }

  const restStart = opening[0].length;
  const closing = /\r?\n---\r?\n/.exec(markdown.slice(restStart));
  if (!closing) {
    return `${generatedMarker}\n${markdown}`;
  }

  const insertAt = restStart + closing.index + closing[0].length;
  return `${markdown.slice(0, insertAt)}${generatedMarker}\n${markdown.slice(insertAt)}`;
}

function isGeneratedSyncedAgent(content: string): boolean {
  return content.includes(generatedMarker);
}
