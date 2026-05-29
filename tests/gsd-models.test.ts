import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTierModelOverrides,
  mergeGsdModelConfig,
  readJsonObject,
  readEnabledModels,
  writeJsonObject,
  resolveGsdConfigPath,
  loadModelCatalog,
  invalidateModelCatalog,
  isValidProfile,
  getProfileTierAgents,
  getRequiredTiers,
  inferTierModelsFromOverrides,
  readCurrentGsdConfig,
} from "../src/gsd-models.js";

// Load real catalog for tests
const GSD_ROOT = join(process.cwd(), "node_modules", "@opengsd", "get-shit-done-redux");
const catalog = loadModelCatalog(GSD_ROOT);

describe("resolveGsdConfigPath", () => {
  it("resolves project and user scope paths", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-models-test-"));
    const home = join(root, "home");

    expect(resolveGsdConfigPath({ scope: "project", cwd: root, homeDir: home })).toBe(
      join(root, ".planning", "config.json"),
    );
    expect(resolveGsdConfigPath({ scope: "global", cwd: root, homeDir: home })).toBe(
      join(home, ".gsd", "defaults.json"),
    );
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

describe("getProfileTierAgents", () => {
  it("maps balanced profile agents to correct tiers", () => {
    const tierAgents = getProfileTierAgents(catalog, "balanced");

    expect(tierAgents.get("heavy")).toContain("gsd-planner");
    expect(tierAgents.get("heavy")).toContain("gsd-eval-planner");
    expect(tierAgents.get("standard")).toContain("gsd-executor");
    expect(tierAgents.get("standard")).toContain("gsd-roadmapper"); // NOT heavy in balanced
    expect(tierAgents.get("light")).toContain("gsd-codebase-mapper");
    expect(tierAgents.get("light")).toContain("gsd-doc-classifier");
  });

  it("maps quality profile — heavy covers most agents", () => {
    const tierAgents = getProfileTierAgents(catalog, "quality");
    expect(tierAgents.get("heavy")!.length).toBeGreaterThan(20);
    expect(tierAgents.get("light")).toBeUndefined(); // quality has no haiku
  });

  it("maps budget profile — no heavy tier", () => {
    const tierAgents = getProfileTierAgents(catalog, "budget");
    expect(tierAgents.has("heavy")).toBe(false);
    expect(tierAgents.get("standard")!.length).toBeGreaterThan(0);
    expect(tierAgents.get("light")!.length).toBeGreaterThan(10);
  });

  it("maps adaptive profile using routingTier", () => {
    const tierAgents = getProfileTierAgents(catalog, "adaptive");
    expect(tierAgents.get("heavy")).toContain("gsd-planner");
    expect(tierAgents.get("heavy")).toContain("gsd-debugger");
    expect(tierAgents.get("standard")).toContain("gsd-executor");
    expect(tierAgents.get("light")).toContain("gsd-codebase-mapper");
  });

  it("returns empty map for inherit", () => {
    const tierAgents = getProfileTierAgents(catalog, "inherit");
    expect(tierAgents.size).toBe(0);
  });
});

describe("getRequiredTiers", () => {
  it("inherits needs 0 tiers", () => {
    expect(getRequiredTiers("inherit")).toEqual([]);
  });
  it("quality needs heavy + standard", () => {
    expect(getRequiredTiers("quality")).toEqual(["heavy", "standard"]);
  });
  it("budget needs standard + light", () => {
    expect(getRequiredTiers("budget")).toEqual(["standard", "light"]);
  });
  it("balanced needs all 3", () => {
    expect(getRequiredTiers("balanced")).toEqual(["heavy", "standard", "light"]);
  });
  it("adaptive needs all 3", () => {
    expect(getRequiredTiers("adaptive")).toEqual(["heavy", "standard", "light"]);
  });
});

describe("buildTierModelOverrides", () => {
  it("maps tier models to agents per profile", () => {
    const tiers: import("../src/gsd-models.js").TierModelMap = {
      heavy: "openai-codex/gpt-5.5",
      standard: "ollama-cloud/glm-5.1",
      light: "openai-codex/gpt-5.3-codex-spark",
    };
    const overrides = buildTierModelOverrides(tiers, catalog, "balanced");

    // In balanced: gsd-planner is opus(heavy), gsd-executor is sonnet(standard), gsd-codebase-mapper is haiku(light)
    expect(overrides["gsd-planner"]).toBe("openai-codex/gpt-5.5");
    expect(overrides["gsd-executor"]).toBe("ollama-cloud/glm-5.1");
    expect(overrides["gsd-codebase-mapper"]).toBe("openai-codex/gpt-5.3-codex-spark");
  });
});

describe("inferTierModelsFromOverrides", () => {
  it("reverse-maps overrides to tier models for balanced profile", () => {
    const overrides = buildTierModelOverrides(
      { heavy: "h", standard: "s", light: "l" },
      catalog,
      "balanced",
    );
    const tiers = inferTierModelsFromOverrides(overrides, catalog, "balanced");
    expect(tiers).not.toBeNull();
    expect(tiers!.heavy).toBe("h");
    expect(tiers!.standard).toBe("s");
    expect(tiers!.light).toBe("l");
  });

  it("returns null for empty overrides", () => {
    expect(inferTierModelsFromOverrides({}, catalog, "balanced")).toBeNull();
  });
});

describe("readEnabledModels", () => {
  it("returns enabledModels array from settings.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-models-test-"));
    const settingsDir = join(tmpDir, ".pi", "agent");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({
      enabledModels: ["openai-codex/gpt-5.5", "ollama/deepseek-v4"],
    }));
    expect(readEnabledModels(tmpDir)).toEqual(["openai-codex/gpt-5.5", "ollama/deepseek-v4"]);
  });

  it("returns empty array when settings file is missing", () => {
    expect(readEnabledModels(join(tmpdir(), "nonexistent"))).toEqual([]);
  });
});

