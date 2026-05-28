#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncAgents, type AgentSyncScope } from "./agent-sync.js";
import { runDoctor } from "./doctor.js";
import { generateAll, generatePrompts } from "./generator.js";
import { resolveOfficialPackage } from "./official.js";

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
}

const defaultIO: CliIO = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

const usage = `Usage: pi-gsd <command> [options]

Commands:
  generate [--out <dir>] [--prompts <dir>] [--agents <dir>] [--cwd <dir>]
  doctor [--prompts <dir>] [--agents [dir]] [--scope project|user] [--cwd <dir>]
  sync-agents [--scope project|user] [--agents <dir>] [--cwd <dir>] [--dry-run] [--check]
  official [--cwd <dir>] [--] [...args]
`;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function runCli(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    const [command, ...args] = argv;

    if (command === "generate") {
      const options = parseOptions(args, { out: true, prompts: true, agents: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      if (options.out) {
        const result = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: resolve(cwd, options.out), safeRoot: cwd });
        io.stdout(`generated ${result.written.length} prompt(s)\n`);
        return 0;
      }

      const result = generateAll({
        officialRoot: officialPackage.packageRoot,
        promptsDir: resolve(cwd, options.prompts ?? "generated/prompts"),
        agentsDir: resolve(cwd, options.agents ?? "generated/agents"),
        safeRoot: cwd,
      });
      io.stdout(`generated ${result.prompts.written.length} prompt(s) and ${result.agents.written.length} agent(s)\n`);
      return 0;
    }

    if (command === "doctor") {
      const options = parseOptions(args, { prompts: true, agents: "optional", scope: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const generatedPromptsDir = resolveGeneratedResourceDir(cwd, options.prompts, "generated/prompts");
      const result = runDoctor({
        startDir: cwd,
        generatedPromptsDir,
        ...(options.agents
          ? {
              generatedAgentsDir: resolveGeneratedResourceDir(cwd, options.agents === "true" ? undefined : options.agents, "generated/agents"),
              agentSyncScope: parseSyncScope(options.scope ?? "project"),
            }
          : {}),
      });

      for (const message of result.messages) {
        io.stdout(`${message}\n`);
      }

      return result.ok ? 0 : 1;
    }

    if (command === "sync-agents") {
      const options = parseOptions(args, { scope: true, agents: true, cwd: true, "dry-run": false, check: false });
      const cwd = resolve(options.cwd ?? process.cwd());
      const scope = parseSyncScope(options.scope ?? "project");
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      const result = syncAgents({
        generatedAgentsDir: resolveGeneratedResourceDir(cwd, options.agents, "generated/agents"),
        cwd,
        officialRoot: officialPackage.packageRoot,
        scope,
        dryRun: Object.hasOwn(options, "dry-run"),
        check: Object.hasOwn(options, "check"),
      });
      for (const message of result.messages) {
        io.stdout(`${message}\n`);
      }
      return result.ok ? 0 : 1;
    }

    if (command === "official") {
      const parsed = parseOfficialArgs(args);
      const cwd = resolve(parsed.cwd ?? process.cwd());
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      const child =
        io === defaultIO
          ? spawnSync(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
              cwd,
              stdio: "inherit",
            })
          : spawnSync(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
              cwd,
              encoding: "utf8",
              stdio: "pipe",
            });

      if (child.stdout) {
        io.stdout(child.stdout.toString());
      }

      if (child.stderr) {
        io.stderr(child.stderr.toString());
      }

      if (child.error) {
        throw child.error;
      }

      return child.status ?? 1;
    }

    io.stderr(usage);
    return 2;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

type OptionMode = boolean | "optional";

function parseOptions(args: string[], allowed: Record<string, OptionMode>) {
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (!(name in allowed)) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const mode = allowed[name];

    if (!mode) {
      options[name] = "true";
      continue;
    }

    if (mode === "optional") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        options[name] = "true";
        continue;
      }

      options[name] = value;
      index += 1;
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }

    options[name] = value;
    index += 1;
  }

  return options;
}

function resolveGeneratedResourceDir(cwd: string, optionValue: string | undefined, relativeDir: string): string {
  if (optionValue) {
    return resolve(cwd, optionValue);
  }

  const cwdDir = resolve(cwd, relativeDir);
  if (existsSync(cwdDir)) {
    return cwdDir;
  }

  return join(packageRoot, relativeDir);
}

function parseSyncScope(scope: string): AgentSyncScope {
  if (scope === "project" || scope === "user") {
    return scope;
  }
  throw new Error(`Invalid sync scope: ${scope}`);
}

function parseOfficialArgs(args: string[]) {
  const markerIndex = args.indexOf("--");
  const optionArgs = markerIndex === -1 ? args : args.slice(0, markerIndex);
  const passthrough = markerIndex === -1 ? [] : args.slice(markerIndex + 1);
  let cwd: string | undefined;

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];

    if (arg === "--cwd") {
      const value = optionArgs[index + 1];
      if (value === undefined) {
        throw new Error("Missing value for --cwd");
      }

      cwd = value;
      index += 1;
      continue;
    }

    if (markerIndex === -1) {
      passthrough.push(arg);
    } else {
      throw new Error(`Unexpected argument before --: ${arg}`);
    }
  }

  return { cwd, passthrough };
}

function isCliEntrypoint(importMetaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) {
    return false;
  }

  if (importMetaUrl === pathToFileURL(argvPath).href) {
    return true;
  }

  try {
    return importMetaUrl === pathToFileURL(realpathSync(argvPath)).href;
  } catch {
    return false;
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}
