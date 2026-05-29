import { mkdirSync, readFileSync, rmSync, writeFileSync, accessSync, constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createOfficialFixture } from "./fixtures.js";
import { generateAgents } from "../src/agent-generator.js";
import { syncAgents } from "../src/agent-sync.js";
import { generatePrompts } from "../src/generator.js";
import { runDoctor, checkPiSubagentsTempAcl } from "../src/doctor.js";

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

describe("checkPiSubagentsTempAcl", () => {
  it("reports 'pi-subagents temp ACL: ok' when dirs exist and are writable", () => {
    const tempRoot = join(tmpdir(), `pi-gsd-test-acl-ok-${process.pid}-${Date.now()}`);
    mkdirSync(tempRoot, { recursive: true });
    for (const subdir of ["async-subagent-results", "async-subagent-runs"]) {
      mkdirSync(join(tempRoot, subdir), { recursive: true });
    }

    try {
      const result = checkPiSubagentsTempAcl({ tempRoot });
      expect(result.messages).toContain("pi-subagents temp ACL: ok");
      expect(result.ok).toBe(true);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports 'CORRUPTED' when accessSync throws EACCES", () => {
    const mockFs = {
      accessSync: () => { throw Object.assign(new Error("EACCES"), { code: "EACCES" }); },
    };
    const result = checkPiSubagentsTempAcl({ fs: mockFs });
    expect(result.messages.join("\n")).toContain("CORRUPTED");
    expect(result.ok).toBe(false);
  });

  it("reports 'CORRUPTED' when accessSync throws EPERM", () => {
    const mockFs = {
      accessSync: () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); },
    };
    const result = checkPiSubagentsTempAcl({ fs: mockFs });
    expect(result.messages.join("\n")).toContain("CORRUPTED");
    expect(result.ok).toBe(false);
  });

  it("doctor continues to report other checks even when ACL check fails (non-blocking)", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const mockCheckAcl = () => ({
      ok: false,
      messages: ["pi-subagents temp ACL: CORRUPTED — test dir is inaccessible"],
    });

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: outDir,
      aclChecker: mockCheckAcl,
    });

    // ACL check failed but other checks still ran
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("CORRUPTED");
    expect(result.messages.join("\n")).toContain("official package:");  // other checks still present
  });

  it("doctor result has ok: false when ACL corruption is detected", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const mockCheckAcl = () => ({
      ok: false,
      messages: ["pi-subagents temp ACL: CORRUPTED — inaccessible"],
    });

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: outDir,
      aclChecker: mockCheckAcl,
    });

    expect(result.ok).toBe(false);
  });
});
