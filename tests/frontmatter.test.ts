import { describe, expect, it } from "vitest";
import { splitFrontmatter, writeFrontmatter, type FrontmatterData } from "../src/frontmatter.js";

describe("splitFrontmatter", () => {
  it("parses simple key-value frontmatter", () => {
    const input = `---
description: Test command
argument-hint: "<phase>"
---
Body content`;
    const result = splitFrontmatter(input);
    expect(result.data.description).toBe("Test command");
    expect(result.data["argument-hint"]).toBe("<phase>");
    expect(result.body).toContain("Body content");
  });

  it("parses list values (allowed-tools, requires)", () => {
    const input = `---
name: gsd:settings
description: Configure settings
allowed-tools:
  - Read
  - Write
  - Bash
requires: [quick]
---
Body`;
    const result = splitFrontmatter(input);
    expect(result.data.description).toBe("Configure settings");
    expect(result.data["allowed-tools"]).toEqual(["Read", "Write", "Bash"]);
    expect(result.data.requires).toBe("[quick]");
  });

  it("parses YAML block scalar (argument-instructions with |)", () => {
    const input = `---
description: Generate tests
argument-hint: "<phase> [additional instructions]"
argument-instructions: |
  Parse the argument as a phase number (integer, decimal, or letter-suffix), plus optional free-text instructions.
  Example: /gsd-add-tests 12
  Example: /gsd-add-tests 12 focus on edge cases
requires: [phase]
---
Body`;
    const result = splitFrontmatter(input);
    expect(result.data["argument-instructions"]).toBe(
      "Parse the argument as a phase number (integer, decimal, or letter-suffix), plus optional free-text instructions.\nExample: /gsd-add-tests 12\nExample: /gsd-add-tests 12 focus on edge cases",
    );
    expect(result.data.requires).toBe("[phase]");
  });

  it("returns empty data for input without frontmatter", () => {
    const input = "Just body content without frontmatter";
    const result = splitFrontmatter(input);
    expect(result.data).toEqual({});
    expect(result.body).toBe(input);
  });
});

describe("writeFrontmatter", () => {
  it("writes simple key-value pairs", () => {
    const data: FrontmatterData = {
      description: "Test command",
      "argument-hint": "<phase>",
    };
    const result = writeFrontmatter(data, "Body content");
    expect(result).toContain("description: Test command");
    expect(result).toContain("argument-hint:");
    expect(result).toContain("Body content");
  });

  it("writes list values as YAML array", () => {
    const data: FrontmatterData = {
      description: "Test",
      requires: ["phase", "config"],
    };
    const result = writeFrontmatter(data, "Body");
    expect(result).toContain("requires:");
    expect(result).toContain("  - phase");
    expect(result).toContain("  - config");
  });

  it("writes multi-line strings as YAML block scalar", () => {
    const data: FrontmatterData = {
      description: "Test",
      "argument-instructions": "Parse the argument.\nExample: /gsd-test 12",
    };
    const result = writeFrontmatter(data, "Body");
    expect(result).toContain("argument-instructions: |");
    expect(result).toContain("  Parse the argument.");
    expect(result).toContain("  Example: /gsd-test 12");
  });

  it("preserves argument-instructions through round-trip", () => {
    const input = `---
description: Generate tests
argument-hint: "<phase> [additional instructions]"
argument-instructions: |
  Parse the argument as a phase number, plus optional free-text.
  Example: /gsd-add-tests 12
requires: [phase]
---
Body`;
    const parsed = splitFrontmatter(input);
    const written = writeFrontmatter(parsed.data, parsed.body);
    expect(written).toContain("argument-instructions: |");
    expect(written).toContain("  Parse the argument as a phase number, plus optional free-text.");
    expect(written).toContain("  Example: /gsd-add-tests 12");
  });

  it("drops unsupported keys (allowed-tools, name, type)", () => {
    const data: FrontmatterData = {
      name: "gsd:settings",
      description: "Configure settings",
      "allowed-tools": ["Read", "Write"],
      type: "prompt",
    };
    const result = writeFrontmatter(data, "Body");
    expect(result).not.toContain("name:");
    expect(result).not.toContain("allowed-tools:");
    expect(result).not.toContain("type:");
    expect(result).toContain("description: Configure settings");
  });

  it("quotes values containing special characters", () => {
    const data: FrontmatterData = {
      description: "Configure GSD workflow toggles and model profile",
      requires: "[quick]",
    };
    const result = writeFrontmatter(data, "Body");
    expect(result).toContain("requires: '[quick]'");
  });
});