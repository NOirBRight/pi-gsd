import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutoOrchestrator } from "../../src/orchestrator/index.js";
import { createJournalAdapter } from "../../src/orchestrator/journal.js";
import { createDispatchAdapter } from "../../src/orchestrator/dispatch.js";

function writeFixture(root: string) {
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, ".planning", "phases", "09-fixture"), { recursive: true });
  writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: true, ui_phase: false, ui_review: false } }), "utf8");
  writeFileSync(join(root, ".planning", "ROADMAP.md"), "| 9. Auto Orchestration Module | v2.0 | 0/0 | Executing | — |\n", "utf8");
  writeFileSync(join(root, ".planning", "STATE.md"), "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (executing)\n", "utf8");
  writeFileSync(join(root, ".planning", "phases", "09-fixture", "09-PLAN-CHECK.md"), "noncanonical plan-like evidence\n", "utf8");
  const promptsDir = join(root, "generated", "prompts");
  const agentsDir = join(root, "generated", "agents");
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  for (const prompt of ["gsd-plan-phase.md", "gsd-plan-review-convergence.md", "gsd-execute-phase.md", "gsd-verify-work.md", "gsd-ship.md"]) {
    writeFileSync(join(promptsDir, prompt), `# ${prompt}\n`, "utf8");
  }
  for (const agent of ["gsd-planner.md", "gsd-executor.md", "gsd-verifier.md"]) {
    writeFileSync(join(agentsDir, agent), `---\nname: ${agent.replace(/\.md$/, "")}\n---\n`, "utf8");
  }
}

