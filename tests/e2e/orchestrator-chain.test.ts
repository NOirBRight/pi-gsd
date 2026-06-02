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
  it("completes a fixture Plan -> Execute -> Verify -> Closeout chain without prompt checklist reminders", () => {
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
          if (unit.type === "execute") { const path = join(phaseDir, "09-01-SUMMARY.md"); writeFileSync(path, "summary\n", "utf8"); written.push(path); }
          if (unit.type === "verify") { const path = join(phaseDir, "09-VERIFICATION.md"); writeFileSync(path, "---\nstatus: passed\n---\n\n# Verification\n", "utf8"); written.push(path); }
          if (unit.type === "closeout") {
            writeFileSync(join(cwd, ".planning", "ROADMAP.md"), "| 9. Auto Orchestration Module | v2.0 | 1/1 | Complete | 2026-06-01 |\n", "utf8");
            writeFileSync(join(cwd, ".planning", "STATE.md"), "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
            written.push(join(cwd, ".planning", "ROADMAP.md"), join(cwd, ".planning", "STATE.md"));
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
    expect(dispatched).toEqual(["plan:1", "execute:1", "verify:1", "closeout:1"]);
    const journal = JSON.parse(readFileSync(join(cwd, ".planning", "orchestration-state.json"), "utf8"));
    expect(journal.snapshot.status).toBe("completed");
    expect(JSON.stringify(journal)).not.toContain("AUTO_MODE_CHECKLIST");
    expect(JSON.stringify(journal)).not.toContain("pi_auto_mode_fidelity");
  });

  it("pauses before closeout when verification reports gaps_found", () => {
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
          if (unit.type === "execute") { const path = join(phaseDir, "09-01-SUMMARY.md"); writeFileSync(path, "summary\n", "utf8"); written.push(path); }
          if (unit.type === "verify") { const path = join(phaseDir, "09-VERIFICATION.md"); writeFileSync(path, "---\nstatus: gaps_found\n---\n\n# Verification\n", "utf8"); written.push(path); }
          if (unit.type === "closeout") throw new Error("closeout must not run with verification gaps");
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
    expect(orchestrator.getStatus().currentUnit?.type).toBe("verify");
    expect(dispatched).toEqual(["plan", "execute", "verify"]);
    expect(result.messages.join("\n")).toContain("/gsd-plan-phase 09 --gaps");
  });

  it("pauses before closeout when dispatch outcome reports gaps_found", () => {
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
          if (unit.type === "execute") { const path = join(phaseDir, "09-01-SUMMARY.md"); writeFileSync(path, "summary\n", "utf8"); written.push(path); }
          if (unit.type === "verify") { const path = join(phaseDir, "09-VERIFICATION.md"); writeFileSync(path, "# Verification\n", "utf8"); written.push(path); return { ok: true, messages: ["structured verification gap"], written, outcome: { status: "gaps_found" } }; }
          if (unit.type === "closeout") throw new Error("closeout must not run with structured verification gaps");
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
    expect(orchestrator.getStatus().currentUnit?.type).toBe("verify");
    expect(dispatched).toEqual(["plan", "execute", "verify"]);
    expect(result.messages.join("\n")).toContain("/gsd-plan-phase 09 --gaps");
  });

  it("revises plans through checker issues before continuing the chain", () => {
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
          if (unit.type === "plan-check" && dispatched.filter((type) => type.startsWith("plan-check:")).length < 2) {
            return { ok: true, messages: ["## ISSUES FOUND\n- tighten scope"], written, outcome: { marker: "issues_found" } };
          }
          if (unit.type === "plan-check") return { ok: true, messages: ["## VERIFICATION PASSED"], written, outcome: { marker: "verification_passed" } };
          if (unit.type === "execute") { const path = join(phaseDir, "09-01-SUMMARY.md"); writeFileSync(path, "summary\n", "utf8"); written.push(path); }
          if (unit.type === "verify") { const path = join(phaseDir, "09-VERIFICATION.md"); writeFileSync(path, "---\nstatus: passed\n---\n\n# Verification\n", "utf8"); written.push(path); }
          if (unit.type === "closeout") {
            writeFileSync(join(cwd, ".planning", "ROADMAP.md"), "| 9. Auto Orchestration Module | v2.0 | 1/1 | Complete | 2026-06-01 |\n", "utf8");
            writeFileSync(join(cwd, ".planning", "STATE.md"), "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
            written.push(join(cwd, ".planning", "ROADMAP.md"), join(cwd, ".planning", "STATE.md"));
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
      "plan-check:",
      "plan:--auto --revision",
      "plan-check:",
      "execute:--auto --no-transition",
      "verify:",
      "closeout:",
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
