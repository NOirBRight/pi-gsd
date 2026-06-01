#!/usr/bin/env node
import {
  generateAll,
  generatePrompts,
  runDoctor,
  syncAgents
} from "./chunk-JCRRSCBD.js";
import {
  createAutoOrchestrator,
  createCommandDispatchRunner,
  createDispatchAdapter,
  createJournalAdapter,
  createStateDigestAdapter,
  isValidPhaseId,
  resolveOfficialPackage,
  resolveWorkflowSettings
} from "./chunk-6TFWBYXD.js";

// src/cli.ts
import { spawnSync } from "child_process";
import { existsSync, realpathSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
var defaultIO = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text)
};
var usage = `Usage: pi-gsd-core <command> [options]

Commands:
  generate [--out <dir>] [--prompts <dir>] [--agents <dir>] [--cwd <dir>]
  doctor [--prompts <dir>] [--agents [dir]] [--workflows [dir]] [--scope project|user] [--cwd <dir>]
  sync-agents [--scope project|user] [--agents <dir>] [--cwd <dir>] [--dry-run] [--check]
  official [--cwd <dir>] [--] [...args]
  orchestrate (--auto|--chain|--resume|--status|--stop <reason>) --phase <phase> [--cwd <dir>] [--reconcile-apply]
`;
var packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function runCli(argv, io = defaultIO) {
  try {
    const [command, ...args] = argv;
    if (command === "generate") {
      const options = parseOptions(args, { out: true, prompts: true, agents: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      if (options.out) {
        const result2 = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: resolve(cwd, options.out), safeRoot: cwd });
        io.stdout(`generated ${result2.written.length} prompt(s)
`);
        return 0;
      }
      const result = generateAll({
        officialRoot: officialPackage.packageRoot,
        promptsDir: resolve(cwd, options.prompts ?? "generated/prompts"),
        agentsDir: resolve(cwd, options.agents ?? "generated/agents"),
        safeRoot: cwd
      });
      io.stdout(`generated ${result.prompts.written.length} prompt(s), ${result.agents.written.length} agent(s), and ${result.workflows?.written.length ?? 0} workflow file(s)
`);
      return 0;
    }
    if (command === "doctor") {
      const options = parseOptions(args, { prompts: true, agents: "optional", workflows: "optional", scope: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const generatedPromptsDir = resolveGeneratedResourceDir(cwd, options.prompts, "generated/prompts");
      const result = runDoctor({
        startDir: cwd,
        generatedPromptsDir,
        ...options.workflows ? {
          generatedWorkflowsDir: resolveGeneratedResourceDir(cwd, options.workflows === "true" ? void 0 : options.workflows, "generated/workflows")
        } : {},
        ...options.agents ? {
          generatedAgentsDir: resolveGeneratedResourceDir(cwd, options.agents === "true" ? void 0 : options.agents, "generated/agents"),
          agentSyncScope: parseSyncScope(options.scope ?? "project")
        } : {}
      });
      for (const message of result.messages) {
        io.stdout(`${message}
`);
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
        check: Object.hasOwn(options, "check")
      });
      for (const message of result.messages) {
        io.stdout(`${message}
`);
      }
      return result.ok ? 0 : 1;
    }
    if (command === "official") {
      const parsed = parseOfficialArgs(args);
      const cwd = resolve(parsed.cwd ?? process.cwd());
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      const child = io === defaultIO ? spawnSync(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
        cwd,
        stdio: "inherit"
      }) : spawnSync(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
        cwd,
        encoding: "utf8",
        stdio: "pipe"
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
    io.stderr(`${error instanceof Error ? error.message : String(error)}
`);
    return 1;
  }
}
function parseOptions(args, allowed) {
  const options = {};
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
      const value2 = args[index + 1];
      if (value2 === void 0 || value2.startsWith("--")) {
        options[name] = "true";
        continue;
      }
      options[name] = value2;
      index += 1;
      continue;
    }
    const value = args[index + 1];
    if (value === void 0 || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}
function resolveGeneratedResourceDir(cwd, optionValue, relativeDir) {
  if (optionValue) {
    return resolve(cwd, optionValue);
  }
  const cwdDir = resolve(cwd, relativeDir);
  if (existsSync(cwdDir)) {
    return cwdDir;
  }
  return join(packageRoot, relativeDir);
}
function parseSyncScope(scope) {
  if (scope === "project" || scope === "user") {
    return scope;
  }
  throw new Error(`Invalid sync scope: ${scope}`);
}
function runOrchestratorCli(args, io) {
  const options = parseOptions(args, { auto: false, chain: false, resume: false, status: false, stop: true, phase: true, cwd: true, "reconcile-apply": false });
  const cwd = resolve(options.cwd ?? process.cwd());
  const phase = options.phase;
  const mode = Object.hasOwn(options, "auto") ? "auto" : "chain";
  const orchestrator = createProductionOrchestrator(cwd, { reconcileApply: options["reconcile-apply"] === "true" });
  if (!phase) {
    io.stderr("Missing value for --phase\n");
    return 2;
  }
  if (!isValidPhaseId(phase)) {
    io.stderr("Invalid --phase; expected two digits such as 09\n");
    return 2;
  }
  let result;
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
    io.stdout(`${message}
`);
  }
  if (result.status) printStatus(result.status, io);
  return result.ok ? 0 : 1;
}
function createProductionOrchestrator(cwd, options = {}) {
  return createAutoOrchestrator({
    settingsResolver: (context) => {
      const settings = resolveWorkflowSettings({ cwd: context.cwd, configPath: context.configPath });
      return options.reconcileApply ? {
        ...settings,
        workflow: { ...settings.workflow, state_reconciliation_apply: true },
        sources: { ...settings.sources, state_reconciliation_apply: "override" }
      } : settings;
    },
    journal: createJournalAdapter({ cwd }),
    stateDigest: createStateDigestAdapter({ cwd }),
    dispatch: createDispatchAdapter({
      cwd,
      resourceRoot: packageRoot,
      runner: createCommandDispatchRunner({ cwd })
    })
  });
}
function runUntilSettled(initial, orchestrator) {
  let result = initial;
  let guard = 0;
  while (result.ok && result.status?.status === "running" && guard < 100) {
    result = orchestrator.advance();
    guard += 1;
  }
  return result;
}
function printStatus(status, io) {
  io.stdout(`status: ${status.status}
`);
  if (status.currentUnit) io.stdout(`currentUnit: ${status.currentUnit.type}
`);
  if (status.resumeHint) io.stdout(`resumeHint: ${status.resumeHint}
`);
}
function parseOfficialArgs(args) {
  const markerIndex = args.indexOf("--");
  const optionArgs = markerIndex === -1 ? args : args.slice(0, markerIndex);
  const passthrough = markerIndex === -1 ? [] : args.slice(markerIndex + 1);
  let cwd;
  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (arg === "--cwd") {
      const value = optionArgs[index + 1];
      if (value === void 0) {
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
function isCliEntrypoint(importMetaUrl, argvPath) {
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
export {
  runCli
};
