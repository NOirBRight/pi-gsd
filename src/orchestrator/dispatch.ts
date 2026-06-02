import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { OrchestrationOutcome, OrchestrationSnapshot, OrchestrationUnit, OrchestratorResult } from "./types.js";

export type UnitDispatchTarget = { agent?: string; prompt: string };
export type DispatchRequest = {
  unit: OrchestrationUnit;
  snapshot: OrchestrationSnapshot;
  target: UnitDispatchTarget;
  env: Record<string, string>;
};
export type DispatchRunner = (request: DispatchRequest) => OrchestratorResult;

const dispatchTargets: Partial<Record<OrchestrationUnit["type"], UnitDispatchTarget>> = {
  discuss: { prompt: "generated/prompts/gsd-discuss-phase.md" },
  research: { prompt: "generated/prompts/gsd-explore.md" },
  plan: { agent: "gsd-planner", prompt: "generated/prompts/gsd-plan-phase.md" },
  "plan-check": { prompt: "generated/prompts/gsd-plan-review-convergence.md" },
  execute: { agent: "gsd-executor", prompt: "generated/prompts/gsd-execute-phase.md" },
  "code-review": { agent: "gsd-code-reviewer", prompt: "generated/prompts/gsd-code-review.md" },
  "security-review": { agent: "gsd-security-auditor", prompt: "generated/prompts/gsd-secure-phase.md" },
  "nyquist-validation": { agent: "gsd-nyquist-auditor", prompt: "generated/prompts/gsd-validate-phase.md" },
  "ai-integration": { prompt: "generated/prompts/gsd-ai-integration-phase.md" },
  "ui-review": { agent: "gsd-ui-auditor", prompt: "generated/prompts/gsd-ui-review.md" },
  "settings-gate": { agent: "gsd-ui-researcher", prompt: "generated/prompts/gsd-ui-phase.md" },
  "ui-safety-gate": { agent: "gsd-ui-checker", prompt: "generated/prompts/gsd-ui-phase.md" },
  verify: { agent: "gsd-verifier", prompt: "generated/prompts/gsd-verify-work.md" },
  closeout: { agent: undefined, prompt: "generated/prompts/gsd-ship.md" },
};

export function resolveUnitDispatchTarget(unit: OrchestrationUnit): UnitDispatchTarget {
  return dispatchTargets[unit.type] ?? { prompt: `generated/prompts/gsd-${unit.type}.md` };
}

export function dispatchUnit(options: { cwd: string; resourceRoot?: string; runner?: DispatchRunner }, unit: OrchestrationUnit, snapshot: OrchestrationSnapshot): OrchestratorResult {
  const target = resolveUnitDispatchTarget(unit);
  const resourceRoot = options.resourceRoot ?? options.cwd;
  const promptPath = join(resourceRoot, target.prompt);
  if (!existsSync(promptPath)) {
    return { ok: false, messages: [`missing dispatch prompt: ${target.prompt}`] };
  }
  if (target.agent && !existsSync(join(resourceRoot, "generated", "agents", `${target.agent}.md`))) {
    return { ok: false, messages: [`missing dispatch agent: ${target.agent}`] };
  }
  if (!options.runner) {
    return {
      ok: false,
      messages: [`native Pi dispatch unavailable for ${unit.type}; provide a dispatch runner or Pi subagent bridge`],
    };
  }
  return options.runner({ unit, snapshot, target, env: { GSD_AUDIT: "1" } });
}

export function createCommandDispatchRunner(options: { cwd: string; command?: string }): DispatchRunner {
  return (request) => {
    const command = options.command ?? process.env.PI_GSD_DISPATCH_COMMAND;
    if (!command) return { ok: false, messages: ["PI_GSD_DISPATCH_COMMAND is required for native dispatch"] };
    const args = request.unit.metadata?.args ?? "";
    const payload = JSON.stringify({ unit: request.unit, snapshot: request.snapshot, target: request.target, args });
    const child = spawnSync(command, [], {
      cwd: options.cwd,
      env: { ...process.env, ...request.env, PI_GSD_DISPATCH_REQUEST: payload, PI_GSD_DISPATCH_ARGS: args },
      input: `${payload}\n`,
      shell: true,
      encoding: "utf8",
    });
    const messages = [child.stdout, child.stderr].filter(Boolean).map((part) => part.trim()).filter(Boolean);
    if (child.error) return { ok: false, messages: [`dispatch command failed: ${child.error.message}`, ...messages] };
    if (child.status !== 0) return { ok: false, messages: [`dispatch command exited ${child.status ?? "unknown"}`, ...messages] };
    const parsed = parseDispatchCommandOutput(child.stdout);
    return { ok: true, messages: messages.length ? messages : ["dispatch command completed"], written: parsed.written, outcome: parsed.outcome };
  };
}

export function createDispatchAdapter(options: { cwd: string; resourceRoot?: string; runner?: DispatchRunner }) {
  const runner = options.runner ?? createCommandDispatchRunner({ cwd: options.cwd });
  return (unit: OrchestrationUnit, snapshot: OrchestrationSnapshot): OrchestratorResult => dispatchUnit({ ...options, runner }, unit, snapshot);
}

function parseDispatchCommandOutput(output: string): { written?: string[]; outcome?: OrchestrationOutcome } {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const written = Array.isArray(record.written)
        ? record.written.filter((path): path is string => typeof path === "string")
        : undefined;
      return {
        written,
        outcome: parseOutcome(record.outcome ?? record),
      };
    }
  } catch {
    // Plain-text dispatch output is allowed; it just has no structured artifacts.
  }
  return {};
}

function parseOutcome(value: unknown): OrchestrationOutcome | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : undefined;
  const marker = typeof record.marker === "string" ? record.marker : undefined;
  const verdict = typeof record.verdict === "string" ? record.verdict : undefined;
  const data = parseOutcomeData(record.data);
  if (!status && !marker && !verdict && !data) return undefined;
  return { ...(status ? { status } : {}), ...(marker ? { marker } : {}), ...(verdict ? { verdict } : {}), ...(data ? { data } : {}) };
}

function parseOutcomeData(value: unknown): OrchestrationOutcome["data"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string | number | boolean] => {
      const candidate = entry[1];
      return typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean";
    });
  return entries.length ? Object.fromEntries(entries) : undefined;
}
