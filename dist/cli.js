#!/usr/bin/env node
import {
  createAutoOrchestrator,
  generateAll,
  generatePrompts,
  runDoctor,
  syncAgents
} from "./chunk-KLECSVZD.js";
import {
  resolveOfficialPackage
} from "./chunk-27CGUQAG.js";

// src/cli.ts
import { spawnSync as spawnSync2 } from "child_process";
import { existsSync as existsSync3, realpathSync } from "fs";
import { dirname as dirname2, join as join3, resolve as resolve2 } from "path";
import { fileURLToPath, pathToFileURL } from "url";

// src/orchestrator/dispatch.ts
import { existsSync } from "fs";
import { join } from "path";
function resolveUnitDispatchTarget(unit) {
  switch (unit.type) {
    case "plan":
      return { agent: "gsd-planner", prompt: "generated/prompts/gsd-plan-phase.md" };
    case "execute":
      return { agent: "gsd-executor", prompt: "generated/prompts/gsd-execute-phase.md" };
    case "verify":
      return { agent: "gsd-verifier", prompt: "generated/prompts/gsd-verify-work.md" };
    case "closeout":
      return { agent: void 0, prompt: "generated/prompts/gsd-ship.md" };
    default:
      return { agent: void 0, prompt: `generated/prompts/gsd-${unit.type}.md` };
  }
}
function dispatchUnit(options, unit, snapshot) {
  const target = resolveUnitDispatchTarget(unit);
  const promptPath = join(options.cwd, target.prompt);
  if (!existsSync(promptPath)) {
    return { ok: false, messages: [`missing dispatch prompt: ${target.prompt}`] };
  }
  if (target.agent && !existsSync(join(options.cwd, "generated", "agents", `${target.agent}.md`))) {
    return { ok: false, messages: [`missing dispatch agent: ${target.agent}`] };
  }
  return options.runner({ unit, snapshot, target, env: { GSD_AUDIT: "1" } });
}
function createDispatchAdapter(options) {
  return (unit, snapshot) => dispatchUnit(options, unit, snapshot);
}

// src/orchestrator/journal.ts
import { existsSync as existsSync2, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve, relative } from "path";
var DEFAULT_JOURNAL_PATH = ".planning/orchestration-state.json";
var allowedEventKeys = /* @__PURE__ */ new Set(["type", "ts", "phase", "unitId", "status", "attempt", "reason", "resumeHint", "evidence"]);
var unsafeEventKeys = /* @__PURE__ */ new Set(["prompt", "userText", "env", "token", "secret", "password", "apiKey", "api_key", "authorization", "bearer", "args", "arguments", "rawArgs"]);
var safeMetadataKeys = /* @__PURE__ */ new Set(["setting", "source", "label", "safe"]);
var secretPattern = /(?:password|secret|token|api[_-]?key|authorization|bearer)/i;
var maxStringLength = 240;
var maxEvidenceItems = 20;
function createJournalAdapter(options) {
  return {
    append(event, snapshot) {
      return appendJournalEvent({ ...options, event, snapshot });
    },
    read() {
      const result = readJournal(options);
      if (!result.journal) return result;
      return {
        ...result,
        journal: {
          snapshot: result.journal.snapshot,
          events: result.journal.events
        }
      };
    }
  };
}
function readJournal(options) {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages };
  if (!existsSync2(resolved.path)) {
    return { ok: true, messages: ["orchestration journal not found"] };
  }
  try {
    const parsed = JSON.parse(readFileSync(resolved.path, "utf8"));
    const journal = normalizeJournal(parsed);
    if (!journal) {
      return { ok: false, messages: ["orchestration journal is invalid"] };
    }
    return { ok: true, messages: ["orchestration journal read"], journal };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal read failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}
