import { accessSync, constants as fsConstants, mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rewriteMessageForRuntime, guardPiSubagentsTempDirs, buildPiSubagentsTempRoot, TEMP_DIR_SUBDIRS } from "../src/extension.js";
import piGsdExtension from "../src/extension.js";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe("piGsdExtension message rewriting", () => {
  it("rewrites assistant next-step slash commands", () => {
    const message = {
      role: "assistant",
      content: "Next: /gsd:plan-phase 1, then /gsd:complete-milestone",
    };

    expect(rewriteMessageForRuntime(message, "/pkg/root")).toEqual({
      role: "assistant",
      content: "Next: /gsd-plan-phase 1, then /gsd-complete-milestone",
    });
  });

  it("rewrites text blocks without changing the role", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: "Run /gsd:complete-milestone" },
        { type: "image", source: "unchanged" },
      ],
    };

    expect(rewriteMessageForRuntime(message, "/pkg/root")).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Run /gsd-complete-milestone" },
        { type: "image", source: "unchanged" },
      ],
    });
  });
});

describe("piGsdExtension command registration", () => {
  it("does not shadow generated GSD prompt commands", () => {
    const commands: Record<string, any> = {};
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn((name: string, options: unknown) => {
        commands[name] = options;
      }),
      registerTool: vi.fn(),
    };

    piGsdExtension(pi as never);

    expect(commands["gsd-plan-phase"]).toBeUndefined();
    expect(commands["gsd-execute-phase"]).toBeUndefined();
    expect(commands["gsd-verify-work"]).toBeUndefined();
    expect(commands["gsd-ship"]).toBeUndefined();
    expect(pi.on).toHaveBeenCalledWith("input", expect.any(Function));
  });

  it("continues normal GSD slash prompts and does not claim native handoff without a dispatch bridge", () => {
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };
    piGsdExtension(pi as never);
    const inputHandler = pi.on.mock.calls.find(([name]) => name === "input")?.[1] as (event: unknown, ctx: { cwd: string; ui: { notify: (...args: unknown[]) => void } }) => unknown;
    const ctx = { cwd: writeNativeDispatchFixture(), ui: { notify: vi.fn() } };

    expect(inputHandler({ text: "/gsd-execute-phase 09" }, ctx)).toEqual({ action: "continue" });
    expect(inputHandler({ text: "/gsd-execute-phase 09 --auto" }, ctx)).toEqual({ action: "continue" });
    expect(inputHandler({ text: "/gsd-discuss-phase 09 --chain" }, ctx)).toEqual({ action: "continue" });
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("handles native auto/chain input when a dispatch bridge is configured", () => {
    const oldDispatchCommand = process.env.PI_GSD_DISPATCH_COMMAND;
    process.env.PI_GSD_DISPATCH_COMMAND = "node -e \"process.stdin.resume()\"";
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };
    piGsdExtension(pi as never);
    const inputHandler = pi.on.mock.calls.find(([name]) => name === "input")?.[1] as (event: unknown, ctx: { cwd: string; ui: { notify: (...args: unknown[]) => void } }) => unknown;
    const ctx = { cwd: writeNativeDispatchFixture(), ui: { notify: vi.fn() } };

    try {
      expect(inputHandler({ text: "/gsd-execute-phase 09 --auto" }, ctx)).toEqual({ action: "handled" });
      expect(ctx.ui.notify).toHaveBeenCalled();
    } finally {
      if (oldDispatchCommand === undefined) delete process.env.PI_GSD_DISPATCH_COMMAND;
      else process.env.PI_GSD_DISPATCH_COMMAND = oldDispatchCommand;
    }
  });

  it("registers the gsd-models command", () => {
    const commands: Record<string, unknown> = {};
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn((name: string, options: unknown) => {
        commands[name] = options;
      }),
      registerTool: vi.fn(),
    };

    piGsdExtension(pi as never);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "gsd-models",
      expect.objectContaining({ description: expect.stringContaining("GSD model") }),
    );
    expect(commands["gsd-models"]).toBeTruthy();
    expect(typeof (commands["gsd-models"] as any).handler).toBe("function");
  });

  it("injects concise settings context only for GSD-related context hook messages", () => {
    const fixtureRoot = join(tmpdir(), `pi-gsd-extension-settings-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const packageRoot = join(fixtureRoot, "node_modules", "@opengsd", "gsd-core");
    mkdirSync(join(packageRoot, "commands", "gsd"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "workflows"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "references"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "templates"), { recursive: true });
    mkdirSync(join(packageRoot, "agents"), { recursive: true });
    mkdirSync(join(packageRoot, "hooks"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "bin", "shared"), { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@opengsd/gsd-core", version: "1.2.3" }), "utf8");
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"), "module.exports = {};\n", "utf8");
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "shared", "config-defaults.manifest.json"), JSON.stringify({ workflow: { research: true, plan_check: true, verifier: true, code_review: true, ui_phase: true, ui_safety_gate: true, ui_review: true, code_review_depth: "standard", code_review_command: null, plan_review_convergence: false, max_discuss_passes: 3, plan_bounce: false, plan_bounce_passes: 2, post_planning_gaps: true, security_enforcement: true, nyquist_validation: true, ai_integration_phase: true, auto_prune_state: false, research_before_questions: false, skip_discuss: false, use_worktrees: true, node_repair: true, node_repair_budget: 2, subagent_timeout: 300000, inline_plan_threshold: 1, _auto_chain_active: false, auto_advance: false } }), "utf8");
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json"), JSON.stringify({ validKeys: ["workflow.research", "workflow.plan_check", "workflow.verifier", "workflow.code_review", "workflow.nyquist_validation", "workflow.ai_integration_phase", "workflow.ui_phase", "workflow.ui_safety_gate", "workflow.ui_review", "workflow.code_review_depth", "workflow.code_review_command", "workflow.auto_advance", "workflow.node_repair", "workflow.node_repair_budget", "workflow.research_before_questions", "workflow.skip_discuss", "workflow.auto_prune_state", "workflow.use_worktrees", "workflow.plan_bounce", "workflow.plan_bounce_passes", "workflow.plan_review_convergence", "workflow.post_planning_gaps", "workflow.security_enforcement", "workflow.subagent_timeout", "workflow.inline_plan_threshold", "workflow._auto_chain_active"] }), "utf8");
    mkdirSync(join(fixtureRoot, ".planning"), { recursive: true });
    writeFileSync(join(fixtureRoot, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: true }, model_profile: "balanced" }), "utf8");

    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };
    piGsdExtension(pi as never);
    const contextHandler = pi.on.mock.calls.find(([name]) => name === "context")?.[1] as (event: { messages: unknown[] }, ctx: { cwd: string; ui: { notify: (...args: unknown[]) => void } }) => unknown;

    const gsdResult = contextHandler({ messages: [{ role: "user", content: "Run /gsd-plan-phase 12 --chain" }] }, { cwd: fixtureRoot, ui: { notify: vi.fn() } });
    const gsdMessages = (gsdResult as { messages: unknown[] }).messages;
    const gsdText = JSON.stringify(gsdMessages);
    expect(gsdText).toContain("## GSD Settings");
    expect(gsdText).toContain("profile: balanced");
    expect(gsdText).not.toContain("\"workflow\":{"); // no raw config JSON

    const unrelatedResult = contextHandler({ messages: [{ role: "user", content: "Tell me a joke" }] }, { cwd: fixtureRoot, ui: { notify: vi.fn() } });
    const unrelatedText = JSON.stringify((unrelatedResult as { messages: unknown[] }).messages);
    expect(unrelatedText).not.toContain("## GSD Settings");
    expect(unrelatedText).not.toContain("profile: balanced");

    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("does not reuse settings context across different cwd values", () => {
    const firstRoot = writeSettingsContextFixture("balanced");
    const secondRoot = writeSettingsContextFixture("quality");
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };
    piGsdExtension(pi as never);
    const contextHandler = pi.on.mock.calls.find(([name]) => name === "context")?.[1] as (event: { messages: unknown[] }, ctx: { cwd: string; ui: { notify: (...args: unknown[]) => void } }) => unknown;

    try {
      const first = contextHandler({ messages: [{ role: "user", content: "Run /gsd-plan-phase 12" }] }, { cwd: firstRoot, ui: { notify: vi.fn() } }) as { messages: unknown[] };
      const second = contextHandler({ messages: [{ role: "user", content: "Run /gsd-plan-phase 12" }] }, { cwd: secondRoot, ui: { notify: vi.fn() } }) as { messages: unknown[] };

      expect(JSON.stringify(first.messages)).toContain("profile: balanced");
      expect(JSON.stringify(second.messages)).toContain("profile: quality");
      expect(JSON.stringify(second.messages)).not.toContain("profile: balanced");
    } finally {
      rmSync(firstRoot, { recursive: true, force: true });
      rmSync(secondRoot, { recursive: true, force: true });
    }
  });

  it("blocks native auto dispatch and warns on settings parse failure", () => {
    const fixtureRoot = join(tmpdir(), `pi-gsd-extension-parse-fail-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const packageRoot = join(fixtureRoot, "node_modules", "@opengsd", "gsd-core");
    mkdirSync(join(packageRoot, "commands", "gsd"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "workflows"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "references"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "templates"), { recursive: true });
    mkdirSync(join(packageRoot, "agents"), { recursive: true });
    mkdirSync(join(packageRoot, "hooks"), { recursive: true });
    mkdirSync(join(packageRoot, "get-shit-done", "bin", "shared"), { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@opengsd/gsd-core", version: "1.2.3" }), "utf8");
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"), "module.exports = {};\n", "utf8");
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "shared", "config-defaults.manifest.json"), JSON.stringify({ workflow: { research: true, plan_check: true, verifier: true, code_review: true, ui_phase: true, ui_safety_gate: true, ui_review: true, code_review_depth: "standard", code_review_command: null, plan_review_convergence: false, max_discuss_passes: 3, plan_bounce: false, plan_bounce_passes: 2, post_planning_gaps: true, security_enforcement: true, nyquist_validation: true, ai_integration_phase: true, auto_prune_state: false, research_before_questions: false, skip_discuss: false, use_worktrees: true, node_repair: true, node_repair_budget: 2, subagent_timeout: 300000, inline_plan_threshold: 1, _auto_chain_active: false, auto_advance: false } }), "utf8");
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json"), JSON.stringify({ validKeys: ["workflow.research", "workflow.plan_check", "workflow.verifier", "workflow.code_review", "workflow.nyquist_validation", "workflow.ai_integration_phase", "workflow.ui_phase", "workflow.ui_safety_gate", "workflow.ui_review", "workflow.code_review_depth", "workflow.code_review_command", "workflow.auto_advance", "workflow.node_repair", "workflow.node_repair_budget", "workflow.research_before_questions", "workflow.skip_discuss", "workflow.auto_prune_state", "workflow.use_worktrees", "workflow.plan_bounce", "workflow.plan_bounce_passes", "workflow.plan_review_convergence", "workflow.post_planning_gaps", "workflow.security_enforcement", "workflow.subagent_timeout", "workflow.inline_plan_threshold", "workflow._auto_chain_active"] }), "utf8");
    mkdirSync(join(fixtureRoot, ".planning"), { recursive: true });
    writeFileSync(join(fixtureRoot, ".planning", "config.json"), "{not valid json", "utf8");
    mkdirSync(join(fixtureRoot, "generated", "prompts"), { recursive: true });
    writeFileSync(join(fixtureRoot, "generated", "prompts", "gsd-execute-phase.md"), "# execute\n", "utf8");
    writeFileSync(join(fixtureRoot, ".planning", "ROADMAP.md"), "| 12. Phase | v1.0 | 0/0 | Executing | — |\n", "utf8");
    writeFileSync(join(fixtureRoot, ".planning", "STATE.md"), "## Current Position\n\nPhase: 12 — Test (executing)\n", "utf8");

    const oldDispatchCommand = process.env.PI_GSD_DISPATCH_COMMAND;
    process.env.PI_GSD_DISPATCH_COMMAND = "node -e \"process.stdin.resume()\"";

    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };
    piGsdExtension(pi as never);
    const inputHandler = pi.on.mock.calls.find(([name]) => name === "input")?.[1] as (event: unknown, ctx: { cwd: string; ui: { notify: (...args: unknown[]) => void } }) => unknown;
    const sessionStart = pi.on.mock.calls.find(([name]) => name === "session_start")?.[1] as (event: unknown, ctx: { cwd: string; ui: { notify: (...args: unknown[]) => void } }) => unknown;
    const ctx = { cwd: fixtureRoot, ui: { notify: vi.fn() } };

    try {
      // session_start: warning notification for parse failure
      sessionStart({}, ctx);
      expect((ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.some(([message]) => typeof message === "string" && /parse/i.test(message))).toBe(true);

      // Native auto command: blocked, returns handled, no orchestrator dispatched
      const result = inputHandler({ text: "/gsd-execute-phase 12 --auto" }, ctx);
      expect(result).toEqual({ action: "handled" });
      // Notify was called with warning (parse failure), but no orchestrator result messages
      const notifyCalls = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
      const hasOrchestratorError = notifyCalls.some(([message]) => typeof message === "string" && /Invalid phase|orchestrator/i.test(message));
      expect(hasOrchestratorError).toBe(false);

      // Unrelated non-GSD input: still continues normally
      const continueResult = inputHandler({ text: "hello" }, ctx);
      expect(continueResult).toEqual({ action: "continue" });
    } finally {
      if (oldDispatchCommand === undefined) delete process.env.PI_GSD_DISPATCH_COMMAND;
      else process.env.PI_GSD_DISPATCH_COMMAND = oldDispatchCommand;
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

function writeSettingsContextFixture(modelProfile: string) {
  const root = join(tmpdir(), `pi-gsd-extension-settings-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const packageRoot = join(root, "node_modules", "@opengsd", "gsd-core");
  mkdirSync(join(packageRoot, "commands", "gsd"), { recursive: true });
  mkdirSync(join(packageRoot, "get-shit-done", "workflows"), { recursive: true });
  mkdirSync(join(packageRoot, "get-shit-done", "references"), { recursive: true });
  mkdirSync(join(packageRoot, "get-shit-done", "templates"), { recursive: true });
  mkdirSync(join(packageRoot, "agents"), { recursive: true });
  mkdirSync(join(packageRoot, "hooks"), { recursive: true });
  mkdirSync(join(packageRoot, "get-shit-done", "bin", "shared"), { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@opengsd/gsd-core", version: "1.2.3" }), "utf8");
  writeFileSync(join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"), "module.exports = {};\n", "utf8");
  writeFileSync(join(packageRoot, "get-shit-done", "bin", "shared", "config-defaults.manifest.json"), JSON.stringify({ workflow: {} }), "utf8");
  writeFileSync(join(packageRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json"), JSON.stringify({ validKeys: [] }), "utf8");
  mkdirSync(join(root, ".planning"), { recursive: true });
  writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: true }, model_profile: modelProfile }), "utf8");
  return root;
}

function writeNativeDispatchFixture() {
  const root = join(tmpdir(), `pi-gsd-extension-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(root, ".planning", "phases", "09-fixture"), { recursive: true });
  mkdirSync(join(root, "generated", "prompts"), { recursive: true });
  mkdirSync(join(root, "generated", "agents"), { recursive: true });
  writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { skip_discuss: true, research: false, plan_check: false, code_review: false, verifier: false, ui_phase: false, ui_review: false } }), "utf8");
  writeFileSync(join(root, ".planning", "ROADMAP.md"), "| 9. Auto Orchestration Module | v2.0 | 0/0 | Executing | — |\n", "utf8");
  writeFileSync(join(root, ".planning", "STATE.md"), "## Current Position\n\nPhase: 9 — Auto Orchestration Native Module (executing)\n", "utf8");
  writeFileSync(join(root, "generated", "prompts", "gsd-execute-phase.md"), "# execute\n", "utf8");
  writeFileSync(join(root, "generated", "agents", "gsd-executor.md"), "---\nname: gsd-executor\n---\n", "utf8");
  return root;
}

describe("guardPiSubagentsTempDirs", () => {
  let tempRoot: string;

  beforeEach(() => {
    // Create a fresh temp root for each test
    tempRoot = join(tmpdir(), `pi-subagents-test-${process.pid}-${Date.now()}`);
    mkdirSync(tempRoot, { recursive: true });
    // Reset the global flag before each test
    delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
  });

  afterEach(() => {
    // Clean up test temp dirs
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
    delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
  });

  it("returns without error when temp dirs exist and are accessible", () => {
    // Pre-create the subdirectories so they're accessible
    for (const subdir of TEMP_DIR_SUBDIRS) {
      mkdirSync(join(tempRoot, subdir), { recursive: true });
    }

    // Should not throw
    expect(() => guardPiSubagentsTempDirs({ tempRoot })).not.toThrow();
    // Should NOT set the broken flag
    expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBeUndefined();
  });

  it("attempts rmSync+mkdirSync when accessSync fails on a temp dir", () => {
    // Create a subdirectory that exists but we'll make inaccessible by removing it
    // and creating a scenario where access fails
    // We can't easily make a dir inaccessible on CI, but we CAN test the repair
    // path by starting with dirs that DON'T exist (so accessSync fails)
    // and verifying guardPiSubagentsTempDirs creates them successfully

    // Don't create subdirectories — accessSync will fail on missing dirs
    // but the guard should attempt mkdirSync which succeeds
    expect(() => guardPiSubagentsTempDirs({ tempRoot })).not.toThrow();

    // After guard runs, directories should exist
    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join(tempRoot, subdir);
      expect(() => accessSync(dirPath, fsConstants.R_OK | fsConstants.W_OK)).not.toThrow();
    }

    // Should NOT set the broken flag since mkdir succeeded
    expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBeUndefined();
  });

  it("sets globalThis.__piSubagentsTempAclBroken when rmSync and mkdirSync both fail", () => {
    // Create an inaccessible scenario by using a fake fs that always fails
    // We test this by passing an options object with overridden fs methods
    const mockFs = {
      accessSync: () => { throw Object.assign(new Error("EACCES"), { code: "EACCES" }); },
      rmSync: () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); },
      mkdirSync: () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); },
    };

    expect(() => guardPiSubagentsTempDirs({ tempRoot, fs: mockFs })).not.toThrow();
    expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBe(true);
  });

  it("does not throw when ACL repair fails (best-effort, never crashes Pi)", () => {
    const mockFs = {
      accessSync: () => { throw Object.assign(new Error("EACCES"), { code: "EACCES" }); },
      rmSync: () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); },
      mkdirSync: () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); },
    };

    // Must NOT throw even when everything fails
    expect(() => guardPiSubagentsTempDirs({ tempRoot, fs: mockFs })).not.toThrow();
  });
});

describe("buildPiSubagentsTempRoot", () => {
  it("returns a path containing pi-subagents-user-", () => {
    const result = buildPiSubagentsTempRoot();
    expect(result).toContain("pi-subagents-user-");
  });

  it("returns a path under os.tmpdir()", () => {
    const result = buildPiSubagentsTempRoot();
    expect(result).toContain(tmpdir());
  });
});

describe("TEMP_DIR_SUBDIRS", () => {
  it("contains async-subagent-results and async-subagent-runs", () => {
    expect(TEMP_DIR_SUBDIRS).toContain("async-subagent-results");
    expect(TEMP_DIR_SUBDIRS).toContain("async-subagent-runs");
  });
});
