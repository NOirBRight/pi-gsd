import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSettingsBridge, resolveGsdConfigSource, formatSettingsContext } from "../src/settings-bridge/index.js";
import { SettingsBridgeCache } from "../src/settings-bridge/cache.js";

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "pi-gsd-settings-bridge-"));
}

function writeJson(root: string, relativePath: string, content: unknown) {
  const absolute = join(root, relativePath);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, JSON.stringify(content, null, 2), "utf8");
  return absolute;
}

describe("resolveGsdConfigSource", () => {
  it("prefers explicit configPath when provided", () => {
    const root = makeRoot();
    const explicit = writeJson(root, "settings.json", { workflow: { verifier: false } });
    const result = resolveGsdConfigSource({ cwd: root, configPath: explicit });
    expect(result.kind).toBe("explicit");
    expect(result.path).toBe(explicit);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses .planning/active-workstream when present", () => {
    const root = makeRoot();
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, ".planning", "active-workstream"), "feature-x", "utf8");
    const workstreamConfig = writeJson(root, ".planning/workstreams/feature-x/config.json", { workflow: { verifier: true } });
    const result = resolveGsdConfigSource({ cwd: root });
    expect(result.kind).toBe("active-workstream");
    expect(result.path).toBe(workstreamConfig);
  });

  it("ignores unsafe active-workstream slugs and falls back to .planning/config.json", () => {
    const root = makeRoot();
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, ".planning", "active-workstream"), "../../../outside", "utf8");
    const planningConfig = writeJson(root, ".planning/config.json", { workflow: { verifier: true } });

    const result = resolveGsdConfigSource({ cwd: root });

    expect(result.kind).toBe("planning-config");
    expect(result.path).toBe(planningConfig);
  });

  it("rejects dot-segment active-workstream slugs", () => {
    const root = makeRoot();
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, ".planning", "active-workstream"), "..", "utf8");
    const planningConfig = writeJson(root, ".planning/config.json", { workflow: { verifier: true } });

    const result = resolveGsdConfigSource({ cwd: root });

    expect(result.kind).toBe("planning-config");
    expect(result.path).toBe(planningConfig);
  });

  it("falls back to .planning/config.json when no active workstream", () => {
    const root = makeRoot();
    const planningConfig = writeJson(root, ".planning/config.json", { workflow: { verifier: true } });
    const result = resolveGsdConfigSource({ cwd: root });
    expect(result.kind).toBe("planning-config");
    expect(result.path).toBe(planningConfig);
  });

  it("falls back to root config.json when .planning/config.json is absent", () => {
    const root = makeRoot();
    const rootConfig = writeJson(root, "config.json", { workflow: { verifier: false } });
    const result = resolveGsdConfigSource({ cwd: root });
    expect(result.kind).toBe("root-config");
    expect(result.path).toBe(rootConfig);
  });

  it("returns default kind when no source exists", () => {
    const root = makeRoot();
    const result = resolveGsdConfigSource({ cwd: root });
    expect(result.kind).toBe("default");
    expect(result.path).toBeUndefined();
  });

  it("captures parseError metadata for malformed JSON", () => {
    const root = makeRoot();
    const absolute = join(root, ".planning", "config.json");
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, "{not valid json", "utf8");
    const result = resolveGsdConfigSource({ cwd: root });
    expect(result.kind).toBe("planning-config");
    expect(result.config).toBeUndefined();
    expect(result.parseError).toBeTruthy();
  });
});

describe("SettingsBridgeCache", () => {
  it("refreshes lazily by mtime/hash without long-lived watchers", () => {
    const root = makeRoot();
    const configPath = writeJson(root, ".planning/config.json", { workflow: { verifier: true } });
    const bridge = createSettingsBridge({ cwd: root });

    const first = bridge.refresh();
    expect(first.source.path).toBe(configPath);
    expect(first.parseError).toBeUndefined();
    expect(first.workflow.verifier).toBe(true);

    // Refresh again — no changes, no notifications
    const second = bridge.refresh();
    expect(second.source.hash).toBe(first.source.hash);
    expect(bridge.popNotifications()).toEqual([]);
  });

  it("notifies at most once per newly observed hash (D-15)", () => {
    const root = makeRoot();
    writeJson(root, ".planning/config.json", { workflow: { verifier: true } });
    const bridge = createSettingsBridge({ cwd: root });

    bridge.refresh();
    expect(bridge.popNotifications()).toEqual([]);

    // First refresh establishes baseline hash; subsequent same-hash refresh does not notify.
    bridge.refresh();
    expect(bridge.popNotifications()).toEqual([]);

    // Mutate the file → next refresh should notify once.
    writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: false } }), "utf8");
    bridge.refresh();
    const notifications = bridge.popNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe("info");
    expect(notifications[0].observedHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("emits a parse-error warning on the first observe of malformed JSON (D-16)", () => {
    const root = makeRoot();
    const absolute = join(root, ".planning", "config.json");
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, "{not valid json", "utf8");

    const bridge = createSettingsBridge({ cwd: root });
    const result = bridge.refresh();
    expect(result.parseError).toContain("parse");
    expect(bridge.isParseError()).toBe(true);

    expect(() => bridge.ensureGsdSettingsReady()).toThrow(/GSD settings parse failed/);
    const notifications = bridge.popNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe("warning");
    expect(notifications[0].message).toMatch(/parse/i);
  });

  it("blocks GSD callers on parse failure but exposes the structured state", () => {
    const root = makeRoot();
    const absolute = join(root, ".planning", "config.json");
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, "{not valid json", "utf8");

    const bridge = createSettingsBridge({ cwd: root });
    const result = bridge.refresh();
    expect(result.parseError).toBeTruthy();
    // parseError present + no parsed config means model profile is null.
    expect(result.model.profile).toBeNull();
    expect(result.workflow).toEqual({});
  });
});

