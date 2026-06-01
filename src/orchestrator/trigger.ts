import type { OrchestratorResult } from "./types.js";

export type NativeAutoTrigger = { command: string; phase: string; mode: "auto" | "chain" };

export function detectNativeAutoTrigger(input: string): NativeAutoTrigger | undefined {
  const match = input.trim().match(/^\/(gsd-(?:plan-phase|execute-phase|verify-work|ship))\s+(\S+)([\s\S]*)$/);
  if (!match) return undefined;
  const [, command, phase, rest] = match;
  if (/\s--chain(?:\s|$)/.test(rest)) return { command, phase, mode: "chain" };
  if (/\s--auto(?:\s|$)/.test(rest)) return { command, phase, mode: "auto" };
  return undefined;
}

export function createNativeAutoHandoff(options: { cwd: string; createOrchestrator: () => { start(ctx: { phase: string; mode: "auto" | "chain"; cwd: string }): OrchestratorResult; advance(): OrchestratorResult; resume(): OrchestratorResult; stop(reason: string): OrchestratorResult; getStatus(): unknown } }) {
  return (input: string): OrchestratorResult | undefined => {
    const trigger = detectNativeAutoTrigger(input);
    if (!trigger) return undefined;
    const orchestrator = options.createOrchestrator();
    let result = orchestrator.start({ phase: trigger.phase, mode: trigger.mode, cwd: options.cwd });
    let guard = 0;
    while (result.ok && result.status?.status === "running" && guard < 100) {
      result = orchestrator.advance();
      guard += 1;
    }
    return result;
  };
}