function appendJournalEvent(options) {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages, written: [] };
  const existing = readJournal(options);
  const events = existing.ok && existing.journal ? existing.journal.events : [];
  const journal = {
    version: 1,
    snapshot: redactSnapshot(options.snapshot),
    events: [...events, redactJournalEvent(options.event)]
  };
  return writeJournal(resolved.path, journal);
}
function redactSnapshot(snapshot) {
  return {
    ...snapshot,
    currentUnit: snapshot.currentUnit ? redactUnit(snapshot.currentUnit) : void 0,
    remainingUnits: snapshot.remainingUnits.map(redactUnit),
    lastEvent: snapshot.lastEvent ? redactJournalEvent(snapshot.lastEvent) : void 0,
    resumeHint: snapshot.resumeHint ? safeString(snapshot.resumeHint) : void 0
  };
}
function redactJournalEvent(event) {
  const redacted = {};
  for (const [key, value] of Object.entries(event)) {
    if (unsafeEventKeys.has(key) || !allowedEventKeys.has(key)) {
      continue;
    }
    if (key === "evidence") {
      const evidence = Array.isArray(value) ? value : [];
      redacted.evidence = evidence.filter((item) => typeof item === "string").slice(0, maxEvidenceItems).map(safeString);
      continue;
    }
    if (typeof value === "string") {
      redacted[key] = safeString(value);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      redacted[key] = value;
    }
  }
  return redacted;
}
function redactUnit(unit) {
  if (!unit.metadata) return unit;
  const metadata = {};
  for (const [key, value] of Object.entries(unit.metadata)) {
    if (unsafeEventKeys.has(key) || !safeMetadataKeys.has(key)) continue;
    metadata[key] = typeof value === "string" ? safeString(value) : value;
  }
  return { ...unit, metadata };
}
function writeJournal(path, journal) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(journal, null, 2)}
`, "utf8");
    return { ok: true, messages: ["orchestration journal written"], written: [path], snapshot: journal.snapshot, status: journal.snapshot ? void 0 : void 0 };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal write failed: ${error instanceof Error ? error.message : String(error)}`], written: [] };
  }
}
function resolveJournalPath(options) {
  const cwd = resolve(options.cwd);
  const planningDir = resolve(cwd, ".planning");
  const candidate = resolve(cwd, options.journalPath ?? DEFAULT_JOURNAL_PATH);
  if (!isInsideOrSame(planningDir, candidate)) {
    return { ok: false, messages: [`refusing orchestration journal path outside .planning: ${candidate}`] };
  }
  return { ok: true, path: candidate };
}
function isInsideOrSame(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || !rel.startsWith("..") && !resolve(rel).startsWith("..");
}
function normalizeJournal(value) {
  if (!value || typeof value !== "object") return void 0;
  const candidate = value;
  if (candidate.version !== 1) return void 0;
  if (!candidate.snapshot || typeof candidate.snapshot !== "object") return void 0;
  if (!Array.isArray(candidate.events)) return void 0;
  return {
    version: 1,
    snapshot: redactSnapshot(candidate.snapshot),
    events: candidate.events.map((event) => redactJournalEvent(event && typeof event === "object" ? event : {}))
  };
}
function safeString(value) {
  return secretPattern.test(value) ? "[REDACTED]" : truncate(value);
}
function truncate(value) {
  return value.length <= maxStringLength ? value : `${value.slice(0, maxStringLength)}\u2026`;
}

// src/orchestrator/state-digest.ts
import { spawnSync } from "child_process";
function writeStateDigestPointer(options) {
  const runner = options.runner ?? createOfficialStateRunner(options.cwd);
  const digest = buildDigest(options);
  const probe = runner(["query", "state.load"]);
  if (probe.status !== 0) {
    return skipped(`state.load unavailable: ${formatRunnerFailure(probe)}`);
  }
  const update = runner(["query", "state.record-session", "", digest, options.journalPath]);
  if (update.status !== 0) {
    return skipped(formatRunnerFailure(update));
  }
  return { ok: true, messages: ["STATE digest pointer recorded"] };
}
function createStateDigestAdapter(options) {
  return {
    write(snapshot) {
      return writeStateDigestPointer({
        cwd: options.cwd,
        phase: snapshot.phase,
        status: snapshot.status,
        currentUnitId: snapshot.currentUnit?.id,
        journalPath: ".planning/orchestration-state.json",
        resumeHint: snapshot.resumeHint,
        runner: options.runner
      });
    }
  };
}
function createOfficialStateRunner(cwd) {
  const officialPackage = resolveOfficialPackage({ startDir: cwd });
  const gsdTools = officialPackage.paths.gsdTools;
  return (command) => {
    const child = spawnSync(process.execPath, [gsdTools, ...command], { cwd, encoding: "utf8", stdio: "pipe" });
    if (child.error) {
      return { status: 1, stdout: child.stdout?.toString(), stderr: child.error.message };
    }
    return { status: child.status, stdout: child.stdout?.toString(), stderr: child.stderr?.toString() };
  };
}
function buildDigest(options) {
  const parts = [
    `Orchestrator ${options.status}`,
    `phase=${bounded(options.phase)}`,
    `unit=${bounded(options.currentUnitId ?? "none")}`,
    `journal=${bounded(options.journalPath)}`
  ];
  if (options.resumeHint) {
    parts.push(`resume=${bounded(options.resumeHint)}`);
  }
  return parts.join("; ");
}
function skipped(reason) {
  return { ok: false, messages: [`STATE digest pointer skipped: ${reason}`] };
}
function formatRunnerFailure(result) {
  return (result.stderr || result.stdout || `exit ${String(result.status)}`).trim();
}
function bounded(value) {
  return value.length <= 240 ? value : `${value.slice(0, 240)}\u2026`;
}

