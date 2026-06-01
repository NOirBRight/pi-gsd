import type { GateName, GateResult, OrchestrationUnit } from "../src/orchestrator/types.js";
import { advanceOrchestration, startOrchestration } from "../src/orchestrator/state-machine.js";
import { advance, createAutoOrchestrator, getStatus, resume, start, stop } from "../src/orchestrator/index.js";
import { createDispatchAdapter, resolveUnitDispatchTarget } from "../src/orchestrator/dispatch.js";
import { createNativeAutoHandoff, detectNativeAutoTrigger } from "../src/orchestrator/trigger.js";
import { createJournalAdapter, writeJournalSnapshot } from "../src/orchestrator/journal.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function unit(type: OrchestrationUnit["type"], phase = "09"): OrchestrationUnit {
  return { id: `${phase}:${type}`, type, status: "pending", phase, label: type, required: true, source: "default" };
}

const settings = {
  workflow: {
    research: true,
    plan_check: true,
    verifier: true,
    ui_phase: true,
    ui_review: true,
    code_review: true,
    auto_advance: false,
    worktrees: true,
    node_repair: true,
    node_repair_budget: 2,
    skip_discuss: false,
    _auto_chain_active: false,
  },
};

describe("orchestrator state machine", () => {
  it("calls gates in exact ORCH-02 pre-dispatch order", () => {
    const calls: GateName[] = [];
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")] });

    const result = advanceOrchestration(snapshot, {
      gates: {
        reconcileBeforeDispatch: pass("reconcileBeforeDispatch", calls),
        decideDispatch: pass("decideDispatch", calls),
        validateToolContract: pass("validateToolContract", calls),
        prepareUnitRoot: pass("prepareUnitRoot", calls),
        persistRuntimeState: pass("persistRuntimeState", calls),
      },
      dispatch: () => ({ ok: true, messages: ["dispatched"] }),
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["reconcileBeforeDispatch", "decideDispatch", "validateToolContract", "prepareUnitRoot", "persistRuntimeState"]);
  });

  it("uses node repair budget for retryable gate failures then pauses", () => {
    let snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("execute")] });
    const gate = () => ({ ok: false, gate: "prepareUnitRoot", reason: "gate-failed", retryable: true, resumeHint: "repair root" }) satisfies GateResult;

    const first = advanceOrchestration(snapshot, { gates: { prepareUnitRoot: gate } });
    expect(first.snapshot?.status).toBe("running");
    expect(first.snapshot?.attempt).toBe(1);
    snapshot = first.snapshot!;

    const second = advanceOrchestration(snapshot, { gates: { prepareUnitRoot: gate } });
    expect(second.snapshot?.status).toBe("running");
    expect(second.snapshot?.attempt).toBe(2);
    snapshot = second.snapshot!;

    const third = advanceOrchestration(snapshot, { gates: { prepareUnitRoot: gate } });
    expect(third.ok).toBe(false);
    expect(third.snapshot?.status).toBe("paused");
    expect(third.snapshot?.attempt).toBe(2);
    expect(third.snapshot?.lastEvent?.reason).toBe("retry-budget-exhausted");
  });

  it("post-dispatch artifact gate failure prevents advancing and records evidence", () => {
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("execute"), unit("verify")] });
    const result = advanceOrchestration(snapshot, {
      dispatch: () => ({ ok: true, messages: ["dispatched"] }),
      postDispatchGate: () => ({ ok: false, gate: "artifact", reason: "gate-failed", retryable: false, resumeHint: "create SUMMARY.md", evidence: ["missing SUMMARY"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.snapshot?.status).toBe("paused");
    expect(result.snapshot?.currentUnit?.type).toBe("execute");
    expect(result.snapshot?.remainingUnits.map((u) => u.type)).toEqual(["verify"]);
    expect(result.snapshot?.lastEvent?.evidence).toEqual(["missing SUMMARY"]);
  });

  it("successful transition completes current unit and advances to next unit", () => {
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan"), unit("execute")] });
    const result = advanceOrchestration(snapshot, { dispatch: () => ({ ok: true, messages: ["dispatched"] }) });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.currentUnit?.type).toBe("execute");
    expect(result.snapshot?.remainingUnits).toEqual([]);
    expect(result.snapshot?.lastEvent?.unitId).toBe("09:plan");
  });
});

