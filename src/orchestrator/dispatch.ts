import { existsSync } from "node:fs";
import { join } from "node:path";
import type { OrchestrationSnapshot, OrchestrationUnit, OrchestratorResult } from "./types.js";

export type UnitDispatchTarget = { agent?: string; prompt: string };
export type DispatchRequest = {
  unit: OrchestrationUnit;
  snapshot: OrchestrationSnapshot;
  target: UnitDispatchTarget;
  env: Record<string, string>;
};
export type DispatchRunner = (request: DispatchRequest) => OrchestratorResult;

export function resolveUnitDispatchTarget(unit: OrchestrationUnit): UnitDispatchTarget {
  switch (unit.type) {
    case "plan": return { agent: "gsd-planner", prompt: "generated/prompts/gsd-plan-phase.md" };
    case "execute": return { agent: "gsd-executor", prompt: "generated/prompts/gsd-execute-phase.md" };
    case "verify": return { agent: "gsd-verifier", prompt: "generated/prompts/gsd-verify-work.md" };
    case "closeout": return { agent: undefined, prompt: "generated/prompts/gsd-ship.md" };
    default: return { agent: undefined, prompt: `generated/prompts/gsd-${unit.type}.md` };
  }
}

export function dispatchUnit(options: { cwd: string; runner: DispatchRunner }, unit: OrchestrationUnit, snapshot: OrchestrationSnapshot): OrchestratorResult {
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

export function createDispatchAdapter(options: { cwd: string; runner: DispatchRunner }) {
  return (unit: OrchestrationUnit, snapshot: OrchestrationSnapshot): OrchestratorResult => dispatchUnit(options, unit, snapshot);
}