// src/cli.ts
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
  orchestrate (--auto|--chain|--resume|--status|--stop <reason>) --phase <phase> [--cwd <dir>]
`;
var packageRoot = resolve2(dirname2(fileURLToPath(import.meta.url)), "..");
async function runCli(argv, io = defaultIO) {
  try {
    const [command, ...args] = argv;
    if (command === "generate") {
      const options = parseOptions(args, { out: true, prompts: true, agents: true, cwd: true });
      const cwd = resolve2(options.cwd ?? process.cwd());
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      if (options.out) {
        const result2 = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: resolve2(cwd, options.out), safeRoot: cwd });
        io.stdout(`generated ${result2.written.length} prompt(s)
`);
        return 0;
      }
      const result = generateAll({
        officialRoot: officialPackage.packageRoot,
        promptsDir: resolve2(cwd, options.prompts ?? "generated/prompts"),
        agentsDir: resolve2(cwd, options.agents ?? "generated/agents"),
        safeRoot: cwd
      });
      io.stdout(`generated ${result.prompts.written.length} prompt(s), ${result.agents.written.length} agent(s), and ${result.workflows?.written.length ?? 0} workflow file(s)
`);
      return 0;
    }
    if (command === "doctor") {
      const options = parseOptions(args, { prompts: true, agents: "optional", workflows: "optional", scope: true, cwd: true });
      const cwd = resolve2(options.cwd ?? process.cwd());
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
      const cwd = resolve2(options.cwd ?? process.cwd());
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
      const cwd = resolve2(parsed.cwd ?? process.cwd());
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      const child = io === defaultIO ? spawnSync2(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
        cwd,
        stdio: "inherit"
      }) : spawnSync2(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
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
    return resolve2(cwd, optionValue);
  }
  const cwdDir = resolve2(cwd, relativeDir);
  if (existsSync3(cwdDir)) {
    return cwdDir;
  }
  return join3(packageRoot, relativeDir);
}
function parseSyncScope(scope) {
  if (scope === "project" || scope === "user") {
    return scope;
  }
  throw new Error(`Invalid sync scope: ${scope}`);
}
function runOrchestratorCli(args, io) {
  const options = parseOptions(args, { auto: false, chain: false, resume: false, status: false, stop: true, phase: true, cwd: true });
  const cwd = resolve2(options.cwd ?? process.cwd());
  const phase = options.phase;
  const mode = Object.hasOwn(options, "auto") ? "auto" : "chain";
  const orchestrator = createProductionOrchestrator(cwd);
  if (!phase) {
    io.stderr("Missing value for --phase\n");
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
function createProductionOrchestrator(cwd) {
  return createAutoOrchestrator({
    journal: createJournalAdapter({ cwd }),
    stateDigest: createStateDigestAdapter({ cwd }),
    dispatch: createDispatchAdapter({
      cwd,
      runner: createCliDispatchRunner(cwd)
    })
  });
}
function createCliDispatchRunner(cwd) {
  return (request) => {
    const command = process.env.PI_GSD_DISPATCH_COMMAND;
    if (!command) {
      return { ok: false, messages: ["PI_GSD_DISPATCH_COMMAND is required for CLI orchestrator dispatch"] };
    }
    const child = spawnSync2(command, {
      cwd,
      encoding: "utf8",
      input: `${JSON.stringify({ unit: request.unit, snapshot: request.snapshot, target: request.target })}
`,
      shell: true,
      env: { ...process.env, ...request.env }
    });
    if (child.error) return { ok: false, messages: [`dispatch failed: ${child.error.message}`] };
    if (child.status !== 0) return { ok: false, messages: [`dispatch failed (${child.status ?? "signal"}): ${(child.stderr || child.stdout || "").trim()}`] };
    return { ok: true, messages: [(child.stdout || `dispatched ${request.unit.type}`).trim()] };
  };
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