describe("Unit dispatch target", () => {
  it("maps production Plan/Execute/Verify/Closeout targets to generated agents and prompts", () => {
    expect(resolveUnitDispatchTarget(unit("plan"))).toEqual(expect.objectContaining({ agent: "gsd-planner", prompt: expect.stringContaining("gsd-plan-phase.md") }));
    expect(resolveUnitDispatchTarget(unit("execute"))).toEqual(expect.objectContaining({ agent: "gsd-executor", prompt: expect.stringContaining("gsd-execute-phase.md") }));
    expect(resolveUnitDispatchTarget(unit("verify"))).toEqual(expect.objectContaining({ agent: "gsd-verifier", prompt: expect.stringContaining("gsd-verify-work.md") }));
    expect(resolveUnitDispatchTarget(unit("closeout"))).toEqual(expect.objectContaining({ agent: undefined, prompt: expect.stringContaining("gsd-ship.md") }));
  });

  it("dispatch adapter sends typed Unit payloads with scoped GSD_AUDIT and no raw prompt text", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-dispatch-"));
    mkdirSync(join(cwd, "generated", "prompts"), { recursive: true });
    mkdirSync(join(cwd, "generated", "agents"), { recursive: true });
    for (const prompt of ["gsd-plan-phase.md", "gsd-execute-phase.md", "gsd-verify-work.md", "gsd-ship.md"]) writeFileSync(join(cwd, "generated", "prompts", prompt), "prompt body", "utf8");
    for (const agent of ["gsd-planner.md", "gsd-executor.md", "gsd-verifier.md"]) writeFileSync(join(cwd, "generated", "agents", agent), "agent body", "utf8");
    const calls: unknown[] = [];
    const adapter = createDispatchAdapter({ cwd, runner: (request) => { calls.push(request); return { ok: true, messages: ["ran"] }; } });

    const result = adapter(unit("plan"), startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")] }));

    expect(result.ok).toBe(true);
    expect(calls).toEqual([expect.objectContaining({ unit: expect.objectContaining({ type: "plan" }), env: expect.objectContaining({ GSD_AUDIT: "1" }) })]);
    expect(JSON.stringify(calls)).not.toContain("prompt body");
    expect(JSON.stringify(calls)).not.toContain("GSD_AUDIT_ARGS");
  });
});

describe("native auto trigger", () => {
  it("detects supported slash-command text and starts native orchestration", () => {
    expect(detectNativeAutoTrigger("/gsd-plan-phase 09 --chain")).toEqual(expect.objectContaining({ command: "gsd-plan-phase", phase: "09", mode: "chain" }));
    expect(detectNativeAutoTrigger("/gsd-execute-phase 09 --auto")).toEqual(expect.objectContaining({ command: "gsd-execute-phase", phase: "09", mode: "auto" }));
  });

  it("creates native handoff without relying on checklist prompt compliance", () => {
    const starts: unknown[] = [];
    const handoff = createNativeAutoHandoff({ cwd: "/project", createOrchestrator: () => ({ start: (ctx) => { starts.push(ctx); return { ok: true, messages: ["started"] }; }, advance: () => ({ ok: true, messages: [] }), resume: () => ({ ok: true, messages: [] }), stop: () => ({ ok: true, messages: [] }), getStatus: () => ({ status: "completed", remainingUnits: [], attempt: 0 }) }) });

    const result = handoff("/gsd-plan-phase 09 --chain");

    expect(result?.ok).toBe(true);
    expect(starts).toEqual([expect.objectContaining({ phase: "09", mode: "chain", cwd: "/project" })]);
  });
});

