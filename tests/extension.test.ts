import { rewriteMessageForRuntime } from "../src/extension.js";
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



describe("ACL corruption warning on session_start", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
  });

  it("warns user via notify when __piSubagentsTempAclBroken is set", () => {
    // Set the ACL broken flag
    (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken = true;

    // Capture notifications
    const notifications: Array<{ message: string; type: string }> = [];
    const mockCtx = {
      ui: {
        notify: (message: string, type?: string) => {
          notifications.push({ message, type: type ?? "info" });
        },
      },
      cwd: process.cwd(),
    };

    // Find the session_start handler
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

    // Simulate session_start event
    for (const handler of sessionStartHandlers) {
      handler({ type: "session_start", reason: "startup" }, mockCtx);
    }

    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("ACL corruption"),
          type: "warning",
        }),
      ]),
    );

    delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
  });

  it("does not warn when __piSubagentsTempAclBroken is not set", () => {
    // Ensure flag is not set
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

    const aclWarnings = notifications.filter(n => n.message.includes("ACL corruption"));
    expect(aclWarnings).toHaveLength(0);
  });
});