describe("formatSettingsContext", () => {
  it("produces a concise redacted summary with source, hash, mtime, and workflow toggles", () => {
    const root = makeRoot();
    writeJson(root, ".planning/config.json", {
      model_profile: "balanced",
      workflow: { verifier: true, code_review: false, skip_discuss: true },
      model_overrides: { "gsd-planner": "anthropic/claude-opus-4-8", "gsd-executor": "anthropic/claude-sonnet-4-6" },
    });
    const bridge = createSettingsBridge({ cwd: root, officialPackageName: "@opengsd/gsd-core", officialPackageVersion: "1.2.0" });
    const result = bridge.refresh();
    const formatted = bridge.formatContext();

    expect(formatted).toContain("## GSD Settings");
    expect(formatted).toContain("profile: balanced");
    expect(formatted).toContain("overrides: 2 agent mappings");
    expect(formatted).toContain("code_review: false");
    expect(formatted).toContain("skip_discuss: true");
    expect(formatted).toContain("verifier: true");
    expect(formatted).toContain("@opengsd/gsd-core@1.2.0");
    expect(formatted).toMatch(/hash: [a-f0-9]{16}/);
    expect(formatted).toMatch(/source: .*planning-config/);
  });

  it("never dumps raw config JSON, model catalog, or secrets (D-09, D-11, D-12)", () => {
    const root = makeRoot();
    writeJson(root, ".planning/config.json", {
      model_profile: "balanced",
      api_token: "sk-secret-1234",
      workflow: { verifier: true, plan_check: false },
      model_overrides: { "gsd-planner": "anthropic/claude-opus-4-8" },
    });
    const bridge = createSettingsBridge({ cwd: root });
    const formatted = bridge.refresh() && bridge.formatContext();

    expect(formatted).not.toContain("sk-secret-1234");
    expect(formatted).not.toContain("api_token");
    expect(formatted).not.toContain("claude-opus-4-8");
    expect(formatted).not.toContain("gsd-planner");
    expect(formatted).not.toContain("anthropic");
    expect(formatted).not.toContain("{");
    expect(formatted).not.toMatch(/model_overrides/);
  });

  it("redacts free-form scalar workflow values by key", () => {
    const root = makeRoot();
    writeJson(root, ".planning/config.json", {
      workflow: {
        verifier: true,
        code_review_command: "run reviewer with private context",
      },
    });
    const bridge = createSettingsBridge({ cwd: root });
    const formatted = bridge.refresh() && bridge.formatContext();

    expect(formatted).toContain("verifier: true");
    expect(formatted).toContain("code_review_command: [redacted]");
    expect(formatted).not.toContain("private context");
  });

  it("refreshes before formatting GSD context so changed settings are visible", () => {
    const root = makeRoot();
    writeJson(root, ".planning/config.json", { workflow: { verifier: true } });
    const bridge = createSettingsBridge({ cwd: root });

    expect(bridge.formatContext()).toContain("verifier: true");

    writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: false } }), "utf8");

    expect(bridge.formatContext()).toContain("verifier: false");
  });

  it("omits nested workflow objects instead of dumping raw JSON into context", () => {
    const root = makeRoot();
    writeJson(root, ".planning/config.json", {
      workflow: {
        verifier: true,
        nested_secret: { token: "sk-nested-secret" },
        arbitrary_array: ["do-not-dump"],
      },
    });
    const bridge = createSettingsBridge({ cwd: root });
    const formatted = bridge.refresh() && bridge.formatContext();

    expect(formatted).toContain("verifier: true");
    expect(formatted).not.toContain("nested_secret");
    expect(formatted).not.toContain("sk-nested-secret");
    expect(formatted).not.toContain("do-not-dump");
    expect(formatted).not.toContain("{");
  });

  it("emits a parse-error banner instead of settings when JSON is malformed", () => {
    const root = makeRoot();
    const absolute = join(root, ".planning", "config.json");
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, "{not valid", "utf8");

    const bridge = createSettingsBridge({ cwd: root });
    const formatted = bridge.refresh() && bridge.formatContext();

    expect(formatted).toContain("parse error");
    expect(formatted).toContain("Settings context disabled");
  });
});

describe("SettingsBridgeCache.deduplicates notifications across identical refreshes", () => {
  it("does not double-notify when refresh is called multiple times with the same hash", () => {
    const root = makeRoot();
    writeJson(root, ".planning/config.json", { workflow: { verifier: true } });
    const bridge = new SettingsBridgeCache({ cwd: root });

    bridge.refresh();
    bridge.refresh();
    bridge.refresh();
    expect(bridge.popNotifications()).toEqual([]);

    // Mutate
    writeFileSync(join(root, ".planning", "config.json"), JSON.stringify({ workflow: { verifier: false } }), "utf8");
    bridge.refresh();
    expect(bridge.popNotifications()).toHaveLength(1);

    // Subsequent identical refresh does not re-notify
    bridge.refresh();
    expect(bridge.popNotifications()).toEqual([]);
  });
});