describe("orchestrator facade", () => {
  it("starts and returns status fields", () => {
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("plan"), unit("execute")] }),
    });

    const result = orchestrator.start({ phase: "09", mode: "chain" });

    expect(result.ok).toBe(true);
    expect(result.status).toEqual(expect.objectContaining({
      currentUnit: expect.objectContaining({ type: "plan" }),
      remainingUnits: [expect.objectContaining({ type: "execute" })],
      attempt: 0,
      lastEvent: expect.any(Object),
      resumeHint: undefined,
    }));
  });

  it("module facade methods exist and delegate without printing", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(start({ phase: "09", mode: "chain" }).ok).toBe(true);
    expect(advance().ok).toBe(true);
    expect(resume().ok).toBe(true);
    expect(stop("done").ok).toBe(true);
    expect(getStatus()).toEqual(expect.objectContaining({ remainingUnits: expect.any(Array) }));
    expect(log).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();

    log.mockRestore();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("injects workflow-step Unit metadata into dispatch without raw prompt text", () => {
    const received: OrchestrationUnit[] = [];
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("plan"), unit("execute")] }),
      dispatch: (dispatchUnit) => {
        received.push(dispatchUnit);
        return { ok: true, messages: ["ok"] };
      },
    });

    orchestrator.start({ phase: "09", mode: "chain" });
    const before = orchestrator.getStatus().remainingUnits.length;
    const result = orchestrator.advance();

    expect(result.ok).toBe(true);
    expect(orchestrator.getStatus().remainingUnits.length).toBeLessThan(before);
    expect(received).toEqual([expect.objectContaining({ type: "plan", id: "09:plan" })]);
    expect(JSON.stringify(received)).not.toContain("prompt");
    expect(JSON.stringify(received)).not.toContain("tool-turn");
  });

  it("journals start lifecycle events and exposes D-18 status", () => {
    const events: string[] = [];
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("plan"), unit("execute")] }),
      journal: { append: (event, snapshot) => { events.push(event.type); return { ok: true, messages: ["journaled"], snapshot }; } },
    });

    const result = orchestrator.start({ phase: "09", mode: "chain" });

    expect(result.ok).toBe(true);
    expect(events).toEqual(["orchestration_started", "settings_resolved"]);
    expect(orchestrator.getStatus()).toEqual(expect.objectContaining({
      currentUnit: expect.objectContaining({ type: "plan" }),
      remainingUnits: [expect.objectContaining({ type: "execute" })],
      attempt: 0,
      lastEvent: expect.objectContaining({ type: "settings_resolved" }),
      resumeHint: undefined,
    }));
  });

  it("journals gate failure and pause with resume hint", () => {
    const events: string[] = [];
    const orchestrator = createAutoOrchestrator({
      settingsResolver: () => settings,
      queueBuilder: () => ({ decision: "dispatch", settings, units: [unit("execute")] }),
      journal: { append: (event, snapshot) => { events.push(event.type); return { ok: true, messages: ["journaled"], snapshot }; } },
      gates: {
        prepareUnitRoot: () => ({ ok: false, gate: "prepareUnitRoot", reason: "gate-failed", retryable: false, resumeHint: "repair root" }),
      },
    });

    orchestrator.start({ phase: "09", mode: "chain" });
    const result = orchestrator.advance();

    expect(result.ok).toBe(false);
    expect(events).toEqual(expect.arrayContaining(["gate_failed", "pause"]));
    expect(orchestrator.getStatus().status).toBe("paused");
    expect(orchestrator.getStatus().resumeHint).toBe("repair root");
  });

  it("resumes from the latest unfinished journal snapshot", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-resume-"));
    const unfinished = { ...unit("verify"), id: "09:verify" };
    const resumeSettings = { ...settings, workflow: { ...settings.workflow, verifier: false } };
    const persisted = startOrchestration({ phase: "09", mode: "chain", settings: resumeSettings, units: [unfinished, unit("closeout")] });
    writeJournalSnapshot({ cwd, snapshot: { ...persisted, status: "paused", currentUnit: unfinished, resumeHint: "resume verify" } });
    const dispatched: OrchestrationUnit[] = [];

    const orchestrator = createAutoOrchestrator({
      journal: createJournalAdapter({ cwd }),
      dispatch: (dispatchUnit) => {
        dispatched.push(dispatchUnit);
        return { ok: true, messages: ["dispatched"] };
      },
    });

    const resumeResult = orchestrator.resume();
    const advanceResult = orchestrator.advance();

    expect(resumeResult.ok).toBe(true);
    expect(advanceResult.ok).toBe(true);
    expect(dispatched).toEqual([expect.objectContaining({ id: "09:verify" })]);
  });
});

function pass(gate: GateName, calls: GateName[]) {
  return () => {
    calls.push(gate);
    return { ok: true, gate, evidence: [gate] } satisfies GateResult;
  };
}
