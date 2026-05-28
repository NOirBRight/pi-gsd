import { splitFrontmatter, writeFrontmatter } from "../src/frontmatter.js";
import { addPiSubagentGuidance, commandFileToPiPromptName, normalizeGsdSlashReferences } from "../src/prompt-transform.js";

describe("frontmatter helpers", () => {
  it("splits markdown frontmatter from body", () => {
    const parsed = splitFrontmatter("---\ndescription: Plan\nargument-hint: '[phase]'\nallowed-tools:\n  - Read\n---\nBody\n");

    expect(parsed.data.description).toBe("Plan");
    expect(parsed.data["argument-hint"]).toBe("[phase]");
    expect(parsed.data["allowed-tools"]).toEqual(["Read"]);
    expect(parsed.body).toBe("Body\n");
  });

  it("returns the whole input as body when frontmatter is absent", () => {
    const parsed = splitFrontmatter("Body only\n");

    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe("Body only\n");
  });

  it("parses an empty scalar value as an empty string", () => {
    const parsed = splitFrontmatter("---\nargument-hint:\n---\nBody\n");

    expect(parsed.data["argument-hint"]).toBe("");
    expect(parsed.body).toBe("Body\n");
  });

  it("writes only Pi-supported prompt frontmatter keys", () => {
    const text = writeFrontmatter({ description: "Plan", "argument-hint": "[phase]", name: "gsd:plan-phase" }, "Body\n");

    expect(text).toBe("---\ndescription: Plan\nargument-hint: '[phase]'\n---\nBody\n");
  });

  it("writes empty supported prompt frontmatter values deterministically", () => {
    const text = writeFrontmatter({ "argument-hint": "" }, "Body\n");

    expect(text).toBe("---\nargument-hint: ''\n---\nBody\n");
  });
});

describe("prompt transforms", () => {
  it("maps official command filename to Pi prompt filename", () => {
    expect(commandFileToPiPromptName("plan-phase.md")).toBe("gsd-plan-phase.md");
  });

  it("normalizes official slash command references to Pi hyphen commands", () => {
    const input = "Run /gsd:plan-phase 1, then /gsd:new-project. Do not change http://x/y.";

    expect(normalizeGsdSlashReferences(input)).toBe("Run /gsd-plan-phase 1, then /gsd-new-project. Do not change http://x/y.");
  });

  it("normalizes official slash command references inside markdown code spans", () => {
    const input = "Run `/gsd:plan-phase` then /gsd:new-project";

    expect(normalizeGsdSlashReferences(input)).toBe("Run `/gsd-plan-phase` then /gsd-new-project");
  });

  it("does not normalize gsd references inside URL paths", () => {
    const input = "See https://example.com/gsd:plan-phase and /gsd:plan-phase";

    expect(normalizeGsdSlashReferences(input)).toBe("See https://example.com/gsd:plan-phase and /gsd-plan-phase");
  });

  it("does not normalize gsd references inside URL fragments", () => {
    const input = "See https://example.com/#/gsd:plan-phase and /gsd:plan-phase";

    expect(normalizeGsdSlashReferences(input)).toBe("See https://example.com/#/gsd:plan-phase and /gsd-plan-phase");
  });

  it("does not normalize gsd references inside URL queries", () => {
    const input = "See https://example.com/?next=/gsd:new-project and /gsd:new-project";

    expect(normalizeGsdSlashReferences(input)).toBe("See https://example.com/?next=/gsd:new-project and /gsd-new-project");
  });
});

describe("Pi subagent guidance", () => {
  it("adds guidance when prompt body mentions spawning subagents", () => {
    const body = "Spawn subagents to execute the plans.\n";

    const result = addPiSubagentGuidance(body);

    expect(result).toContain("<pi_subagents_runtime_note>");
    expect(result).toContain('subagent({ action: "list" })');
    expect(result).toContain("Spawn subagents to execute the plans.");
  });

  it("does not add guidance to prompts without delegation language", () => {
    const body = "Execute this inline without spawning anything.\n";

    expect(addPiSubagentGuidance(body)).toBe(body);
  });

  it("does not add guidance when subagent spawning is explicitly negated", () => {
    const body = "Execute inline without spawning subagents.\n";

    expect(addPiSubagentGuidance(body)).toBe(body);
  });

  it("adds guidance when spawning an official GSD agent by name", () => {
    const body = "Spawn `gsd-phase-researcher` for phase N.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when delegating to GSD subagents", () => {
    const body = "Delegates to gsd-doc-writer subagents for documentation.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when spawning an official GSD role noun", () => {
    const body = "This command spawns integration checker for cross-phase wiring.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when prompt optionally spawns research", () => {
    const body = "probing questions, optionally spawns research, then routes outputs.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when orchestrating official GSD agents by name", () => {
    const body = "Orchestrates gsd-ui-researcher and gsd-ui-checker.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when dispatching background agents", () => {
    const body = "dispatches plan to execute as background agents.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("does not add duplicate guidance", () => {
    const body = "<pi_subagents_runtime_note>Already here</pi_subagents_runtime_note>\nSpawn subagents.\n";

    expect(addPiSubagentGuidance(body)).toBe(body);
  });
});
