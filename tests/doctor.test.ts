import { mkdirSync, readFileSync, rmSync, writeFileSync, accessSync, constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createOfficialFixture } from "./fixtures.js";
import { generateAgents } from "../src/agent-generator.js";
import { syncAgents } from "../src/agent-sync.js";
import { generateAll, generatePrompts, generateWorkflows } from "../src/generator.js";
import { runDoctor, checkPiSubagentsTempAcl } from "../src/doctor.js";

describe("runDoctor", () => {
  it("fails on dispatch-critical Tool Contract drift but only warns for prose drift", () => {
    const fixture = createOfficialFixture();
    writeFileSync(join(fixture.packageRoot, "agents", "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans phases\ntools: bash, edit\n---\nBody\n", "utf8");
    const promptsDir = join(fixture.root, "generated", "prompts");
    const agentsDir = join(fixture.root, "generated", "agents");
    generateAll({ officialRoot: fixture.packageRoot, promptsDir, agentsDir, safeRoot: fixture.root });
    const snapshotPath = join(fixture.root, "generated", "tool-contracts.json");
    const original = readFileSync(snapshotPath, "utf8");

    writeFileSync(join(promptsDir, "gsd-plan-phase.md"), "# Plan Phase changed prose\n", "utf8");
    const prose = runDoctor({ startDir: fixture.root, generatedPromptsDir: promptsDir, generatedAgentsDir: agentsDir, aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }) });
    expect(prose.messages.join("\n")).toContain("tool contracts: warning");

    writeFileSync(snapshotPath, original, "utf8");
    writeFileSync(join(agentsDir, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans phases\ntools: bash\n---\nBody\n", "utf8");
    const critical = runDoctor({ startDir: fixture.root, generatedPromptsDir: promptsDir, generatedAgentsDir: agentsDir, aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }) });
    expect(critical.ok).toBe(false);
    expect(critical.messages.join("\n")).toContain("tool contracts: invalid");
  });

  it("reports success for a generated prompt set matching official commands", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generateAll({ officialRoot: fixture.packageRoot, promptsDir: outDir, agentsDir: join(fixture.root, "generated", "agents"), safeRoot: fixture.root });

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir, aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }) });

    expect(result.ok).toBe(true);
    expect(result.messages).toContain("official package: @opengsd/gsd-core@1.2.3");
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
    generateAll({ officialRoot: fixture.packageRoot, promptsDir: outDir, agentsDir: join(fixture.root, "generated", "agents"), safeRoot: fixture.root });
    const promptPath = join(outDir, "gsd-plan-phase.md");
    const prompt = readFileSync(promptPath, "utf8");
    writeFileSync(promptPath, prompt.replace(/\n/g, "\r\n"), "utf8");

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: outDir, aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }) });

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

  it("reports stale generated workflows", () => {
    const fixture = createOfficialFixture();
    const promptsDir = join(fixture.root, "generated", "prompts");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    writeFileSync(join(fixture.packageRoot, "get-shit-done", "workflows", "plan.md"), "# Plan\n", "utf8");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir: promptsDir });
    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir });
    writeFileSync(join(workflowsDir, "workflows", "plan.md"), "stale\n", "utf8");

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: promptsDir,
      generatedWorkflowsDir: workflowsDir,
      aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("stale generated workflow: workflows/plan.md");
  });

  it("reports generated workflow dispatch syntax drift", () => {
    const fixture = createOfficialFixture();
    const promptsDir = join(fixture.root, "generated", "prompts");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    const agentsDir = join(fixture.root, "generated", "agents");
    writeFileSync(join(fixture.packageRoot, "get-shit-done", "workflows", "chain.md"), "# Chain\n", "utf8");
    generateAll({ officialRoot: fixture.packageRoot, promptsDir, agentsDir, safeRoot: fixture.root });
    writeFileSync(
      join(workflowsDir, "workflows", "chain.md"),
      '# Chain\nSkill("gsd-plan-phase", args="${PHASE} --auto")\n',
      "utf8",
    );

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: promptsDir,
      generatedAgentsDir: agentsDir,
      generatedWorkflowsDir: workflowsDir,
      aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("dispatch syntax drift");
    expect(result.messages.join("\n")).toContain("workflows/chain.md");
  });

  it("reports stale generated official version metadata", () => {
    const fixture = createOfficialFixture();
    const promptsDir = join(fixture.root, "generated", "prompts");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir: promptsDir });
    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir });
    writeFileSync(join(fixture.root, "generated", ".official-version.json"), JSON.stringify({
      packageName: "@opengsd/gsd-core",
      version: "0.0.0",
    }), "utf8");

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: promptsDir,
      generatedWorkflowsDir: workflowsDir,
      aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("generated official version stale");
  });

  it("reports missing generated official version metadata", () => {
    const fixture = createOfficialFixture();
    const promptsDir = join(fixture.root, "generated", "prompts");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir: promptsDir });
    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir });

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: promptsDir,
      generatedWorkflowsDir: workflowsDir,
      aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("generated official version: missing");
  });

  it("reports official workflow config schema parity gaps", () => {
    const fixture = createOfficialFixture();
    const promptsDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir: promptsDir });
    writeFileSync(
      join(fixture.packageRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json"),
      JSON.stringify({
        validKeys: ["workflow.research", "workflow.plan_check"],
      }),
      "utf8",
    );

    const result = runDoctor({
      startDir: fixture.root,
      generatedPromptsDir: promptsDir,
      aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("official config schema parity: missing workflow keys");
    expect(result.messages.join("\n")).toContain("workflow.code_review");
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
    generateAll({ officialRoot: fixture.packageRoot, promptsDir, agentsDir, safeRoot: fixture.root });
    syncAgents({ generatedAgentsDir: agentsDir, cwd: fixture.root, officialRoot: fixture.packageRoot, scope: "project" });

    const result = runDoctor({ startDir: fixture.root, generatedPromptsDir: promptsDir, generatedAgentsDir: agentsDir, aclChecker: () => ({ ok: true, messages: ["pi-subagents temp ACL: ok"] }) });

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

  it("reports ok:false when temp directory is missing (ENOENT)", () => {
    const mockFs = {
      accessSync: () => {
        const err = new Error("ENOENT: no such file or directory") as Error & { code: string };
        err.code = "ENOENT";
        throw err;
      },
    };
    const result = checkPiSubagentsTempAcl({ tempRoot: "/tmp/test", fs: mockFs });
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("MISSING");
  });

  it("escapes username with special characters in PowerShell repair command", () => {
    const originalUsername = process.env.USERNAME;
    process.env.USERNAME = "user with spaces & special <chars>";
    try {
      const mockFs = {
        accessSync: () => {
          const err = new Error("EACCES: permission denied") as Error & { code: string };
          err.code = "EACCES";
          throw err;
        },
      };
      const result = checkPiSubagentsTempAcl({ tempRoot: "/tmp/test", fs: mockFs });
      expect(result.ok).toBe(false);
      // The username in the repair command should be single-quoted in PowerShell
      expect(result.messages.join("\n")).toContain("'user with spaces & special <chars>'");
    } finally {
      process.env.USERNAME = originalUsername;
    }
  });

  it("escapes embedded single quotes in username for PowerShell", () => {
    const originalUsername = process.env.USERNAME;
    process.env.USERNAME = "O'Brien";
    try {
      const mockFs = {
        accessSync: () => {
          const err = new Error("EACCES: permission denied") as Error & { code: string };
          err.code = "EACCES";
          throw err;
        },
      };
      const result = checkPiSubagentsTempAcl({ tempRoot: "/tmp/test", fs: mockFs });
      expect(result.ok).toBe(false);
      // Embedded single quotes should be doubled per PowerShell escaping rules
      expect(result.messages.join("\n")).toContain("'O''Brien'");
    } finally {
      process.env.USERNAME = originalUsername;
    }
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
