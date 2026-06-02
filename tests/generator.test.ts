import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { generateAll, generatePrompts, generateWorkflows } from "../src/generator.js";

describe("generatePrompts", () => {
  it("writes generated official version metadata", () => {
    const fixture = createOfficialFixture();
    const promptsDir = join(fixture.root, "generated", "prompts");
    const agentsDir = join(fixture.root, "generated", "agents");

    generateAll({ officialRoot: fixture.packageRoot, promptsDir, agentsDir, safeRoot: fixture.root });

    const metadata = JSON.parse(readFileSync(join(fixture.root, "generated", ".official-version.json"), "utf8"));
    expect(metadata).toMatchObject({
      packageName: "@opengsd/gsd-core",
      version: expect.any(String),
    });
    expect(metadata.generatedAt).toEqual(expect.any(String));
  });

  it("generates Pi prompt files from official command files", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "plan-phase.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(commandPath, "---\ndescription: Plan\n---\n# Plan Phase\n", "utf8");

    const result = generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = join(outDir, "gsd-plan-phase.md");
    expect(result.written).toContain(generated);
    expect(existsSync(generated)).toBe(true);
    expect(readFileSync(generated, "utf8")).toContain("description: Plan");
  });

  it("preserves frontmatter from command files with CRLF line endings", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "plan-phase.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(commandPath, "---\r\ndescription: CRLF\r\nargument-hint: '[x]'\r\n---\r\nBody\r\n", "utf8");

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-plan-phase.md"), "utf8");
    expect(generated).toBe("---\ndescription: CRLF\nargument-hint: '[x]'\n---\nBody\r\n");
  });

  it("normalizes slash references in generated prompt bodies", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "new-project.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(
      commandPath,
      "---\ndescription: New\n---\nNext: /gsd:plan-phase 1\nURL: https://example.com/#/gsd:plan-phase\n",
      "utf8",
    );

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-new-project.md"), "utf8");
    expect(generated).toContain("Next: /gsd-plan-phase 1");
    expect(generated).toContain("URL: https://example.com/#/gsd:plan-phase");
  });

  it("removes stale generated prompts before writing", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");
    generatePrompts({ officialRoot: fixture.packageRoot, outDir });
    writeFileSync(join(outDir, "stale.md"), "stale\n", "utf8");

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    expect(existsSync(join(outDir, "stale.md"))).toBe(false);
  });

  it("rejects the fixture root as an unsafe output directory before deleting", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "plan-phase.md");

    expect(() => generatePrompts({ officialRoot: fixture.packageRoot, outDir: fixture.root })).toThrow(/unsafe output directory/i);
    expect(existsSync(commandPath)).toBe(true);
  });

  it("rejects the official package root as an unsafe output directory before deleting", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "plan-phase.md");

    expect(() => generatePrompts({ officialRoot: fixture.packageRoot, outDir: fixture.packageRoot })).toThrow(
      /unsafe output directory/i,
    );
    expect(existsSync(commandPath)).toBe(true);
  });

  it("rejects an output directory inside the official package root before deleting", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "plan-phase.md");

    expect(() =>
      generatePrompts({ officialRoot: fixture.packageRoot, outDir: join(fixture.packageRoot, "generated", "prompts") }),
    ).toThrow(/unsafe output directory/i);
    expect(existsSync(commandPath)).toBe(true);
  });

  it("rejects explicit safe root output even when official package root is elsewhere", () => {
    const fixture = createOfficialFixture();
    const safeRoot = join(fixture.root, "project");
    mkdirSync(safeRoot);
    const marker = join(safeRoot, "keep.txt");
    writeFileSync(marker, "keep\n", "utf8");

    expect(() => generatePrompts({ officialRoot: fixture.packageRoot, outDir: safeRoot, safeRoot })).toThrow(
      /unsafe output directory/i,
    );
    expect(existsSync(marker)).toBe(true);
  });

  it("rejects an existing nonempty non-generated directory under safe root before deleting", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "src");
    const marker = join(outDir, "keep.ts");
    mkdirSync(outDir);
    writeFileSync(marker, "export const keep = true;\n", "utf8");

    expect(() => generatePrompts({ officialRoot: fixture.packageRoot, outDir, safeRoot: fixture.root })).toThrow(
      /unsafe output directory/i,
    );
    expect(readFileSync(marker, "utf8")).toBe("export const keep = true;\n");
  });

  it("adds Pi subagent guidance to prompts that spawn subagents", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "execute-phase.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(commandPath, "---\ndescription: Execute\n---\nSpawn subagents for each plan.\n", "utf8");

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-execute-phase.md"), "utf8");
    expect(generated).toContain("<pi_subagents_runtime_note>");
    expect(generated).toContain('subagent({ action: "list" })');
  });

  it("transforms AskUserQuestion calls in generated prompts", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "quick.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(
      commandPath,
      "---\ndescription: Quick\n---\nAskUserQuestion(\"Confirm\", \"Proceed?\", [\"Yes\", \"No\"])\n",
      "utf8",
    );

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-quick.md"), "utf8");
    expect(generated).toContain("ask_user_question");
    expect(generated).not.toContain("AskUserQuestion(");
  });

  it("transforms Skill() dispatch calls in generated prompts", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "autonomous.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(
      commandPath,
      '---\ndescription: Autonomous\n---\nSkill(skill="gsd-plan-phase", args="4 --auto")\n',
      "utf8",
    );

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-autonomous.md"), "utf8");
    expect(generated).toContain('Use the /gsd-plan-phase skill');
    expect(generated).not.toContain('Skill(skill=');
  });

  it("transforms subagent_type=\"general-purpose\" in generated prompts", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "advisor.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(
      commandPath,
      '---\ndescription: Advisor\n---\nsubagent_type="general-purpose"\n',
      "utf8",
    );

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-advisor.md"), "utf8");
    expect(generated).toContain('subagent_type="general"');
    expect(generated).not.toContain('general-purpose');
  });

  it("preserves AskUserQuestion inside code fences while transforming outside", () => {
    const fixture = createOfficialFixture();
    const commandPath = join(fixture.packageRoot, "commands", "gsd", "docs.md");
    const outDir = join(fixture.root, "generated", "prompts");
    writeFileSync(
      commandPath,
      '---\ndescription: Docs\n---\n```\nAskUserQuestion("Header", "Question?", ["Yes"])\n```\nOutside: AskUserQuestion("Check", "OK?", ["OK"])\n',
      "utf8",
    );

    generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    const generated = readFileSync(join(outDir, "gsd-docs.md"), "utf8");
    // Code-fenced AskUserQuestion is preserved
    expect(generated).toContain('AskUserQuestion("Header"');
    // Outside code fences AskUserQuestion is transformed
    expect(generated).toContain('ask_user_question');
  });
});

