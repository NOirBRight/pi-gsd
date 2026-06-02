import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCurrentStatus,
  buildProfileOptions,
  capitalize,
  formatAgentSummary,
  getProfileTierAgents,
  loadModelCatalog,
  parseScope,
  readCurrentGsdConfig,
  resolveGsdConfigPath,
  buildTierModelOverrides,
  writeJsonObject,
  type GsdModelScope,
  type TierModelMap,
} from "../src/gsd-models.js";

const GSD_ROOT = join(process.cwd(), "node_modules", "@opengsd", "gsd-core");
const catalog = loadModelCatalog(GSD_ROOT);

// ── capitalize ──────────────────────────────────────────────────────

describe("capitalize", () => {
  it("capitalizes lowercase word", () => {
    expect(capitalize("inherit")).toBe("Inherit");
  });

  it("capitalizes mixed-case word", () => {
    expect(capitalize("BALANCED")).toBe("Balanced");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });

  it("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("handles already capitalized word", () => {
    expect(capitalize("Quality")).toBe("Quality");
  });
});

// ── formatAgentSummary ──────────────────────────────────────────────

describe("formatAgentSummary", () => {
  it("strips gsd- prefix and shows names", () => {
    expect(formatAgentSummary(["gsd-planner", "gsd-eval-planner"])).toBe(
      "planner, eval-planner",
    );
  });

  it("truncates to maxNames with count", () => {
    const agents = ["gsd-a", "gsd-b", "gsd-c", "gsd-d", "gsd-e"];
    expect(formatAgentSummary(agents, 3)).toBe("a, b, c, ... (5)");
  });

  it("shows all when count <= maxNames", () => {
    expect(formatAgentSummary(["gsd-a", "gsd-b"], 3)).toBe("a, b");
  });

  it("shows count for single-item overflow", () => {
    expect(formatAgentSummary(["gsd-a", "gsd-b", "gsd-c", "gsd-d"], 3)).toBe(
      "a, b, c, ... (4)",
    );
  });

  it("uses default maxNames = 3", () => {
    const agents = ["gsd-a", "gsd-b", "gsd-c", "gsd-d"];
    expect(formatAgentSummary(agents)).toBe("a, b, c, ... (4)");
  });

  it("handles custom maxNames = 2", () => {
    const agents = ["gsd-a", "gsd-b", "gsd-c"];
    expect(formatAgentSummary(agents, 2)).toBe("a, b, ... (3)");
  });

  it("handles empty array", () => {
    expect(formatAgentSummary([])).toBe("");
  });
});

// ── parseScope ──────────────────────────────────────────────────────

