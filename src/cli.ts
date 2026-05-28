#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runDoctor } from "./doctor.js";
import { generatePrompts } from "./generator.js";
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
  generate [--out <dir>] [--cwd <dir>]
  doctor [--prompts <dir>] [--cwd <dir>]
  official [--cwd <dir>] [--] [...args]
`;

export async function runCli(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    const [command, ...args] = argv;

    if (command === "generate") {
      const options = parseOptions(args, { out: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const outDir = resolve(cwd, options.out ?? "generated/prompts");
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      const result = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir });

      io.stdout(`generated ${result.written.length} prompt(s)\n`);
      return 0;
    }

    if (command === "doctor") {
      const options = parseOptions(args, { prompts: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const generatedPromptsDir = resolve(cwd, options.prompts ?? "generated/prompts");
      const result = runDoctor({ startDir: cwd, generatedPromptsDir });

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

function parseOptions(args: string[], allowed: Record<string, true>) {
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (!allowed[name]) {
      throw new Error(`Unknown option: ${arg}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}
