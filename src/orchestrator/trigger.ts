import { isValidPhaseId } from "./phase.js";
import type { OrchestratorResult, OrchestratorSessionContext, UnitType } from "./types.js";

export type NativeAutoTrigger = {
  command: "gsd-discuss-phase" | "gsd-plan-phase" | "gsd-execute-phase" | "gsd-verify-work" | "gsd-ship";
  phase: string;
  mode: "auto" | "chain";
  extraArgs?: string;
};

export function detectNativeAutoTrigger(input: string): NativeAutoTrigger | undefined {
  const match = input.trim().match(/^\/(gsd-(?:discuss-phase|plan-phase|execute-phase|verify-work|ship))\s+(\S+)([\s\S]*)$/);
  if (!match) return undefined;
  const [, command, phase, rest] = match;
  if (phase.startsWith("--")) return undefined;
  if (/\s--chain(?:\s|$)/.test(rest)) return trigger(command, phase, "chain", rest);
  if (/\s--auto(?:\s|$)/.test(rest)) return trigger(command, phase, "auto", rest);
  return undefined;
}

const commandStart: Record<NativeAutoTrigger["command"], UnitType> = {
  "gsd-discuss-phase": "discuss",
  "gsd-plan-phase": "plan",
  "gsd-execute-phase": "execute",
  "gsd-verify-work": "verify",
  "gsd-ship": "closeout",
};

export function createNativeAutoHandoff(options: { cwd: string; createOrchestrator: () => { start(ctx: OrchestratorSessionContext): OrchestratorResult; advance(): OrchestratorResult; resume(): OrchestratorResult; stop(reason: string): OrchestratorResult; getStatus(): unknown } }) {
  return (input: string): OrchestratorResult | undefined => {
    const trigger = detectNativeAutoTrigger(input);
    if (!trigger) return undefined;
    if (!isValidPhaseId(trigger.phase, { cwd: options.cwd })) {
      return { ok: false, messages: ["Invalid phase; expected integer or decimal phase id such as 9 or 2.1"], status: { status: "idle", remainingUnits: [], attempt: 0 } };
    }
    const orchestrator = options.createOrchestrator();
    let result = orchestrator.start({ phase: trigger.phase, mode: trigger.mode, cwd: options.cwd, startAt: commandStart[trigger.command], extraArgs: trigger.extraArgs });
    let guard = 0;
    while (result.ok && result.status?.status === "running" && guard < 100) {
      result = orchestrator.advance();
      guard += 1;
    }
    return result;
  };
}

function trigger(command: string, phase: string, mode: NativeAutoTrigger["mode"], rest: string): NativeAutoTrigger {
  const extraArgs = rest
    .replace(/(^|\s)--(?:chain|auto)(?=\s|$)/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return {
    command: command as NativeAutoTrigger["command"],
    phase,
    mode,
    ...(extraArgs ? { extraArgs } : {}),
  };
}
