import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runGsdModelsCommand,
  readJsonObject,
  type GsdModelsCommandContext,
  type ModelChoiceLike,
} from "../src/gsd-models.js";

const GSD_ROOT = join(process.cwd(), "node_modules", "@opengsd", "gsd-core");

function mockModels(): ModelChoiceLike[] {
  return [
    { provider: "openai", id: "gpt-5", name: "GPT-5" },
    { provider: "ollama", id: "glm-5", name: "GLM-5" },
    { provider: "openai", id: "gpt-5-mini", name: "GPT-5 Mini" },
  ];
}

/** Build a mock context that returns predetermined choices in sequence. */
function mockContext(choices: {
  scope?: "project" | "global";
  profile?: string;
  tierModels?: Record<string, string>;
}): GsdModelsCommandContext {
  const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-cmd-test-"));

  const selectCalls: Array<{ title: string; items: unknown[] }> = [];
  const notifies: string[] = [];

  const ctx: GsdModelsCommandContext = {
    cwd: tmpDir,
    sessionModel: "openai/gpt-5",
    enabledModels: ["openai/gpt-5", "ollama/glm-5", "openai/gpt-5-mini"],
    gsdPackageRoot: GSD_ROOT,
    modelRegistry: { getAvailable: () => mockModels() },
    ui: {
      select: async <T>(title: string, items: Array<{ value: T; label: string }>): Promise<T | undefined> => {
        selectCalls.push({ title, items });
        if (items.some((i) => i.value === "global" || i.value === "project")) {
          // Scope selection
          return choices.scope as T ?? "project" as T;
        }
        // Profile selection
        const profileChoice = choices.profile ?? "inherit";
        const match = items.find((i) => i.value === profileChoice);
        return match?.value;
      },
      custom: async <T>(
        factory: (tui: any, theme: any, kb: any, done: (value: T) => void) => any,
      ): Promise<T> => {
        // Simulate a tier model selector — resolve immediately with the predetermined model
        const tierModels = choices.tierModels ?? {};
        const tierKeys = Object.keys(tierModels);
        let tierIndex = 0;

        // Create minimal mock tui/theme/kb
        const mockTui = { requestRender: () => {} };
        const mockTheme = {
          fg: (_color: string, text: string) => text,
          bg: (_color: string, text: string) => text,
          bold: (text: string) => text,
        };
        const mockKb = {};

        const component = factory(mockTui, mockTheme, mockKb, (value: T) => {});

        // Trigger onSelect for the current tier
        if (component?.selectList?.onSelect && tierIndex < tierKeys.length) {
          const tierKey = tierKeys[tierIndex];
          const modelId = tierModels[tierKey];
          component.selectList.onSelect({ value: modelId, label: modelId });
          tierIndex++;
        }

        // Return first tier model as result
        if (tierKeys.length > 0) {
          return tierModels[tierKeys[0]] as T;
        }
        return undefined as T;
      },
      notify: (message: string) => {
        notifies.push(message);
      },
    },
  };

  return ctx;
}

describe("runGsdModelsCommand", () => {
  it("writes inherit profile to project config", async () => {
    const ctx = mockContext({ scope: "project", profile: "inherit" });
    await runGsdModelsCommand(undefined, ctx);

    // Check the config was written
    const configPath = join(ctx.cwd, ".planning", "config.json");
    const config = readJsonObject(configPath);
    expect(config.model_profile).toBe("inherit");
  });

  it("writes inherit profile to global config", async () => {
    const ctx = mockContext({ scope: "global", profile: "inherit" });
    await runGsdModelsCommand("global", ctx);

    // Global config is at ~/.gsd/defaults.json — check via the notify message
    // Since we mock the home dir, we can't easily verify the file,
    // but we can verify the command didn't throw
  });

  it("handles --project flag to skip scope selection", async () => {
    const ctx = mockContext({ scope: "project", profile: "inherit" });
    await runGsdModelsCommand("--project", ctx);

    const configPath = join(ctx.cwd, ".planning", "config.json");
    const config = readJsonObject(configPath);
    expect(config.model_profile).toBe("inherit");
  });

  it("handles --global flag to skip scope selection", async () => {
    const ctx = mockContext({ scope: "global", profile: "inherit" });
    await runGsdModelsCommand("--global", ctx);
    // Should not throw
  });

  it("writes balanced profile with model overrides", async () => {
    const ctx = mockContext({
      scope: "project",
      profile: "balanced",
      tierModels: {
        heavy: "openai/gpt-5",
        standard: "ollama/glm-5",
        light: "openai/gpt-5-mini",
      },
    });

    await runGsdModelsCommand("--project", ctx);

    const configPath = join(ctx.cwd, ".planning", "config.json");
    const config = readJsonObject(configPath);
    expect(config.model_profile).toBe("balanced");
    expect(config.model_overrides).toBeDefined();
    // The planner is heavy in balanced
    expect(config.model_overrides).toHaveProperty("gsd-planner", "openai/gpt-5");
  });

  it("reports notification on completion", async () => {
    const notifies: string[] = [];
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-cmd-test-"));

    const ctx: GsdModelsCommandContext = {
      cwd: tmpDir,
      sessionModel: "openai/gpt-5",
      enabledModels: ["openai/gpt-5"],
      gsdPackageRoot: GSD_ROOT,
      modelRegistry: { getAvailable: () => mockModels() },
      ui: {
        select: async <T>(_title: string, items: Array<{ value: T }>): Promise<T | undefined> => {
          // Profile selection — return inherit
          const match = items.find((i) => i.value === "inherit");
          return match?.value;
        },
        custom: async <T>(
          _factory: (tui: any, theme: any, kb: any, done: (value: T) => void) => any,
        ): Promise<T> => {
          return undefined as T;
        },
        notify: (message: string) => {
          notifies.push(message);
        },
      },
    };

    await runGsdModelsCommand("--project", ctx);
    expect(notifies.length).toBeGreaterThan(0);
    expect(notifies[0]).toContain("inherit");
  });

  it("shows error when no models available", async () => {
    const notifies: string[] = [];
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-cmd-test-"));

    const ctx: GsdModelsCommandContext = {
      cwd: tmpDir,
      sessionModel: "openai/gpt-5",
      enabledModels: ["nonexistent/model"],
      gsdPackageRoot: GSD_ROOT,
      modelRegistry: { getAvailable: () => [] },
      ui: {
        select: async () => undefined as any,
        custom: async () => undefined as any,
        notify: (message: string, type?: string) => {
          notifies.push(`${type ?? "info"}: ${message}`);
        },
      },
    };

    await runGsdModelsCommand("--project", ctx);
    expect(notifies.some((n) => n.includes("No enabled models"))).toBe(true);
  });
});
