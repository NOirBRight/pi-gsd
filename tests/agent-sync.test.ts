import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncAgents } from "../src/agent-sync.js";

describe("syncAgents", () => {
  it("writes materialized generated agents into project .pi/agents", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
    const generatedDir = join(root, "generated", "agents");
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(join(generatedDir, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\n@__PI_GSD_OFFICIAL_ROOT__/get-shit-done/references/x.md\n", "utf8");

    const result = syncAgents({
      generatedAgentsDir: generatedDir,
      cwd: root,
      officialRoot: "C:\\repo\\node_modules\\@opengsd\\get-shit-done-redux",
      scope: "project",
    });

    const target = join(root, ".pi", "agents", "gsd-planner.md");
    expect(result.ok).toBe(true);
    expect(result.written).toEqual([target]);
    expect(readFileSync(target, "utf8")).toContain("pi-gsd generated agent");
    expect(readFileSync(target, "utf8")).toContain("@C:/repo/node_modules/@opengsd/get-shit-done-redux/get-shit-done/references/x.md");
  });

  it("keeps frontmatter first and inserts ownership marker after frontmatter", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
    const generatedDir = join(root, "generated", "agents");
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(join(generatedDir, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");

    const result = syncAgents({ generatedAgentsDir: generatedDir, cwd: root, officialRoot: root, scope: "project" });

    const targetContent = readFileSync(join(root, ".pi", "agents", "gsd-planner.md"), "utf8");
    const firstClosingFrontmatter = targetContent.indexOf("\n---\n");
    expect(result.ok).toBe(true);
    expect(targetContent.startsWith("---\n")).toBe(true);
    expect(targetContent).toContain("<!-- pi-gsd generated agent -->");
    expect(targetContent.indexOf("<!-- pi-gsd generated agent -->")).toBeGreaterThan(firstClosingFrontmatter);
  });

  it("refuses to overwrite unowned target files", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
    const generatedDir = join(root, "generated", "agents");
    const targetDir = join(root, ".pi", "agents");
    mkdirSync(generatedDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(generatedDir, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");
    writeFileSync(join(targetDir, "gsd-planner.md"), "user owned\n", "utf8");

    const result = syncAgents({ generatedAgentsDir: generatedDir, cwd: root, officialRoot: root, scope: "project" });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("refusing to overwrite unowned agent");
    expect(readFileSync(join(targetDir, "gsd-planner.md"), "utf8")).toBe("user owned\n");
  });

  it("check mode reports stale generated agents without writing", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
    const generatedDir = join(root, "generated", "agents");
    const targetDir = join(root, ".pi", "agents");
    mkdirSync(generatedDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(generatedDir, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");
    writeFileSync(join(targetDir, "gsd-planner.md"), "<!-- pi-gsd generated agent -->\nstale\n", "utf8");

    const result = syncAgents({ generatedAgentsDir: generatedDir, cwd: root, officialRoot: root, scope: "project", check: true });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("stale synced agent: gsd-planner.md");
    expect(readFileSync(join(targetDir, "gsd-planner.md"), "utf8")).toContain("stale");
  });

  it("check mode reports owned synced agents missing from generated agents without deleting them", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
    const generatedDir = join(root, "generated", "agents");
    const targetDir = join(root, ".pi", "agents");
    mkdirSync(generatedDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    const staleContent = "<!-- pi-gsd generated agent -->\nstale\n";
    writeFileSync(join(targetDir, "gsd-old.md"), staleContent, "utf8");

    const result = syncAgents({ generatedAgentsDir: generatedDir, cwd: root, officialRoot: root, scope: "project", check: true });

    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("stale synced agent: gsd-old.md");
    expect(readFileSync(join(targetDir, "gsd-old.md"), "utf8")).toBe(staleContent);
  });

  it("dry run reports pending sync without recording writes", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
    const generatedDir = join(root, "generated", "agents");
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(join(generatedDir, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");

    const result = syncAgents({ generatedAgentsDir: generatedDir, cwd: root, officialRoot: root, scope: "project", dryRun: true });

    expect(result.ok).toBe(true);
    expect(result.messages.join("\n")).toContain("would sync agent: gsd-planner.md");
    expect(result.written).toEqual([]);
    expect(existsSync(join(root, ".pi", "agents", "gsd-planner.md"))).toBe(false);
  });
});
