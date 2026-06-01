import type { GateName, GateResult, OrchestrationUnit } from "../src/orchestrator/types.js";
import { runPostDispatchGate } from "../src/orchestrator/gates.js";
import { advanceOrchestration, startOrchestration } from "../src/orchestrator/state-machine.js";
import { advance, createAutoOrchestrator, getStatus, resume, start, stop } from "../src/orchestrator/index.js";
import { createDispatchAdapter, resolveUnitDispatchTarget } from "../src/orchestrator/dispatch.js";
import { createNativeAutoHandoff, detectNativeAutoTrigger } from "../src/orchestrator/trigger.js";
import { createJournalAdapter, writeJournalSnapshot } from "../src/orchestrator/journal.js";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
      postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }),
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

  it("emits unit-start, per-gate pass, and completion lifecycle events", () => {
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")] });
    const result = advanceOrchestration(snapshot, {
      gates: {
        reconcileBeforeDispatch: pass("reconcileBeforeDispatch", []),
        decideDispatch: pass("decideDispatch", []),
        validateToolContract: pass("validateToolContract", []),
        prepareUnitRoot: pass("prepareUnitRoot", []),
        persistRuntimeState: pass("persistRuntimeState", []),
      },
      dispatch: () => ({ ok: true, messages: ["dispatched"] }),
      postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }),
    });

    expect(result.events?.map((event) => event.type)).toEqual([
      "unit_started",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "gate_passed",
      "unit_ended",
      "orchestration_completed",
    ]);
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
    const result = advanceOrchestration(snapshot, { dispatch: () => ({ ok: true, messages: ["dispatched"] }), postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }) });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.currentUnit?.type).toBe("execute");
    expect(result.snapshot?.remainingUnits).toEqual([]);
    expect(result.snapshot?.lastEvent?.unitId).toBe("09:plan");
  });
});

describe("artifact gates", () => {
  it("requires exact completed roadmap and state closeout evidence", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-closeout-gate-"));
    const phaseDir = join(cwd, ".planning", "phases", "09-fixture");
    mkdirSync(phaseDir, { recursive: true });
    const roadmapPath = join(cwd, ".planning", "ROADMAP.md");
    const statePath = join(cwd, ".planning", "STATE.md");
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("closeout")], cwd });

    writeFileSync(roadmapPath, "| 9. Auto Orchestration Module | v2.0 | 3/3 | Not complete | — |\n", "utf8");
    writeFileSync(statePath, "## Current Position\n\nPhase: 9 — Auto Orchestration Module (not completed)\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [roadmapPath, statePath] }).ok).toBe(false);

    writeFileSync(roadmapPath, "| 9. Auto Orchestration Module | v2.0 | 3/3 | Complete | 2026-06-01 |\n", "utf8");
    writeFileSync(statePath, "## Current Position\n\nPhase: 10 — State Reconciliation (planning)\n\n## Accumulated Context\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [roadmapPath, statePath] }).ok).toBe(false);

    writeFileSync(statePath, "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
    expect(runPostDispatchGate(snapshot, unit("closeout"), { cwd, written: [".planning/ROADMAP.md", ".planning/STATE.md"] }).ok).toBe(true);
  });

  it("rejects stale artifacts when dispatch reports no current written paths", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-stale-artifact-"));
    mkdirSync(join(cwd, ".planning", "phases", "09-fixture"), { recursive: true });
    writeFileSync(join(cwd, ".planning", "phases", "09-fixture", "09-SUMMARY.md"), "stale\n", "utf8");
    const snapshot = startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("execute")], cwd });

    const result = runPostDispatchGate(snapshot, unit("execute"), { cwd });

    expect(result.ok).toBe(false);
    expect(result.evidence).toEqual(["missing:09-*-SUMMARY.md"]);
  });
});

