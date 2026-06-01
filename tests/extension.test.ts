import { accessSync, constants as fsConstants, mkdirSync, rmSync } from "node:fs";
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

  it("continues normal GSD slash prompts and handles only native auto/chain input", () => {
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };
    piGsdExtension(pi as never);
    const inputHandler = pi.on.mock.calls.find(([name]) => name === "input")?.[1] as (event: unknown, ctx: { cwd: string; ui: { notify: (...args: unknown[]) => void } }) => unknown;
    const ctx = { cwd: process.cwd(), ui: { notify: vi.fn() } };

    expect(inputHandler({ text: "/gsd-execute-phase 09" }, ctx)).toEqual({ action: "continue" });
    expect(inputHandler({ text: "/gsd-execute-phase 09 --auto" }, ctx)).toEqual({ action: "handled" });
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("PI_GSD_DISPATCH_COMMAND"), "warning");
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
});

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
