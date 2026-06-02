#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncAgents, type AgentSyncScope } from "./agent-sync.js";
import { runDoctor } from "./doctor.js";
import { generateAll, generatePrompts, generateWorkflows, writeOfficialVersionStamp } from "./generator.js";
import { resolveOfficialPackage } from "./official.js";
import { createCommandDispatchRunner, createDispatchAdapter } from "./orchestrator/dispatch.js";
import { createAutoOrchestrator, type OrchestratorResult } from "./orchestrator/index.js";
import { createJournalAdapter } from "./orchestrator/journal.js";
import { isValidPhaseId } from "./orchestrator/phase.js";
import { resolveWorkflowSettings } from "./orchestrator/settings.js";
import { createStateDigestAdapter } from "./orchestrator/state-digest.js";

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
}

const defaultIO: CliIO = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

const usage = `Usage: pi-gsd-core <command> [options]

Commands:
  generate [--out <dir>] [--prompts <dir>] [--agents <dir>] [--cwd <dir>]
  doctor [--prompts <dir>] [--agents [dir]] [--workflows [dir]] [--scope project|user] [--cwd <dir>]
  sync-agents [--scope project|user] [--agents <dir>] [--cwd <dir>] [--dry-run] [--check]
  official [--cwd <dir>] [--] [...args]
  orchestrate (--auto|--chain|--resume|--status|--stop <reason>) --phase <phase> [--cwd <dir>] [--reconcile-apply]
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
        const outDir = resolve(cwd, options.out);
        const result = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir, safeRoot: cwd });
        writeOfficialVersionStamp({ officialRoot: officialPackage.packageRoot, generatedRoot: dirname(outDir) });
        io.stdout(`generated ${result.written.length} prompt(s)\n`);
        return 0;
      }

      const result = generateAll({
        officialRoot: officialPackage.packageRoot,
        promptsDir: resolve(cwd, options.prompts ?? "generated/prompts"),
        agentsDir: resolve(cwd, options.agents ?? "generated/agents"),
        safeRoot: cwd,
      });
      io.stdout(`generated ${result.prompts.written.length} prompt(s), ${result.agents.written.length} agent(s), and ${result.workflows?.written.length ?? 0} workflow file(s)\n`);
      return 0;
    }

    if (command === "doctor") {
      const options = parseOptions(args, { prompts: true, agents: "optional", workflows: "optional", scope: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const generatedPromptsDir = resolveGeneratedResourceDir(cwd, options.prompts, "generated/prompts");
      const result = runDoctor({
        startDir: cwd,
        generatedPromptsDir,
        ...(options.workflows
          ? {
              generatedWorkflowsDir: resolveGeneratedResourceDir(cwd, options.workflows === "true" ? undefined : options.workflows, "generated/workflows"),
            }
          : {}),
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

    if (command === "orchestrate") {
      return runOrchestratorCli(args, io);
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

function runOrchestratorCli(args: string[], io: CliIO): number {
  const options = parseOptions(args, { auto: false, chain: false, resume: false, status: false, stop: true, phase: true, cwd: true, "reconcile-apply": false });
  const cwd = resolve(options.cwd ?? process.cwd());
  const phase = options.phase;
  const mode = Object.hasOwn(options, "auto") ? "auto" : "chain";
  const orchestrator = createProductionOrchestrator(cwd, { reconcileApply: options["reconcile-apply"] === "true" });

  if (!phase) {
    io.stderr("Missing value for --phase\n");
    return 2;
  }
  if (!isValidPhaseId(phase, { cwd })) {
    io.stderr("Invalid --phase; expected integer or decimal phase id such as 9 or 2.1\n");
    return 2;
  }

  let result: OrchestratorResult;
  if (Object.hasOwn(options, "status")) {
    const resumed = orchestrator.resume();
    const status = resumed.snapshot ? resumed.status : orchestrator.getStatus();
    printStatus(status ?? orchestrator.getStatus(), io);
    return resumed.ok || Boolean(resumed.snapshot) || resumed.messages.includes("orchestration journal not found") ? 0 : 1;
  }

  if (Object.hasOwn(options, "stop")) {
    if (!options.stop || options.stop === "true") {
      io.stderr("Missing value for --stop\n");
      return 2;
    }
    orchestrator.resume();
    result = orchestrator.stop(options.stop);
  } else if (Object.hasOwn(options, "resume")) {
    result = runUntilSettled(orchestrator.resume(), orchestrator);
  } else if (Object.hasOwn(options, "auto") || Object.hasOwn(options, "chain")) {
    result = runUntilSettled(orchestrator.start({ phase, mode, cwd }), orchestrator);
  } else {
    io.stderr(usage);
    return 2;
  }

  for (const message of result.messages) {
    io.stdout(`${message}\n`);
  }
  if (result.status) printStatus(result.status, io);
  return result.ok ? 0 : 1;
}

function createProductionOrchestrator(cwd: string, options: { reconcileApply?: boolean } = {}) {
  return createAutoOrchestrator({
    settingsResolver: (context) => {
      const settings = resolveWorkflowSettings({ cwd: context.cwd, configPath: context.configPath });
      return options.reconcileApply
        ? {
            ...settings,
            workflow: { ...settings.workflow, state_reconciliation_apply: true },
            sources: { ...settings.sources, state_reconciliation_apply: "override" },
          }
        : settings;
    },
    journal: createJournalAdapter({ cwd }),
    stateDigest: createStateDigestAdapter({ cwd }),
    dispatch: createDispatchAdapter({
      cwd,
      resourceRoot: packageRoot,
      runner: createCommandDispatchRunner({ cwd }),
    }),
  });
}

function runUntilSettled(initial: OrchestratorResult, orchestrator: ReturnType<typeof createAutoOrchestrator>): OrchestratorResult {
  let result = initial;
  let guard = 0;
  while (result.ok && result.status?.status === "running" && guard < 100) {
    result = orchestrator.advance();
    guard += 1;
  }
  return result;
}

function printStatus(status: NonNullable<OrchestratorResult["status"]>, io: CliIO) {
  io.stdout(`status: ${status.status}\n`);
  if (status.currentUnit) io.stdout(`currentUnit: ${status.currentUnit.type}\n`);
  if (status.resumeHint) io.stdout(`resumeHint: ${status.resumeHint}\n`);
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
