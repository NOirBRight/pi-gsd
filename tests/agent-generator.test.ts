import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { generateAgents } from "../src/agent-generator.js";

describe("generateAgents", () => {
  it("generates Pi-compatible agent files from official agents", () => {
    const fixture = createOfficialFixture();
    writeFileSync(join(fixture.packageRoot, "agents", "gsd-planner.md"), `---
name: gsd-planner
description: Creates plans
tools: Read, Write, Bash, Glob, Grep
---

@~/.claude/get-shit-done/references/mandatory-initial-read.md
`, "utf8");
    const outDir = join(fixture.root, "generated", "agents");

    const result = generateAgents({ officialRoot: fixture.packageRoot, outDir });

    const generated = join(outDir, "gsd-planner.md");
    expect(result.written).toEqual([generated]);
    expect(existsSync(generated)).toBe(true);
    expect(readFileSync(generated, "utf8")).toContain("tools: read, write, bash, find, grep");
    expect(readFileSync(generated, "utf8")).toContain("@__PI_GSD_OFFICIAL_ROOT__/get-shit-done/references/mandatory-initial-read.md");
  });

  it("removes stale generated agents before writing", () => {
    const fixture = createOfficialFixture();
    writeFileSync(join(fixture.packageRoot, "agents", "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Creates plans\n---\nBody\n", "utf8");
    const outDir = join(fixture.root, "generated", "agents");

    generateAgents({ officialRoot: fixture.packageRoot, outDir });
    writeFileSync(join(outDir, "stale.md"), "stale\n", "utf8");
    generateAgents({ officialRoot: fixture.packageRoot, outDir });

    expect(existsSync(join(outDir, "stale.md"))).toBe(false);
  });

  it("rejects fixture root output before deleting official agent sources", () => {
    const fixture = createOfficialFixture();
    const sourceAgent = writePlannerAgent(fixture.packageRoot);

    expect(() => generateAgents({ officialRoot: fixture.packageRoot, outDir: fixture.root })).toThrow(
      "Unsafe output directory",
    );
    expect(existsSync(sourceAgent)).toBe(true);
  });

  it("rejects official package root output before deleting official agent sources", () => {
    const fixture = createOfficialFixture();
    const sourceAgent = writePlannerAgent(fixture.packageRoot);

    expect(() => generateAgents({ officialRoot: fixture.packageRoot, outDir: fixture.packageRoot })).toThrow(
      "Unsafe output directory",
    );
    expect(existsSync(sourceAgent)).toBe(true);
  });

  it("rejects output inside official package root before deleting official agent sources", () => {
    const fixture = createOfficialFixture();
    const sourceAgent = writePlannerAgent(fixture.packageRoot);

    expect(() => generateAgents({ officialRoot: fixture.packageRoot, outDir: join(fixture.packageRoot, "generated", "agents") })).toThrow(
      "Unsafe output directory",
    );
    expect(existsSync(sourceAgent)).toBe(true);
  });

  it("rejects explicit safe root output even when official package root is elsewhere", () => {
    const fixture = createOfficialFixture();
    writePlannerAgent(fixture.packageRoot);
    const safeRoot = join(fixture.root, "project");
    mkdirSync(safeRoot);
    const marker = join(safeRoot, "keep.txt");
    writeFileSync(marker, "keep\n", "utf8");

    expect(() => generateAgents({ officialRoot: fixture.packageRoot, outDir: safeRoot, safeRoot })).toThrow(
      "Unsafe output directory",
    );
    expect(existsSync(marker)).toBe(true);
  });

  it("rejects an existing nonempty non-generated directory under safe root before deleting", () => {
    const fixture = createOfficialFixture();
    writePlannerAgent(fixture.packageRoot);
    const outDir = join(fixture.root, "tests");
    const marker = join(outDir, "keep.test.ts");
    mkdirSync(outDir);
    writeFileSync(marker, "export const keep = true;\n", "utf8");

    expect(() => generateAgents({ officialRoot: fixture.packageRoot, outDir, safeRoot: fixture.root })).toThrow(
      /unsafe output directory/i,
    );
    expect(readFileSync(marker, "utf8")).toBe("export const keep = true;\n");
  });

  it("rewrites subagent_type=\"general-purpose\" to subagent_type=\"general\" in generated agents", () => {
    const fixture = createOfficialFixture();
    writeFileSync(
      join(fixture.packageRoot, "agents", "gsd-advisor.md"),
      '---\nname: gsd-advisor\ndescription: Advisor agent\ntools: Read\n---\n\nsubagent_type="general-purpose"\n',
      "utf8",
    );
    const outDir = join(fixture.root, "generated", "agents");

    generateAgents({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-advisor.md"), "utf8");
    expect(generated).toContain('subagent_type="general"');
    expect(generated).not.toContain('general-purpose');
  });

  it("rewrites Agent(subagent_type=...) to subagent({agent: ..., task: ...}) in generated agents", () => {
    const fixture = createOfficialFixture();
    writeFileSync(
      join(fixture.packageRoot, "agents", "gsd-orchestrator.md"),
      '---\nname: gsd-orchestrator\ndescription: Orchestrates\ntools: Read, Bash\n---\n\nAgent(subagent_type="gsd-executor", prompt="Run the plan")\n',
      "utf8",
    );
    const outDir = join(fixture.root, "generated", "agents");

    generateAgents({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-orchestrator.md"), "utf8");
    expect(generated).toContain('subagent({agent: "gsd-executor", task: "Run the plan"})');
    expect(generated).not.toContain('Agent(subagent_type=');
  });
});

function writePlannerAgent(packageRoot: string) {
  const sourceAgent = join(packageRoot, "agents", "gsd-planner.md");
  writeFileSync(sourceAgent, "---\nname: gsd-planner\ndescription: Creates plans\n---\nBody\n", "utf8");
  return sourceAgent;
}
