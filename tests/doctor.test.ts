import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { generateAgents } from "../src/agent-generator.js";
import { syncAgents } from "../src/agent-sync.js";
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

  it("accepts generated prompts that differ only by CRLF line endings", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });
    const promptPath = join(outDir, "gsd-plan-phase.md");
    const prompt = readFileSync(promptPath, "utf8");
    writeFileSync(promptPath, prompt.replace(/\n/g, "\r\n"), "utf8");

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir });

    expect(result.ok).toBe(true);
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

  it("fails when pi-subagents dependency resolution fails", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: outDir,
      piSubagentsResolver: () => {
        throw new Error("not found");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("pi-subagents package: missing (not found)");
  });

  it("reports prompt drift even when pi-subagents dependency resolution fails", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });
    writeFileSync(join(outDir, "gsd-plan-phase.md"), "stale\n", "utf8");

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: outDir,
      piSubagentsResolver: () => {
        throw new Error("not found");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("pi-subagents package: missing (not found)");
    expect(result.messages.join("\n")).toContain("stale generated prompt: gsd-plan-phase.md");
  });

  it("reports success for generated agents and synced project agents", () => {
    const fixture = createOfficialFixture();
    writeFileSync(join(fixture.packageRoot, "agents", "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");
    const promptsDir = join(fixture.root, "generated", "prompts");
    const agentsDir = join(fixture.root, "generated", "agents");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir: promptsDir });
    generateAgents({ officialRoot: fixture.packageRoot, outDir: agentsDir });
    syncAgents({ generatedAgentsDir: agentsDir, cwd: fixture.root, officialRoot: fixture.packageRoot, scope: "project" });

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: promptsDir, generatedAgentsDir: agentsDir });

    expect(result.ok).toBe(true);
    expect(result.messages.join("\n")).toContain("generated agents: ok");
    expect(result.messages.join("\n")).toContain("project synced agents: ok");
  });

  it("reports stale generated agents", () => {
    const fixture = createOfficialFixture();
    writeFileSync(join(fixture.packageRoot, "agents", "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");
    const promptsDir = join(fixture.root, "generated", "prompts");
    const agentsDir = join(fixture.root, "generated", "agents");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir: promptsDir });
    generateAgents({ officialRoot: fixture.packageRoot, outDir: agentsDir });
    writeFileSync(join(agentsDir, "gsd-planner.md"), "stale\n", "utf8");

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: promptsDir, generatedAgentsDir: agentsDir });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("stale generated agent: gsd-planner.md");
  });

  it("reports stale owned project synced agents missing from generated agents", () => {
    const fixture = createOfficialFixture();
    writeFileSync(join(fixture.packageRoot, "agents", "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");
    const promptsDir = join(fixture.root, "generated", "prompts");
    const agentsDir = join(fixture.root, "generated", "agents");
    const targetDir = join(fixture.root, ".pi", "agents");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir: promptsDir });
    generateAgents({ officialRoot: fixture.packageRoot, outDir: agentsDir });
    syncAgents({ generatedAgentsDir: agentsDir, cwd: fixture.root, officialRoot: fixture.packageRoot, scope: "project" });
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "gsd-old.md"), "<!-- pi-gsd generated agent -->\nstale\n", "utf8");

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: promptsDir, generatedAgentsDir: agentsDir });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("project synced agents: stale or missing");
    expect(result.messages.join("\n")).toContain("stale synced agent: gsd-old.md");
  });
});
