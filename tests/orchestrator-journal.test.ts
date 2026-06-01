import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendJournalEvent, createJournalAdapter, readJournal, redactJournalEvent, writeJournalSnapshot } from "../src/orchestrator/journal.js";
import { writeStateDigestPointer } from "../src/orchestrator/state-digest.js";
import type { OrchestrationSnapshot, OrchestrationUnit, ResolvedWorkflowSettings } from "../src/orchestrator/types.js";

const settings: ResolvedWorkflowSettings = {
  workflow: {
    _auto_chain_active: false,
    auto_advance: false,
    research: true,
    plan_check: true,
    verifier: true,
    ui_phase: false,
    ui_review: false,
    code_review: false,
    skip_discuss: false,
    worktrees: true,
    node_repair: true,
    node_repair_budget: 2,
  },
};

function unit(id = "09:execute"): OrchestrationUnit {
  return { id, type: "execute", status: "running", phase: "09", label: "execute", required: true, source: "default" };
}

function snapshot(currentUnit = unit()): OrchestrationSnapshot {
  return {
    version: 1,
    phase: "09",
    mode: "chain",
    status: "paused",
    currentUnit,
    remainingUnits: [],
    attempt: 1,
    resumeHint: "resume execute",
    settings,
  };
}

describe("orchestrator journal", () => {
  it("writes snapshots to the default sibling journal artifact", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    const result = writeJournalSnapshot({ cwd, snapshot: snapshot(unit("09:plan")) });

    expect(result.ok).toBe(true);
    expect(result.written).toEqual([join(cwd, ".planning", "orchestration-state.json")]);
    expect(existsSync(join(cwd, ".planning", "orchestration-state.json"))).toBe(true);

    const parsed = JSON.parse(readFileSync(join(cwd, ".planning", "orchestration-state.json"), "utf8"));
    expect(parsed).toEqual(expect.objectContaining({ version: 1, snapshot: expect.any(Object), events: [] }));
    expect(parsed.snapshot.currentUnit.id).toBe("09:plan");
  });

  it("appends redacted replayable lifecycle event history", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    const eventTypes = [
      "orchestration_started",
      "settings_resolved",
      "unit_started",
      "gate_passed",
      "gate_failed",
      "retry_scheduled",
      "pause",
      "resume",
      "stop",
      "unit_ended",
    ] as const;

    for (const type of eventTypes) {
      const result = appendJournalEvent({
        cwd,
        snapshot: snapshot(),
        event: {
          type,
          ts: "2026-06-01T00:00:00.000Z",
          phase: "09",
          unitId: "09:execute",
          status: "paused",
          attempt: 1,
          reason: "short reason",
          resumeHint: "resume",
          evidence: ["bounded evidence"],
          prompt: "raw prompt must not persist",
          userText: "raw user text must not persist",
          env: { SECRET: "nope" },
          token: "token-value",
          secret: "secret-value",
          args: ["unbounded"],
        },
      });
      expect(result.ok).toBe(true);
    }

    const journal = readJournal({ cwd });
    expect(journal.ok).toBe(true);
    expect(journal.journal?.events.map((event) => event.type)).toEqual(eventTypes);
    expect(JSON.stringify(journal.journal?.events)).not.toContain("raw prompt");
    expect(JSON.stringify(journal.journal?.events)).not.toContain("raw user text");
    expect(JSON.stringify(journal.journal?.events)).not.toContain("SECRET");
    expect(JSON.stringify(journal.journal?.events)).not.toContain("token-value");
    expect(JSON.stringify(journal.journal?.events)).not.toContain("secret-value");
    expect(JSON.stringify(journal.journal?.events)).not.toContain("unbounded");
  });

  it("redacts secret-looking event evidence", () => {
    const event = redactJournalEvent({ type: "pause", evidence: ["api_key=secret-token", "safe evidence"], resumeHint: "bearer abc123" });

    expect(JSON.stringify(event)).not.toContain("secret-token");
    expect(JSON.stringify(event)).not.toContain("abc123");
    expect(event.evidence).toEqual(["[REDACTED]", "safe evidence"]);
    expect(event.resumeHint).toBe("[REDACTED]");
  });

  it("redacts top-level snapshot resume hints before persisting", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));

    const result = writeJournalSnapshot({ cwd, snapshot: { ...snapshot(), resumeHint: "bearer abc123" } });

    expect(result.ok).toBe(true);
    const serialized = readFileSync(join(cwd, ".planning", "orchestration-state.json"), "utf8");
    expect(serialized).not.toContain("abc123");
    expect(serialized).toContain("[REDACTED]");
  });

  it("redacts unsafe snapshot metadata before persisting", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    const unsafeUnit = { ...unit("09:execute"), metadata: { token: "secret-token", safe: "keep" } };

    const result = writeJournalSnapshot({ cwd, snapshot: snapshot(unsafeUnit) });

    expect(result.ok).toBe(true);
    const serialized = readFileSync(join(cwd, ".planning", "orchestration-state.json"), "utf8");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("token");
    expect(serialized).toContain("safe");
  });

  it("reads the latest unfinished snapshot for resume", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    writeJournalSnapshot({ cwd, snapshot: snapshot(unit("09:verify")) });
    appendJournalEvent({ cwd, snapshot: snapshot(unit("09:verify")), event: { type: "pause", ts: "2026-06-01T00:00:00.000Z", phase: "09", unitId: "09:verify", status: "paused", attempt: 1 } });

    const result = readJournal({ cwd });

    expect(result.ok).toBe(true);
    expect(result.journal?.snapshot.currentUnit?.id).toBe("09:verify");
    expect(result.journal?.events).toHaveLength(1);
  });

  it("refuses to write journal paths outside .planning", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    const result = writeJournalSnapshot({ cwd, journalPath: join(cwd, "outside.json"), snapshot: snapshot() });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("outside .planning");
    expect(existsSync(join(cwd, "outside.json"))).toBe(false);
  });

  it("fails closed instead of overwriting corrupt journals", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    const journalPath = join(cwd, ".planning", "orchestration-state.json");
    mkdirSync(join(cwd, ".planning"), { recursive: true });
    writeFileSync(journalPath, "{ corrupt", "utf8");

    const result = appendJournalEvent({ cwd, snapshot: snapshot(), event: { type: "pause", ts: "2026-06-01T00:00:00.000Z", phase: "09", status: "paused", attempt: 1 } });

    expect(result.ok).toBe(false);
    expect(readFileSync(journalPath, "utf8")).toBe("{ corrupt");
  });

  it("redactJournalEvent removes unsafe fields", () => {
    expect(redactJournalEvent({ type: "pause", prompt: "p", userText: "u", env: {}, token: "t", secret: "s" })).toEqual({ type: "pause" });
  });

  it("creates an adapter bound to a project cwd", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
    const adapter = createJournalAdapter({ cwd });
    const result = adapter.append({ type: "pause", ts: "2026-06-01T00:00:00.000Z", phase: "09", status: "paused", attempt: 0 } as never, snapshot());

    expect(result.ok).toBe(true);
    expect(result.written).toEqual([join(cwd, ".planning", "orchestration-state.json")]);
  });
});

