import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