describe("generateWorkflows", () => {
  it("transforms positional Skill dispatch calls in generated workflows including code fences", () => {
    const fixture = createOfficialFixture();
    const workflowsSource = join(fixture.packageRoot, "get-shit-done", "workflows", "chain.md");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    writeFileSync(
      workflowsSource,
      [
        "Launch:",
        "```",
        'Skill("gsd-plan-phase", args="${PHASE} --auto")',
        "```",
        "",
      ].join("\n"),
      "utf8",
    );

    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir, safeRoot: fixture.root });

    const generated = readFileSync(join(workflowsDir, "workflows", "chain.md"), "utf8");
    expect(generated).toContain("Invoke /gsd-plan-phase ${PHASE} --auto in Pi");
    expect(generated).not.toContain('Skill("gsd-plan-phase"');
  });

  it("transforms Workflow dispatch calls in generated workflows", () => {
    const fixture = createOfficialFixture();
    const workflowsSource = join(fixture.packageRoot, "get-shit-done", "workflows", "code-review.md");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    writeFileSync(
      workflowsSource,
      'Workflow(workflow="get-shit-done/workflows/code-review-fix.md", args="${FIX_ARGS}")\n',
      "utf8",
    );

    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir, safeRoot: fixture.root });

    const generated = readFileSync(join(workflowsDir, "workflows", "code-review.md"), "utf8");
    expect(generated).toContain("Read and execute generated/workflows/workflows/code-review-fix.md");
    expect(generated).not.toContain("Workflow(");
  });

  it("passes FIX_REPORT_PATH into code-review-fix Node report parsers", () => {
    const fixture = createOfficialFixture();
    const workflowsSource = join(fixture.packageRoot, "get-shit-done", "workflows", "code-review-fix.md");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    writeFileSync(
      workflowsSource,
      [
        'HAS_STATUS=$(REVIEW_PATH="${REVIEW_PATH}" node -e "',
        "  const fs = require('fs');",
        "  const content = fs.readFileSync(process.env.FIX_REPORT_PATH, 'utf-8');",
        '" 2>/dev/null)',
      ].join("\n"),
      "utf8",
    );

    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir, safeRoot: fixture.root });

    const generated = readFileSync(join(workflowsDir, "workflows", "code-review-fix.md"), "utf8");
    expect(generated).toContain('REVIEW_PATH="${REVIEW_PATH}" FIX_REPORT_PATH="${FIX_REPORT_PATH}" node -e');
  });

  it("does not add FIX_REPORT_PATH to unrelated workflow Node parsers", () => {
    const fixture = createOfficialFixture();
    const workflowsSource = join(fixture.packageRoot, "get-shit-done", "workflows", "code-review.md");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    writeFileSync(
      workflowsSource,
      [
        'FRONTMATTER=$(REVIEW_PATH="${REVIEW_PATH}" node -e "',
        "  const fs = require('fs');",
        "  const content = fs.readFileSync(process.env.REVIEW_PATH, 'utf-8');",
        '" 2>/dev/null)',
      ].join("\n"),
      "utf8",
    );

    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir, safeRoot: fixture.root });

    const generated = readFileSync(join(workflowsDir, "workflows", "code-review.md"), "utf8");
    expect(generated).toContain('REVIEW_PATH="${REVIEW_PATH}" node -e');
    expect(generated).not.toContain("FIX_REPORT_PATH");
  });

  it("normalizes generated SlashCommand handoff phrasing", () => {
    const fixture = createOfficialFixture();
    const workflowsSource = join(fixture.packageRoot, "get-shit-done", "workflows", "transition.md");
    const workflowsDir = join(fixture.root, "generated", "workflows");
    writeFileSync(
      workflowsSource,
      'Exit skill and invoke SlashCommand("/gsd:plan-phase 1 --auto")\n',
      "utf8",
    );

    generateWorkflows({ officialRoot: fixture.packageRoot, outDir: workflowsDir, safeRoot: fixture.root });

    const generated = readFileSync(join(workflowsDir, "workflows", "transition.md"), "utf8");
    expect(generated).toContain("Exit skill and invoke /gsd-plan-phase 1 --auto in Pi");
    expect(generated).not.toContain("invoke Invoke");
  });
});
