import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveGsdConfigPath,
  mergeGsdModelConfig,
  readJsonObject,
  writeJsonObject,
  buildTierModelOverrides,
  readEnabledModels,
  loadModelCatalog,
  readCurrentGsdConfig,
} from "../src/gsd-models.js";
import { describe, expect, it } from "vitest";

const GSD_ROOT = join(process.cwd(), "node_modules", "@opengsd", "get-shit-done-redux");
const catalog = loadModelCatalog(GSD_ROOT);

describe("integration: config write and GSD SDK readback", () => {
  it("writes inherit config and reads it back", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    const before = readJsonObject(configPath);
    expect(before).toEqual({});

    const merged = mergeGsdModelConfig(before, { model_profile: "inherit" });
    writeJsonObject(configPath, merged);

    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.model_profile).toBe("inherit");
    expect(after.model_overrides).toBeUndefined();
  });

  it("writes balanced config with profile-aware overrides and reads it back", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    const overrides = buildTierModelOverrides(
      {
        heavy: "claude-bridge/claude-opus-4-7",
        standard: "openai-codex/gpt-5.5",
        light: "ollama-cloud/gemini-3-flash-preview",
      },
      catalog,
      "balanced",
    );

    const merged = mergeGsdModelConfig({}, { model_profile: "balanced", model_overrides: overrides });
    writeJsonObject(configPath, merged);

    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.model_profile).toBe("balanced");
    // In balanced: planner is opus(heavy), executor is sonnet(standard), mapper is haiku(light)
    expect(after.model_overrides["gsd-planner"]).toBe("claude-bridge/claude-opus-4-7");
    expect(after.model_overrides["gsd-executor"]).toBe("openai-codex/gpt-5.5");
    expect(after.model_overrides["gsd-codebase-mapper"]).toBe("ollama-cloud/gemini-3-flash-preview");
  });

  it("round-trips from balanced back to inherit", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    const balanced = mergeGsdModelConfig(
      {},
      { model_profile: "balanced", model_overrides: { "gsd-planner": "test/model" } },
    );
    writeJsonObject(configPath, balanced);

    const restored = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, restored);

    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.model_profile).toBe("inherit");
    expect(after.model_overrides).toBeUndefined();
  });

  it("readCurrentGsdConfig round-trips with catalog awareness", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    const overrides = buildTierModelOverrides(
      { heavy: "a/b", standard: "c/d", light: "e/f" },
      catalog,
      "balanced",
    );
    writeJsonObject(configPath, { model_profile: "balanced", model_overrides: overrides });

    const result = readCurrentGsdConfig(configPath, catalog);
    expect(result.profile).toBe("balanced");
    expect(result.tierModels).not.toBeNull();
    expect(result.tierModels!.heavy).toBe("a/b");
    expect(result.tierModels!.standard).toBe("c/d");
    expect(result.tierModels!.light).toBe("e/f");
  });
});