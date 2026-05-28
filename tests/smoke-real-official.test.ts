import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAgents } from "../src/agent-generator.js";
import { syncAgents } from "../src/agent-sync.js";
import { generatePrompts } from "../src/generator.js";
import { resolveOfficialPackage } from "../src/official.js";

describe("real official package smoke", () => {
  it("generates one Pi prompt per official command and includes representative modern commands", () => {
    const official = resolveOfficialPackage({ startDir: process.cwd() });
    const tempDir = mkdtempSync(join(tmpdir(), "pi-gsd-smoke-"));
    const outDir = join(tempDir, "prompts");

    try {
      const result = generatePrompts({ officialRoot: official.packageRoot, outDir });
      const officialCommands = readdirSync(official.paths.commandsDir).filter((file) => file.endsWith(".md"));

      expect(result.written.length).toBe(officialCommands.length);
      for (const name of [
        "gsd-new-project.md",
        "gsd-plan-phase.md",
        "gsd-code-review.md",
        "gsd-mvp-phase.md",
        "gsd-surface.md",
      ]) {
        expect(existsSync(join(outDir, name))).toBe(true);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("generates and syncs representative official GSD agents", () => {
    const official = resolveOfficialPackage({ startDir: process.cwd() });
    const tempDir = mkdtempSync(join(tmpdir(), "pi-gsd-agents-smoke-"));
    const outDir = join(tempDir, "agents");

    try {
      const result = generateAgents({ officialRoot: official.packageRoot, outDir });
      const officialAgents = readdirSync(official.paths.agentsDir).filter((file) => file.endsWith(".md"));

      expect(result.written.length).toBe(officialAgents.length);
      for (const name of ["gsd-planner.md", "gsd-executor.md", "gsd-code-reviewer.md", "gsd-debugger.md"]) {
        expect(existsSync(join(outDir, name))).toBe(true);
      }

      const syncRoot = join(tempDir, "project");
      const sync = syncAgents({ generatedAgentsDir: outDir, cwd: syncRoot, officialRoot: official.packageRoot, scope: "project" });
      expect(sync.ok).toBe(true);
      expect(readFileSync(join(syncRoot, ".pi", "agents", "gsd-planner.md"), "utf8")).not.toContain("@~/.claude/get-shit-done");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
