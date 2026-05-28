import { splitFrontmatter, writeFrontmatter } from "../src/frontmatter.js";
import { commandFileToPiPromptName, normalizeGsdSlashReferences } from "../src/prompt-transform.js";

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
