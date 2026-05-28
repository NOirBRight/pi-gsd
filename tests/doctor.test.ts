import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { generatePrompts } from "../src/generator.js";
import { runDoctor } from "../src/doctor.js";

describe("runDoctor", () => {
  it("reports success for a generated prompt set matching official commands", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir });

    expect(result.ok).toBe(true);
    expect(result.messages).toContain("official package: @opengsd/get-shit-done-redux@1.2.3");
  });

  it("reports stale generated prompts", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });
    writeFileSync(join(outDir, "gsd-plan-phase.md"), "stale\n", "utf8");

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("stale generated prompt: gsd-plan-phase.md");
  });

  it("reports missing generated prompts", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });
    rmSync(join(outDir, "gsd-plan-phase.md"));

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("missing generated prompt: gsd-plan-phase.md");
  });

  it("reports unexpected generated prompts", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });
    writeFileSync(join(outDir, "gsd-removed-command.md"), "removed\n", "utf8");

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("unexpected generated prompt: gsd-removed-command.md");
  });

  it("reports missing generated prompts when the generated prompt directory is absent", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "missing", "prompts");

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("missing generated prompt: gsd-plan-phase.md");
  });
});
