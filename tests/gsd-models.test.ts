import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildBalancedModelOverrides,
  formatModelChoiceLabel,
  mergeGsdModelConfig,
  readJsonObject,
  resolveGsdConfigPath,
  writeJsonObject,
} from "../src/gsd-models.js";

describe("resolveGsdConfigPath", () => {
  it("resolves project scope to .planning/config.json", () => {
    const path = resolveGsdConfigPath({ scope: "project", cwd: join(tmpdir(), "repo") });
    expect(path).toBe(join(tmpdir(), "repo", ".planning", "config.json"));
  });

  it("resolves user scope to ~/.gsd/defaults.json", () => {
    const path = resolveGsdConfigPath({ scope: "user", cwd: "/repo", homeDir: join(tmpdir(), "home") });
    expect(path).toBe(join(tmpdir(), "home", ".gsd", "defaults.json"));
  });

  it("falls back to os.homedir() when homeDir not provided", () => {
    const path = resolveGsdConfigPath({ scope: "user", cwd: "/repo" });
    expect(path).toContain("defaults.json");
    expect(path).toMatch(/[\/\\].gsd[\/\\]/);
  });
});

describe("mergeGsdModelConfig", () => {
  it("merges model config without deleting unrelated settings", () => {
    const existing = {
      workflow: { plan_check: true },
      model_profile: "inherit",
      model_overrides: { "gsd-planner": "old/model" },
    };

    expect(
      mergeGsdModelConfig(existing, {
        model_profile: "balanced",
        model_overrides: { "gsd-planner": "openai-codex/gpt-5.5" },
      }),
    ).toEqual({
      workflow: { plan_check: true },
      model_profile: "balanced",
      model_overrides: { "gsd-planner": "openai-codex/gpt-5.5" },
    });
  });

  it("removes stale model overrides when switching to inherit", () => {
    expect(
      mergeGsdModelConfig(
        { model_profile: "balanced", model_overrides: { "gsd-planner": "old/model" } },
        { model_profile: "inherit" },
      ),
    ).toEqual({ model_profile: "inherit" });
  });

  it("preserves other top-level keys when switching to inherit", () => {
    expect(
      mergeGsdModelConfig(
        { model_profile: "balanced", model_overrides: { "gsd-planner": "old/model" }, workflow: { plan_check: true } },
        { model_profile: "inherit" },
      ),
    ).toEqual({ model_profile: "inherit", workflow: { plan_check: true } });
  });
});

describe("buildBalancedModelOverrides", () => {
  it("expands balanced tier choices into upstream-compatible model_overrides", () => {
    const overrides = buildBalancedModelOverrides({
      haiku: "local/fast",
      sonnet: "local/standard",
      opus: "local/heavy",
    });

    expect(overrides["gsd-codebase-mapper"]).toBe("local/fast");
    expect(overrides["gsd-plan-checker"]).toBe("local/fast");
    expect(overrides["gsd-planner"]).toBe("local/standard");
    expect(overrides["gsd-executor"]).toBe("local/standard");
    expect(overrides["gsd-roadmapper"]).toBe("local/heavy");
    expect(overrides["gsd-ai-researcher"]).toBe("local/heavy");
  });

  it("maps all known agents", () => {
    const overrides = buildBalancedModelOverrides({
      haiku: "h",
      sonnet: "s",
      opus: "o",
    });

    const totalAgents = Object.keys(overrides).length;
    expect(totalAgents).toBeGreaterThan(20);
  });
});

describe("formatModelChoiceLabel", () => {
  it("formats model choices with provider and model id", () => {
    expect(formatModelChoiceLabel({ provider: "openai-codex", id: "gpt-5.5", name: "GPT 5.5" })).toBe(
      "openai-codex/gpt-5.5 — GPT 5.5",
    );
  });

  it("omits name when same as id", () => {
    expect(formatModelChoiceLabel({ provider: "ollama", id: "llama3", name: "llama3" })).toBe("ollama/llama3");
  });

  it("omits name when undefined", () => {
    expect(formatModelChoiceLabel({ provider: "ollama", id: "llama3" })).toBe("ollama/llama3");
  });
});

describe("readJsonObject / writeJsonObject", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-models-test-"));
  });

  afterEach(() => {
    // intentionally not cleaning up tmpDir for simplicity in tests
  });

  it("reads existing JSON file", () => {
    const filePath = join(tmpDir, "config.json");
    writeFileSync(filePath, JSON.stringify({ model_profile: "inherit" }));
    expect(readJsonObject(filePath)).toEqual({ model_profile: "inherit" });
  });

  it("returns empty object for missing file", () => {
    expect(readJsonObject(join(tmpDir, "nonexistent.json"))).toEqual({});
  });

  it("writes JSON file with trailing newline", () => {
    const filePath = join(tmpDir, "out.json");
    writeJsonObject(filePath, { model_profile: "balanced" });
    const content = require("node:fs").readFileSync(filePath, "utf8");
    expect(content).toBe(JSON.stringify({ model_profile: "balanced" }, null, 2) + "\n");
  });

  it("creates parent directories on write", () => {
    const filePath = join(tmpDir, "deep", "nested", "config.json");
    writeJsonObject(filePath, { model_profile: "inherit" });
    expect(readJsonObject(filePath)).toEqual({ model_profile: "inherit" });
  });

  it("throws on non-object JSON", () => {
    const filePath = join(tmpDir, "bad.json");
    writeFileSync(filePath, "[1,2,3]");
    expect(() => readJsonObject(filePath)).toThrow("must contain a JSON object");
  });
});