describe("Unit dispatch target", () => {
  it("maps every dispatchable unit target to generated prompts and agents", () => {
    const types: OrchestrationUnit["type"][] = ["discuss", "research", "plan", "plan-check", "execute", "code-review", "settings-gate", "ui-safety-gate", "security-review", "nyquist-validation", "ai-integration", "ui-review", "verify", "closeout"];

    for (const type of types) {
      const target = resolveUnitDispatchTarget(unit(type));
      expect(existsSync(join(process.cwd(), target.prompt)), `${type} prompt ${target.prompt}`).toBe(true);
      if (target.agent) expect(existsSync(join(process.cwd(), "generated", "agents", `${target.agent}.md`)), `${type} agent ${target.agent}`).toBe(true);
    }
  });

  it("validates dispatch resources from resourceRoot while using project cwd for execution", () => {
    const projectCwd = mkdtempSync(join(tmpdir(), "pi-gsd-project-no-generated-"));
    const resourceRoot = mkdtempSync(join(tmpdir(), "pi-gsd-resource-root-"));
    mkdirSync(join(resourceRoot, "generated", "prompts"), { recursive: true });
    mkdirSync(join(resourceRoot, "generated", "agents"), { recursive: true });
    writeFileSync(join(resourceRoot, "generated", "prompts", "gsd-plan-phase.md"), "prompt body", "utf8");
    writeFileSync(join(resourceRoot, "generated", "agents", "gsd-planner.md"), "agent body", "utf8");
    const adapter = createDispatchAdapter({ cwd: projectCwd, resourceRoot, runner: () => ({ ok: true, messages: ["ran"] }) });

    const result = adapter(unit("plan"), startOrchestration({ phase: "09", mode: "chain", settings, units: [unit("plan")], cwd: projectCwd }));

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectCwd, "generated"))).toBe(false);
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

  it("rejects invalid native handoff phase ids", () => {
    const handoff = createNativeAutoHandoff({ cwd: "/project", createOrchestrator: () => { throw new Error("should not create orchestrator"); } });

    const result = handoff("/gsd-plan-phase ../../x --chain");

    expect(result?.ok).toBe(false);
    expect(result?.messages.join("\n")).toContain("Invalid phase");
  });

  it("creates native handoff without relying on checklist prompt compliance", () => {
    const starts: unknown[] = [];
    const handoff = createNativeAutoHandoff({ cwd: "/project", createOrchestrator: () => ({ start: (ctx) => { starts.push(ctx); return { ok: true, messages: ["started"] }; }, advance: () => ({ ok: true, messages: [] }), resume: () => ({ ok: true, messages: [] }), stop: () => ({ ok: true, messages: [] }), getStatus: () => ({ status: "completed", remainingUnits: [], attempt: 0 }) }) });

    const result = handoff("/gsd-plan-phase 09 --chain");

    expect(result?.ok).toBe(true);
    expect(starts).toEqual([expect.objectContaining({ phase: "09", mode: "chain", cwd: "/project", startAt: "plan" })]);
  });

  it("uses the invoked native command as the first orchestration unit", () => {
    const starts: unknown[] = [];
    const handoff = createNativeAutoHandoff({ cwd: "/project", createOrchestrator: () => ({ start: (ctx) => { starts.push(ctx); return { ok: true, messages: ["started"] }; }, advance: () => ({ ok: true, messages: [] }), resume: () => ({ ok: true, messages: [] }), stop: () => ({ ok: true, messages: [] }), getStatus: () => ({ status: "completed", remainingUnits: [], attempt: 0 }) }) });

    expect(handoff("/gsd-execute-phase 09 --auto")?.ok).toBe(true);
    expect(handoff("/gsd-verify-work 09 --auto")?.ok).toBe(true);
    expect(handoff("/gsd-ship 09 --auto")?.ok).toBe(true);

    expect(starts).toEqual([
      expect.objectContaining({ startAt: "execute" }),
      expect.objectContaining({ startAt: "verify" }),
      expect.objectContaining({ startAt: "closeout" }),
    ]);
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
    expect(typeof advance().ok).toBe("boolean");
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

    expect(typeof result.ok).toBe("boolean");
    expect(orchestrator.getStatus().remainingUnits.length).toBeLessThanOrEqual(before);
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