describe("parseScope", () => {
  it("parses --user as global", () => {
    expect(parseScope("--user")).toBe("global");
  });

  it("parses user as global", () => {
    expect(parseScope("user")).toBe("global");
  });

  it("parses --global as global", () => {
    expect(parseScope("--global")).toBe("global");
  });

  it("parses global as global", () => {
    expect(parseScope("global")).toBe("global");
  });

  it("parses --project as project", () => {
    expect(parseScope("--project")).toBe("project");
  });

  it("parses project as project", () => {
    expect(parseScope("project")).toBe("project");
  });

  it("returns null for undefined", () => {
    expect(parseScope(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseScope("")).toBeNull();
  });

  it("returns null for unknown flag", () => {
    expect(parseScope("--unknown")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseScope("GLOBAL")).toBe("global");
    expect(parseScope("Project")).toBe("project");
  });

  it("trims whitespace", () => {
    expect(parseScope("  global  ")).toBe("global");
  });
});

// ── buildCurrentStatus ──────────────────────────────────────────────

describe("buildCurrentStatus", () => {
  const COL_WIDTH = 11;

  it("shows (using Global config) for project with no config", () => {
    const status = buildCurrentStatus(
      { profile: null, tierModels: null },
      catalog,
      "project",
    );
    expect(status).toContain("using Global config");
    expect(status).not.toContain("Inherit");
  });

  it("shows Inherit for global scope with no config", () => {
    const status = buildCurrentStatus(
      { profile: null, tierModels: null },
      catalog,
      "global",
    );
    expect(status).toContain("Inherit");
    expect(status).toContain("Pi session model");
  });

  it("shows profile name capitalized for balanced", () => {
    const status = buildCurrentStatus(
      { profile: "balanced", tierModels: { heavy: "openai/a", standard: "ollama/b", light: "openai/c" } },
      catalog,
      "global",
    );
    expect(status).toContain("Balanced");
    expect(status).not.toContain("BALANCED");
    expect(status).not.toContain("balanced");
  });

  it("shows tier labels in uppercase with colon", () => {
    const status = buildCurrentStatus(
      { profile: "balanced", tierModels: { heavy: "openai/a", standard: "ollama/b", light: "openai/c" } },
      catalog,
      "global",
    );
    expect(status).toContain("HEAVY:");
    expect(status).toContain("STANDARD:");
    expect(status).toContain("LIGHT:");
  });

  it("shows model IDs after tier labels", () => {
    const status = buildCurrentStatus(
      { profile: "balanced", tierModels: { heavy: "openai/gpt-5", standard: "ollama/glm", light: "openai/spark" } },
      catalog,
      "global",
    );
    expect(status).toContain("openai/gpt-5");
    expect(status).toContain("ollama/glm");
    expect(status).toContain("openai/spark");
  });

  it("shows agents line with agents: prefix", () => {
    const status = buildCurrentStatus(
      { profile: "balanced", tierModels: { heavy: "openai/a", standard: "ollama/b", light: "openai/c" } },
      catalog,
      "global",
    );
    expect(status).toContain("agents:");
  });

  it("skips tiers with no agents or no model", () => {
    // Quality profile has no light tier — verify LIGHT: doesn't appear
    const status = buildCurrentStatus(
      { profile: "quality", tierModels: { heavy: "openai/a", standard: "ollama/b", light: "openai/c" } },
      catalog,
      "global",
    );
    expect(status).toContain("HEAVY:");
    expect(status).toContain("STANDARD:");
    // Quality has no haiku/light agents, so LIGHT: should not appear
    expect(status).not.toContain("LIGHT:");
  });

  it("aligns STATUS: and tier labels at same column width", () => {
    const status = buildCurrentStatus(
      { profile: "balanced", tierModels: { heavy: "openai/a", standard: "ollama/b", light: "openai/c" } },
      catalog,
      "global",
    );
    const lines = status.split("\n");
    // First line starts with STATUS:  — check it's padded
    expect(lines[0]).toMatch(/^STATUS:   /);
    // Second line should start with a tier label padded to same width
    expect(lines[1]).toMatch(/^HEAVY:    /);
  });
});

// ── buildProfileOptions ─────────────────────────────────────────────

describe("buildProfileOptions", () => {
  it("includes Inherit option", () => {
    const options = buildProfileOptions(catalog, "global", { profile: null, tierModels: null });
    expect(options.some((o) => o.value === "inherit")).toBe(true);
    expect(options.find((o) => o.value === "inherit")?.label).toBe("Inherit");
  });

  it("includes all 4 profiles", () => {
    const options = buildProfileOptions(catalog, "global", { profile: null, tierModels: null });
    const values = options.map((o) => o.value);
    expect(values).toContain("quality");
    expect(values).toContain("balanced");
    expect(values).toContain("budget");
    expect(values).toContain("adaptive");
  });

  it("includes Clear option for project scope", () => {
    const options = buildProfileOptions(catalog, "project", { profile: null, tierModels: null });
    const clearOpt = options.find((o) => o.value === "clear");
    expect(clearOpt).toBeDefined();
    expect(clearOpt?.label).toContain("Global");
  });

  it("does NOT include Clear option for global scope", () => {
    const options = buildProfileOptions(catalog, "global", { profile: null, tierModels: null });
    expect(options.some((o) => o.value === "clear")).toBe(false);
  });

  it("profile descriptions contain agent counts", () => {
    const options = buildProfileOptions(catalog, "global", { profile: null, tierModels: null });
    const balanced = options.find((o) => o.value === "balanced");
    expect(balanced?.description).toContain("Heavy:");
    expect(balanced?.description).toContain("agents");
  });

  it("profile labels are capitalized", () => {
    const options = buildProfileOptions(catalog, "project", { profile: null, tierModels: null });
    for (const opt of options) {
      expect(opt.label[0]).toBe(opt.label[0].toUpperCase());
    }
  });
});

// ── buildCurrentStatus + buildProfileOptions integration ────────────

describe("status and options integration", () => {
  it("project with no config shows (using Global) and includes Clear option", () => {
    const status = buildCurrentStatus(
      { profile: null, tierModels: null },
      catalog,
      "project",
    );
    const options = buildProfileOptions(catalog, "project", { profile: null, tierModels: null });

    expect(status).toContain("using Global config");
    expect(options.some((o) => o.value === "clear")).toBe(true);
  });

  it("global with inherit shows Pi session model", () => {
    const status = buildCurrentStatus(
      { profile: "inherit", tierModels: null },
      catalog,
      "global",
    );
    expect(status).toContain("Pi session model");
  });
});

// ── round-trip: write balanced → read back → build status ───────────

describe("config round-trip to status display", () => {
  it("writes balanced config and builds correct status", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-gsd-status-rt-"));
    const configPath = resolveGsdConfigPath({ scope: "project", cwd: tmpDir });

    const overrides = buildTierModelOverrides(
      { heavy: "provider/heavy-m", standard: "provider/std-m", light: "provider/light-m" },
      catalog,
      "balanced",
    );
    writeJsonObject(configPath, { model_profile: "balanced", model_overrides: overrides });

    const currentConfig = readCurrentGsdConfig(configPath, catalog);
    expect(currentConfig.profile).toBe("balanced");
    expect(currentConfig.tierModels).not.toBeNull();

    const status = buildCurrentStatus(currentConfig, catalog, "project");
    expect(status).toContain("Balanced");
    expect(status).toContain("HEAVY:");
    expect(status).toContain("provider/heavy-m");
    expect(status).toContain("STANDARD:");
    expect(status).toContain("provider/std-m");
    expect(status).toContain("LIGHT:");
    expect(status).toContain("provider/light-m");
  });
});