describe("readJsonObject / writeJsonObject", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-models-test-"));
  });

  it("reads existing JSON file", () => {
    const filePath = join(tmpDir, "config.json");
    writeFileSync(filePath, JSON.stringify({ model_profile: "inherit" }));
    expect(readJsonObject(filePath)).toEqual({ model_profile: "inherit" });
  });

  it("returns empty object for missing file", () => {
    expect(readJsonObject(join(tmpDir, "nonexistent.json"))).toEqual({});
  });

  it("throws on non-object JSON", () => {
    const filePath = join(tmpDir, "bad.json");
    writeFileSync(filePath, "[1,2,3]");
    expect(() => readJsonObject(filePath)).toThrow("must contain a JSON object");
  });
});

describe("readCurrentGsdConfig", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-cfg-test-"));
    configPath = join(tmpDir, ".planning", "config.json");
  });

  it("returns null when config does not exist", () => {
    const result = readCurrentGsdConfig(configPath, catalog);
    expect(result.profile).toBeNull();
    expect(result.tierModels).toBeNull();
  });

  it("returns null tierModels for inherit config", () => {
    writeJsonObject(configPath, { model_profile: "inherit" });
    const result = readCurrentGsdConfig(configPath, catalog);
    expect(result.profile).toBe("inherit");
    expect(result.tierModels).toBeNull();
  });

  it("decodes balanced config into tier models", () => {
    const overrides = buildTierModelOverrides(
      { heavy: "openai-codex/gpt-5.5", standard: "ollama-cloud/glm-5.1", light: "openai-codex/gpt-5.3-codex-spark" },
      catalog,
      "balanced",
    );
    writeJsonObject(configPath, { model_profile: "balanced", model_overrides: overrides });
    const result = readCurrentGsdConfig(configPath, catalog);
    expect(result.profile).toBe("balanced");
    expect(result.tierModels).not.toBeNull();
    expect(result.tierModels!.heavy).toBe("openai-codex/gpt-5.5");
    expect(result.tierModels!.standard).toBe("ollama-cloud/glm-5.1");
    expect(result.tierModels!.light).toBe("openai-codex/gpt-5.3-codex-spark");
  });

  it("returns null tierModels for unknown profile", () => {
    writeJsonObject(configPath, { model_profile: "custom-unknown", model_overrides: { "gsd-planner": "x/y" } });
    const result = readCurrentGsdConfig(configPath, catalog);
    expect(result.profile).toBe("custom-unknown");
    expect(result.tierModels).toBeNull();
  });
});

// ── isValidProfile ──────────────────────────────────────────────────

describe("isValidProfile", () => {
  it("accepts valid profiles", () => {
    expect(isValidProfile("inherit")).toBe(true);
    expect(isValidProfile("quality")).toBe(true);
    expect(isValidProfile("balanced")).toBe(true);
    expect(isValidProfile("budget")).toBe(true);
    expect(isValidProfile("adaptive")).toBe(true);
  });

  it("rejects invalid profiles", () => {
    expect(isValidProfile("custom")).toBe(false);
    expect(isValidProfile("")).toBe(false);
    expect(isValidProfile("unknown")).toBe(false);
  });
});

// ── invalidateModelCatalog ─────────────────────────────────────────

describe("invalidateModelCatalog", () => {
  it("allows reload after invalidation", () => {
    const first = loadModelCatalog(GSD_ROOT);
    invalidateModelCatalog();
    const second = loadModelCatalog(GSD_ROOT);
    // Should be different object references after invalidate
    expect(first).not.toBe(second);
    expect(second.profiles).toEqual(first.profiles);
  });
});