describe("STATE digest pointer", () => {
  it("uses an injected gsd-tools runner instead of editing STATE.md directly", () => {
    const calls: string[][] = [];
    const result = writeStateDigestPointer({
      cwd: mkdtempSync(join(tmpdir(), "pi-gsd-digest-")),
      phase: "09",
      status: "paused",
      currentUnitId: "09:execute",
      journalPath: ".planning/orchestration-state.json",
      resumeHint: "resume execute",
      runner: (command) => {
        calls.push(command);
        return { status: 0, stdout: "ok", stderr: "" };
      },
    });

    expect(result.ok).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toEqual(expect.arrayContaining(["query"]));
    expect(calls[0]).toEqual(expect.arrayContaining([expect.stringContaining("state")]));
  });

  it("returns a structured skip when the state handler is unsupported", () => {
    const result = writeStateDigestPointer({
      cwd: mkdtempSync(join(tmpdir(), "pi-gsd-digest-")),
      phase: "09",
      status: "paused",
      currentUnitId: "09:execute",
      journalPath: ".planning/orchestration-state.json",
      resumeHint: "resume execute",
      runner: () => ({ status: 1, stdout: "", stderr: "unknown query" }),
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("STATE digest pointer skipped");
  });

  it("passes only bounded digest fields to the state handler", () => {
    const calls: string[][] = [];
    writeStateDigestPointer({
      cwd: mkdtempSync(join(tmpdir(), "pi-gsd-digest-")),
      phase: "09",
      status: "paused",
      currentUnitId: "09:execute",
      journalPath: ".planning/orchestration-state.json",
      resumeHint: "resume execute",
      runner: (command) => {
        calls.push(command);
        return { status: 0, stdout: "ok", stderr: "" };
      },
    });

    const serialized = calls.flat().join(" ");
    expect(serialized).toContain("09");
    expect(serialized).toContain("paused");
    expect(serialized).toContain("09:execute");
    expect(serialized).toContain(".planning/orchestration-state.json");
    expect(serialized).toContain("resume execute");
    expect(serialized).not.toContain("orchestration_started");
    expect(serialized).not.toContain("unit_ended");
  });
});
