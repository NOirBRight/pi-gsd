import { spawnSync } from "node:child_process";
import { resolveOfficialPackage } from "../official.js";
import type { OrchestrationSnapshot, OrchestratorResult, StateDigestAdapter } from "./types.js";

export type StateDigestStatus = OrchestrationSnapshot["status"];

export type StateDigestRunnerResult = {
  status: number | null;
  stdout?: string;
  stderr?: string;
};

export type StateDigestRunner = (command: string[]) => StateDigestRunnerResult;

export type StateDigestPointerOptions = {
  cwd: string;
  phase: string;
  status: StateDigestStatus;
  currentUnitId?: string;
  journalPath: string;
  resumeHint?: string;
  runner?: StateDigestRunner;
};

export function writeStateDigestPointer(options: StateDigestPointerOptions): OrchestratorResult {
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

export function createStateDigestAdapter(options: { cwd: string; runner?: StateDigestRunner }): StateDigestAdapter {
  return {
    write(snapshot) {
      return writeStateDigestPointer({
        cwd: options.cwd,
        phase: snapshot.phase,
        status: snapshot.status,
        currentUnitId: snapshot.currentUnit?.id,
        journalPath: ".planning/orchestration-state.json",
        resumeHint: snapshot.resumeHint,
        runner: options.runner,
      });
    },
  };
}

function createOfficialStateRunner(cwd: string): StateDigestRunner {
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

function buildDigest(options: StateDigestPointerOptions): string {
  const parts = [
    `Orchestrator ${options.status}`,
    `phase=${bounded(options.phase)}`,
    `unit=${bounded(options.currentUnitId ?? "none")}`,
    `journal=${bounded(options.journalPath)}`,
  ];
  if (options.resumeHint) {
    parts.push(`resume=${bounded(options.resumeHint)}`);
  }
  return parts.join("; ");
}

function skipped(reason: string): OrchestratorResult {
  return { ok: false, messages: [`STATE digest pointer skipped: ${reason}`] };
}

function formatRunnerFailure(result: StateDigestRunnerResult): string {
  return (result.stderr || result.stdout || `exit ${String(result.status)}`).trim();
}

function bounded(value: string): string {
  return value.length <= 240 ? value : `${value.slice(0, 240)}…`;
}
