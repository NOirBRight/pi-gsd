import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutoOrchestrator } from "../../src/orchestrator/index.js";
import { createJournalAdapter } from "../../src/orchestrator/journal.js";
import { createDispatchAdapter } from "../../src/orchestrator/dispatch.js";

function writeFixture(root: string) {
  mkdirSync(join(root, ".planning", "phases", "09-fixture"), { recursive: true });
  writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: true, ui_phase: false, ui_review: false } }), "utf8");
  writeFileSync(join(root, ".planning", "ROADMAP.md"), "| 9. Auto Orchestration Module | v2.0 | 3/3 | Complete | 2026-06-01 |\n", "utf8");
  writeFileSync(join(root, ".planning", "STATE.md"), "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (**completed**)\n", "utf8");
  const promptsDir = join(root, "generated", "prompts");
  const agentsDir = join(root, "generated", "agents");
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  for (const prompt of ["gsd-plan-phase.md", "gsd-execute-phase.md", "gsd-verify-work.md", "gsd-ship.md"]) {
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
          if (unit.type === "plan") { const path = join(phaseDir, "09-PLAN.md"); writeFileSync(path, "plan\n", "utf8"); written.push(path); }
          if (unit.type === "execute") { const path = join(phaseDir, "09-SUMMARY.md"); writeFileSync(path, "summary\n", "utf8"); written.push(path); }
          if (unit.type === "verify") { const path = join(phaseDir, "09-VERIFICATION.md"); writeFileSync(path, "verification\n", "utf8"); written.push(path); }
          if (unit.type === "closeout") { written.push(join(cwd, ".planning", "ROADMAP.md"), join(cwd, ".planning", "STATE.md")); }
          return { ok: true, messages: [`dispatched ${unit.type}`], written };
        },
      }),
    });

    const start = orchestrator.start({ phase: "09", mode: "chain", cwd });
    expect(start.ok).toBe(true);

    for (let guard = 0; guard < 10 && orchestrator.getStatus().status === "running"; guard += 1) {
      const result = orchestrator.advance();
      expect(result.ok).toBe(true);
    }

    expect(orchestrator.getStatus().status).toBe("completed");
    expect(dispatched).toEqual(["plan:1", "execute:1", "verify:1", "closeout:1"]);
    const journal = JSON.parse(readFileSync(join(cwd, ".planning", "orchestration-state.json"), "utf8"));
    expect(journal.snapshot.status).toBe("completed");
    expect(JSON.stringify(journal)).not.toContain("AUTO_MODE_CHECKLIST");
    expect(JSON.stringify(journal)).not.toContain("pi_auto_mode_fidelity");
  });
});