describe("orchestrator chain e2e", () => {
  it("completes a fixture Plan -> Execute chain without prompt checklist reminders", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-chain-"));
    writeFixture(cwd);
    const dispatched: string[] = [];
    const orchestrator = createAutoOrchestrator({
      journal: createJournalAdapter({ cwd }),
      dispatch: createDispatchAdapter({
        cwd,
        runner: ({ unit, env }) => {
          dispatched.push(`${unit.type}:${env.GSD_AUDIT}`);
          const phaseDir = join(cwd, ".planning", "phases", "09-fixture");
          const written: string[] = [];
          if (unit.type === "plan") { const path = join(phaseDir, "09-01-PLAN.md"); writeFileSync(path, "plan\n", "utf8"); written.push(path); }
          if (unit.type === "execute") {
            const summary = join(phaseDir, "09-01-SUMMARY.md");
            const verification = join(phaseDir, "09-VERIFICATION.md");
            writeFileSync(summary, "summary\n", "utf8");
            writeFileSync(verification, "---\nstatus: passed\n---\n\n# Verification\n", "utf8");
            written.push(summary, verification);
          }
          return { ok: true, messages: [`dispatched ${unit.type}`], written };
        },
      }),
    });

    const start = orchestrator.start({ phase: "09", mode: "chain", cwd });
    expect(start.ok).toBe(true);

    for (let guard = 0; guard < 10 && orchestrator.getStatus().status === "running"; guard += 1) {
      const result = orchestrator.advance();
      expect(result.ok, result.messages.join("\n")).toBe(true);
    }

    expect(orchestrator.getStatus().status).toBe("completed");
    expect(dispatched).toEqual(["plan:1", "execute:1"]);
    const journal = JSON.parse(readFileSync(join(cwd, ".planning", "orchestration-state.json"), "utf8"));
    expect(journal.snapshot.status).toBe("completed");
    expect(JSON.stringify(journal)).not.toContain("AUTO_MODE_CHECKLIST");
    expect(JSON.stringify(journal)).not.toContain("pi_auto_mode_fidelity");
  });

  it("pauses at execute when verification reports gaps_found", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-chain-gap-"));
    writeFixture(cwd);
    const dispatched: string[] = [];
    const orchestrator = createAutoOrchestrator({
      journal: createJournalAdapter({ cwd }),
      dispatch: createDispatchAdapter({
        cwd,
        runner: ({ unit }) => {
          dispatched.push(unit.type);
          const phaseDir = join(cwd, ".planning", "phases", "09-fixture");
          const written: string[] = [];
          if (unit.type === "plan") { const path = join(phaseDir, "09-01-PLAN.md"); writeFileSync(path, "plan\n", "utf8"); written.push(path); }
          if (unit.type === "execute") {
            const summary = join(phaseDir, "09-01-SUMMARY.md");
            const verification = join(phaseDir, "09-VERIFICATION.md");
            writeFileSync(summary, "summary\n", "utf8");
            writeFileSync(verification, "---\nstatus: gaps_found\n---\n\n# Verification\n", "utf8");
            written.push(summary, verification);
          }
          return { ok: true, messages: [`dispatched ${unit.type}`], written };
        },
      }),
    });

    expect(orchestrator.start({ phase: "09", mode: "chain", cwd }).ok).toBe(true);
    let result = orchestrator.advance();
    for (let guard = 0; guard < 10 && result.ok && orchestrator.getStatus().status === "running"; guard += 1) {
      result = orchestrator.advance();
    }

    expect(result.ok).toBe(false);
    expect(orchestrator.getStatus().status).toBe("paused");
    expect(orchestrator.getStatus().currentUnit?.type).toBe("execute");
    expect(dispatched).toEqual(["plan", "execute"]);
    expect(result.messages.join("\n")).toContain("/gsd-plan-phase 09 --gaps");
  });

  it("pauses at execute when dispatch outcome reports gaps_found", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-chain-structured-gap-"));
    writeFixture(cwd);
    const dispatched: string[] = [];
    const orchestrator = createAutoOrchestrator({
      journal: createJournalAdapter({ cwd }),
      dispatch: createDispatchAdapter({
        cwd,
        runner: ({ unit }) => {
          dispatched.push(unit.type);
          const phaseDir = join(cwd, ".planning", "phases", "09-fixture");
          const written: string[] = [];
          if (unit.type === "plan") { const path = join(phaseDir, "09-01-PLAN.md"); writeFileSync(path, "plan\n", "utf8"); written.push(path); }
          if (unit.type === "execute") {
            const summary = join(phaseDir, "09-01-SUMMARY.md");
            const verification = join(phaseDir, "09-VERIFICATION.md");
            writeFileSync(summary, "summary\n", "utf8");
            writeFileSync(verification, "# Verification\n", "utf8");
            written.push(summary, verification);
            return { ok: true, messages: ["structured verification gap"], written, outcome: { status: "gaps_found" } };
          }
          return { ok: true, messages: [`dispatched ${unit.type}`], written };
        },
      }),
    });

    expect(orchestrator.start({ phase: "09", mode: "chain", cwd }).ok).toBe(true);
    let result = orchestrator.advance();
    for (let guard = 0; guard < 10 && result.ok && orchestrator.getStatus().status === "running"; guard += 1) {
      result = orchestrator.advance();
    }

    expect(result.ok).toBe(false);
    expect(orchestrator.getStatus().status).toBe("paused");
    expect(orchestrator.getStatus().currentUnit?.type).toBe("execute");
    expect(dispatched).toEqual(["plan", "execute"]);
    expect(result.messages.join("\n")).toContain("/gsd-plan-phase 09 --gaps");
  });

  it("does not enqueue standalone plan-check during upstream native chain", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-chain-plan-revision-"));
    writeFixture(cwd);
    writeFileSync(join(cwd, ".planning", "config.json"), JSON.stringify({
      workflow: { skip_discuss: true, research: false, plan_check: true, code_review: false, verifier: true, ui_phase: false, ui_review: false, use_worktrees: false },
    }), "utf8");
    const dispatched: string[] = [];
    const orchestrator = createAutoOrchestrator({
      journal: createJournalAdapter({ cwd }),
      gates: {
        reconcileBeforeDispatch: () => ({ ok: true, gate: "reconcileBeforeDispatch", evidence: ["test-reconciliation-pass"] }),
      },
      dispatch: createDispatchAdapter({
        cwd,
        runner: ({ unit }) => {
          dispatched.push(`${unit.type}:${unit.metadata?.args ?? ""}`);
          const phaseDir = join(cwd, ".planning", "phases", "09-fixture");
          const written: string[] = [];
          if (unit.type === "plan") {
            const path = join(phaseDir, "09-01-PLAN.md");
            writeFileSync(path, `plan ${dispatched.filter((type) => type.startsWith("plan:")).length}\n`, "utf8");
            written.push(path);
          }
          if (unit.type === "execute") {
            const summary = join(phaseDir, "09-01-SUMMARY.md");
            const verification = join(phaseDir, "09-VERIFICATION.md");
            writeFileSync(summary, "summary\n", "utf8");
            writeFileSync(verification, "---\nstatus: passed\n---\n\n# Verification\n", "utf8");
            written.push(summary, verification);
          }
          return { ok: true, messages: [`dispatched ${unit.type}`], written };
        },
      }),
    });

    expect(orchestrator.start({ phase: "09", mode: "chain", cwd }).ok).toBe(true);
    for (let guard = 0; guard < 10 && orchestrator.getStatus().status === "running"; guard += 1) {
      const result = orchestrator.advance();
      expect(result.ok, result.messages.join("\n")).toBe(true);
    }

    expect(orchestrator.getStatus().status).toBe("completed");
    expect(dispatched).toEqual([
      "plan:--auto",
      "execute:--auto --no-transition",
    ]);
  });


  it("pauses before dispatch when native reconciliation reports summary-count-mismatch", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-chain-blocked-"));
    writeFixture(cwd);
    const phaseDir = join(cwd, ".planning", "phases", "09-fixture");
    writeFileSync(join(phaseDir, "09-01-PLAN.md"), "RAW_MARKDOWN_BODY_SHOULD_NOT_PERSIST\n", "utf8");
    writeFileSync(join(cwd, ".planning", "ROADMAP.md"), "| 9. Auto Orchestration Module | v2.0 | 0/1 | Executing | — |\n", "utf8");
    const dispatched: string[] = [];
    const orchestrator = createAutoOrchestrator({
      journal: createJournalAdapter({ cwd }),
      dispatch: createDispatchAdapter({
        cwd,
        runner: ({ unit }) => {
          dispatched.push(unit.type);
          return { ok: true, messages: ["should not dispatch"] };
        },
      }),
    });

    expect(orchestrator.start({ phase: "09", mode: "chain", cwd }).ok).toBe(true);
    const result = orchestrator.advance();

    expect(result.ok).toBe(false);
    expect(dispatched).toEqual([]);
    expect(orchestrator.getStatus().status).toBe("paused");
    expect(orchestrator.getStatus().lastEvent).toEqual(expect.objectContaining({
      reason: "unrepaired-state-drift",
      evidence: expect.arrayContaining([
        "reason:summary-count-mismatch",
        expect.stringContaining("path:"),
      ]),
    }));
  });
});
