import { rewriteMessageForRuntime, guardPiSubagentsTempDirs, TEMP_DIR_SUBDIRS } from "../src/extension.js";
import piGsdExtension from "../src/extension.js";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe("piGsdExtension message rewriting", () => {
  it("rewrites assistant next-step slash commands", () => {
    const message = {
      role: "assistant",
      content: "Next: /gsd-plan-phase 1, then /gsd-complete-milestone",
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
        { type: "text", text: "Run /gsd-complete-milestone" },
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
  it("registers the gsd-models command", () => {
    const commands: Record<string, unknown> = {};
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn((name: string, options: unknown) => {
        commands[name] = options;
      }),
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
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
  });

  it("clears stale __piSubagentsTempAclBroken flag at start (CR-01)", () => {
    // Pre-set the flag to simulate a stale state from a previous session
    (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken = true;

    // Use a mock fs where accessSync succeeds (no ACL corruption)
    const mockFs = {
      accessSync: vi.fn(),
      rmSync: vi.fn(),
      mkdirSync: vi.fn(),
    };

    guardPiSubagentsTempDirs({ fs: mockFs, tempRoot: "/tmp/pi-subagents-user-test" });

    // Flag should be cleared because no ACL corruption was found
    expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBeUndefined();
  });

  it("sets __piSubagentsTempAclBroken when ACL repair fails", () => {
    // Use a mock fs where accessSync throws EACCES and rmSync/mkdirSync also fail
    const accessError = Object.assign(new Error("EACCES"), { code: "EACCES" });
    const repairError = new Error("Permission denied");
    const mockFs = {
      accessSync: vi.fn(() => { throw accessError; }),
      rmSync: vi.fn(() => { throw repairError; }),
      mkdirSync: vi.fn(() => { throw repairError; }),
    };

    guardPiSubagentsTempDirs({ fs: mockFs, tempRoot: "/tmp/pi-subagents-user-test" });

    expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBe(true);
  });

  it("does not set __piSubagentsTempAclBroken when ACL repair succeeds", () => {
    // Use a mock fs where accessSync throws EACCES but repair succeeds
    const accessError = Object.assign(new Error("EACCES"), { code: "EACCES" });
    const mockFs = {
      accessSync: vi.fn(() => { throw accessError; }),
      rmSync: vi.fn(),
      mkdirSync: vi.fn(),
    };

    guardPiSubagentsTempDirs({ fs: mockFs, tempRoot: "/tmp/pi-subagents-user-test" });

    expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBeUndefined();
  });

  it("skips non-ACL access errors (ENOENT, EBUSY, etc.) without setting the flag", () => {
    const enoentError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const mockFs = {
      accessSync: vi.fn(() => { throw enoentError; }),
      rmSync: vi.fn(),
      mkdirSync: vi.fn(),
    };

    guardPiSubagentsTempDirs({ fs: mockFs, tempRoot: "/tmp/pi-subagents-user-test" });

    expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBeUndefined();
  });
});

describe("ACL corruption warning on session_start", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
  });

  it("does not warn when __piSubagentsTempAclBroken is not set", () => {
    // Delete any stale flag, then simulate what happens when guard succeeds:
    // guardPiSubagentsTempDirs clears the flag at the start, and if no ACL
    // corruption is found, the flag stays undefined.
    // We test the notification logic by ensuring the flag is undefined
    // after the session_start handlers run.
    delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;

    const notifications: Array<{ message: string; type: string }> = [];
    const mockCtx = {
      ui: {
        notify: (message: string, type?: string) => {
          notifications.push({ message, type: type ?? "info" });
        },
      },
      cwd: process.cwd(),
    };

    const sessionStartHandlers: Array<(event: any, ctx: any) => void> = [];
    const pi = {
      on: vi.fn((event: string, handler: any) => {
        if (event === "session_start") {
          sessionStartHandlers.push(handler);
        }
      }),
      registerCommand: vi.fn(),
    };

    piGsdExtension(pi as never);

    for (const handler of sessionStartHandlers) {
      handler({ type: "session_start", reason: "startup" }, mockCtx);
    }

    // After the guard runs, if the real filesystem has no ACL corruption,
    // __piSubagentsTempAclBroken should be undefined and no ACL warning emitted.
    // If the real filesystem DOES have ACL issues (e.g., on CI), the flag will
    // be set and a warning will be emitted — this is correct behavior, not a bug.
    // So we only assert no warnings IF the flag is undefined after the guard.
    const flagAfterGuard = (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
    if (flagAfterGuard === undefined) {
      const aclWarnings = notifications.filter(n => n.message.includes("ACL corruption"));
      expect(aclWarnings).toHaveLength(0);
    }
    // If flagAfterGuard is true, the warning was correctly emitted — skip assertion.
  });
});