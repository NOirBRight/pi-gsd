import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { runCli } from "../src/cli.js";

let built = false;

describe("runCli", () => {
  it("generates prompts into the requested directory", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    const outDir = join(fixture.root, "out-prompts");
    const stdout: string[] = [];

    const code = await runCli(["generate", "--out", outDir, "--cwd", fixture.root], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(readFileSync(join(outDir, "gsd-plan-phase.md"), "utf8")).toContain("description: Plan");
    expect(stdout.join("")).toContain("generated 1 prompt");
  });

  it("resolves relative generate output from cwd", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);

    const code = await runCli(["generate", "--out", "relative-prompts", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(readFileSync(join(fixture.root, "relative-prompts", "gsd-plan-phase.md"), "utf8")).toContain(
      "description: Plan",
    );
  });

  it("resolves default generate output from cwd", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);

    const code = await runCli(["generate", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(readFileSync(join(fixture.root, "generated", "prompts", "gsd-plan-phase.md"), "utf8")).toContain(
      "description: Plan",
    );
  });

  it("returns non-zero when doctor detects stale prompts", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    const outDir = join(fixture.root, "generated", "prompts");
    const stdout: string[] = [];
    await runCli(["generate", "--out", outDir, "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    writeFileSync(join(outDir, "gsd-plan-phase.md"), "stale\n", "utf8");

    const code = await runCli(["doctor", "--prompts", outDir, "--cwd", fixture.root], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(1);
    expect(stdout.join("")).toContain("stale generated prompt: gsd-plan-phase.md");
  });

  it("resolves default doctor prompts from cwd", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    const stdout: string[] = [];
    await runCli(["generate", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });

    const code = await runCli(["doctor", "--cwd", fixture.root], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(stdout.join("")).toContain("official package: @opengsd/get-shit-done-redux@1.2.3");
  });

  it("does not check project synced agents unless doctor agents option is provided", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    writeAgent(fixture.packageRoot);
    const stdout: string[] = [];
    await runCli(["generate", "--out", "generated/prompts", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });

    const code = await runCli(["doctor", "--cwd", fixture.root], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(stdout.join("")).not.toContain("project synced agents");
  });

  it("resolves relative doctor prompts from cwd", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    await runCli(["generate", "--out", "relative-prompts", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });

    const code = await runCli(["doctor", "--prompts", "relative-prompts", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });

    expect(code).toBe(0);
  });

  it("accepts doctor agents option while prompts are valid", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    const stderr: string[] = [];
    await runCli(["generate", "--out", "relative-prompts", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: () => undefined,
    });

    const code = await runCli(["doctor", "--prompts", "relative-prompts", "--agents", "relative-agents", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(0);
    expect(stderr.join("")).not.toContain("Unknown option: --agents");
  });

  it("syncs generated agents into project .pi agents", async () => {
    const fixture = createOfficialFixture();
    const generatedAgents = join(fixture.root, "generated", "agents");
    mkdirSync(generatedAgents, { recursive: true });
    writeFileSync(join(generatedAgents, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");
    const stdout: string[] = [];

    const code = await runCli(["sync-agents", "--cwd", fixture.root], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(stdout.join("")).toContain("synced agent: gsd-planner.md");
    expect(readFileSync(join(fixture.root, ".pi", "agents", "gsd-planner.md"), "utf8")).toContain("pi-gsd generated agent");
  });

  it("passes arguments to official gsd-tools", async () => {
    const fixture = createOfficialFixture();
    const toolPath = join(fixture.packageRoot, "get-shit-done", "bin", "gsd-tools.cjs");
    writeFileSync(toolPath, "#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n", "utf8");
    chmodSync(toolPath, 0o755);
    const stdout: string[] = [];

    const code = await runCli(["official", "--cwd", fixture.root, "--", "state", "json", "--raw"], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(stdout.join("")).toContain('["state","json","--raw"]');
  });

  it("passes official arguments without marker", async () => {
    const fixture = createOfficialFixture();
    const toolPath = join(fixture.packageRoot, "get-shit-done", "bin", "gsd-tools.cjs");
    writeFileSync(toolPath, "#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n", "utf8");
    chmodSync(toolPath, 0o755);
    const stdout: string[] = [];

    const code = await runCli(["official", "--cwd", fixture.root, "state", "json"], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(stdout.join("")).toContain('["state","json"]');
  });

  it("forwards official stderr and exit status", async () => {
    const fixture = createOfficialFixture();
    const toolPath = join(fixture.packageRoot, "get-shit-done", "bin", "gsd-tools.cjs");
    writeFileSync(toolPath, "#!/usr/bin/env node\nconsole.error('bad official');\nprocess.exit(7);\n", "utf8");
    chmodSync(toolPath, 0o755);
    const stderr: string[] = [];

    const code = await runCli(["official", "--cwd", fixture.root], {
      stdout: () => undefined,
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(7);
    expect(stderr.join("")).toContain("bad official");
  });

  it("returns usage for unknown commands", async () => {
    const stderr: string[] = [];

    const code = await runCli(["wat"], {
      stdout: () => undefined,
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(2);
    expect(stderr.join("")).toContain("Usage: pi-gsd");
  });

  it("catches errors and returns one", async () => {
    const root = createOfficialFixture({ omit: ["commands/gsd"] }).root;
    const stderr: string[] = [];

    const code = await runCli(["generate", "--cwd", root], {
      stdout: () => undefined,
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(1);
    expect(stderr.join("")).toContain("missing commands/gsd");
  });

  it("executes the built cli entrypoint directly", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    const output = join(fixture.root, "direct-output");
    mkdirSync(output, { recursive: true });

    ensureBuiltCli();
    const child = spawnSync(process.execPath, ["dist/cli.js", "generate", "--out", output, "--cwd", fixture.root], {
      encoding: "utf8",
    });

    expect(child.status).toBe(0);
    expect(readFileSync(join(output, "gsd-plan-phase.md"), "utf8")).toContain("description: Plan");
  });

  it("builds the cli entrypoint with a node shebang", () => {
    ensureBuiltCli();

    expect(readFileSync("dist/cli.js", "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("does not buffer official output when executing through the built cli", () => {
    const fixture = createOfficialFixture();
    const toolPath = join(fixture.packageRoot, "get-shit-done", "bin", "gsd-tools.cjs");
    writeFileSync(toolPath, "#!/usr/bin/env node\nprocess.stdout.write('x'.repeat(2 * 1024 * 1024));\n", "utf8");
    chmodSync(toolPath, 0o755);

    ensureBuiltCli();
    const child = spawnSync(process.execPath, ["dist/cli.js", "official", "--cwd", fixture.root], {
      encoding: "utf8",
      maxBuffer: 3 * 1024 * 1024,
    });

    expect(child.status).toBe(0);
    expect(child.stdout.length).toBe(2 * 1024 * 1024);
  });
});

function writePlanCommand(packageRoot: string) {
  writeFileSync(join(packageRoot, "commands", "gsd", "plan-phase.md"), "---\ndescription: Plan\n---\n# Plan Phase\n", "utf8");
}

function writeAgent(packageRoot: string) {
  writeFileSync(join(packageRoot, "agents", "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");
}

function ensureBuiltCli() {
  if (built) {
    return;
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm_execpath is required to build the CLI in tests");
  }

  const build = spawnSync(process.execPath, [npmCli, "run", "build"], { encoding: "utf8" });
  expect(build.status).toBe(0);
  built = true;
}
