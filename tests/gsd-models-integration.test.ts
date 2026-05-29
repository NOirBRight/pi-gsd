import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import {
  resolveGsdConfigPath,
  mergeGsdModelConfig,
  readJsonObject,
  writeJsonObject,
  buildTierModelOverrides,
} from "../src/gsd-models.js";
import { describe, expect, it } from "vitest";

describe("integration: config write and GSD SDK readback", () => {
  it("writes inherit config and reads it back", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    // Start empty
    const before = readJsonObject(configPath);
    expect(before).toEqual({});

    // Write inherit
    const merged = mergeGsdModelConfig(before, { model_profile: "inherit" });
    writeJsonObject(configPath, merged);

    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.model_profile).toBe("inherit");
    expect(after.model_overrides).toBeUndefined();
  });

  it("writes balanced config with tier overrides and reads it back", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    const overrides = buildTierModelOverrides({
      light: "ollama-cloud/gemini-3-flash-preview",
      standard: "openai-codex/gpt-5.5",
      heavy: "claude-bridge/claude-opus-4-7",
    });

    const merged = mergeGsdModelConfig({}, { model_profile: "balanced", model_overrides: overrides });
    writeJsonObject(configPath, merged);

    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.model_profile).toBe("balanced");
    expect(after.model_overrides["gsd-codebase-mapper"]).toBe("ollama-cloud/gemini-3-flash-preview");
    expect(after.model_overrides["gsd-executor"]).toBe("openai-codex/gpt-5.5");
    expect(after.model_overrides["gsd-planner"]).toBe("claude-bridge/claude-opus-4-7");
    expect(Object.keys(after.model_overrides).length).toBeGreaterThanOrEqual(30);
  });

  it("round-trips from balanced back to inherit (removes overrides)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    // Write balanced
    const balanced = mergeGsdModelConfig(
      {},
      { model_profile: "balanced", model_overrides: { "gsd-planner": "test/model" } },
    );
    writeJsonObject(configPath, balanced);

    // Switch to inherit
    const restored = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, restored);

    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.model_profile).toBe("inherit");
    expect(after.model_overrides).toBeUndefined();
  });

  it("preserves unrelated config keys when switching profiles", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-inttest-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    // Write initial config with extra keys
    const initial = {
      model_profile: "balanced",
      model_overrides: { "gsd-planner": "test/model" },
      workflow: { plan_check: true },
    };
    writeJsonObject(configPath, initial);

    // Switch to inherit
    const restored = mergeGsdModelConfig(readJsonObject(configPath), { model_profile: "inherit" });
    writeJsonObject(configPath, restored);

    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.model_profile).toBe("inherit");
    expect(after.model_overrides).toBeUndefined();
    expect(after.workflow).toEqual({ plan_check: true });
  });
});