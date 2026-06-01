import { rewriteWorkflowPaths } from "../src/rewrite-workflow-paths.js";

describe("rewriteWorkflowPaths", () => {
  describe("Format 1: ~/.claude/ paths (most common)", () => {
    it("rewrites workflow path in backticks", () => {
      const input =
        "Read and execute `~/.claude/get-shit-done/workflows/discuss-phase.md` end-to-end.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/discuss-phase.md");
      expect(result).not.toContain("~/.claude/get-shit-done");
    });

    it("rewrites references path in backticks", () => {
      const input =
        "See `~/.claude/get-shit-done/references/domain-probes.md` for details.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/references/domain-probes.md");
      expect(result).not.toContain("~/.claude/get-shit-done");
    });

    it("rewrites templates path in backticks", () => {
      const input =
        "Use `~/.claude/get-shit-done/templates/context.md` as the template.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/templates/context.md");
      expect(result).not.toContain("~/.claude/get-shit-done");
    });

    it("rewrites multiple paths on different lines", () => {
      const input = [
        "Read and execute `~/.claude/get-shit-done/workflows/list-phase-assumptions.md` end-to-end.",
        "Read and execute `~/.claude/get-shit-done/workflows/discuss-phase.md` end-to-end.",
      ].join("\n");
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/list-phase-assumptions.md");
      expect(result).toContain("generated/workflows/workflows/discuss-phase.md");
      expect(result).not.toContain("~/.claude/get-shit-done");
    });

    it("rewrites paths in progressive_disclosure table rows", () => {
      const input =
        "| step | `~/.claude/get-shit-done/workflows/plan-phase/depth-1.md` | planning |";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/plan-phase/depth-1.md");
    });

    it("rewrites nested workflow reference paths", () => {
      const input =
        "Read `~/.claude/get-shit-done/workflows/discuss-phase/modes/chain.md` for chain mode.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/discuss-phase/modes/chain.md");
    });
  });

  describe("Format 2: $HOME/.claude/ paths", () => {
    it("rewrites $HOME workflow path in backticks", () => {
      const input =
        "Read and execute `$HOME/.claude/get-shit-done/workflows/graphify.md` end-to-end.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/graphify.md");
      expect(result).not.toContain("$HOME/.claude/get-shit-done");
    });

    it("rewrites $HOME references path", () => {
      const input =
        "See `$HOME/.claude/get-shit-done/references/ai-frameworks.md` for details.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/references/ai-frameworks.md");
      expect(result).not.toContain("$HOME/.claude/get-shit-done");
    });
  });

  describe("Format 3: Absolute node_modules/ paths", () => {
    it("rewrites Windows absolute node_modules path", () => {
      const input =
        "Read and execute `D:/Workstation/pi-gsd/node_modules/@opengsd/gsd-core/get-shit-done/workflows/discuss-phase.md` end-to-end.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/discuss-phase.md");
      expect(result).not.toContain("node_modules/@opengsd/gsd-core");
    });

    it("rewrites POSIX absolute node_modules path", () => {
      const input =
        "Read and execute `/home/user/project/node_modules/@opengsd/gsd-core/get-shit-done/workflows/plan-phase.md` end-to-end.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/plan-phase.md");
      expect(result).not.toContain("node_modules/@opengsd/gsd-core");
    });

    it("rewrites references path in node_modules format", () => {
      const input =
        "See `C:/project/node_modules/@opengsd/gsd-core/get-shit-done/references/domain-probes.md`.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/references/domain-probes.md");
    });
  });

  describe("Code fence protection", () => {
    it("does NOT rewrite paths inside ``` code blocks", () => {
      const input =
        "Some text\n```\n~/.claude/get-shit-done/workflows/discuss-phase.md\n```\nMore text";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("~/.claude/get-shit-done/workflows/discuss-phase.md");
    });

    it("rewrites paths OUTSIDE code blocks", () => {
      const input =
        "```\ncode block\n```\nRead `~/.claude/get-shit-done/workflows/discuss-phase.md`.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/discuss-phase.md");
    });
  });

  describe("Edge cases", () => {
    it("returns input unchanged when no paths match", () => {
      const input = "This is plain text with no path references.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toBe(input);
    });

    it("does not rewrite ~/.claude/agents/ paths (not GSD data)", () => {
      const input =
        "See agent at `~/.claude/agents/gsd-advisor-researcher.md`.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("~/.claude/agents/gsd-advisor-researcher.md");
    });

    it("does not rewrite ~/.claude/skills/ paths (not GSD data)", () => {
      const input =
        "See skill at `~/.claude/skills/gsd-dev-preferences/SKILL.md`.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("~/.claude/skills/gsd-dev-preferences/SKILL.md");
    });

    it("handles paths in progressive_disclosure sections", () => {
      const input =
        "| step | file | notes |\n|---|---|---|\n| 1 | `~/.claude/get-shit-done/workflows/execute-phase.md` | execution |";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/workflows/execute-phase.md");
    });

    it("handles paths with hyphens in filenames", () => {
      const input =
        "Read `~/.claude/get-shit-done/references/universal-anti-patterns.md`.";
      const result = rewriteWorkflowPaths(input);
      expect(result).toContain("generated/workflows/references/universal-anti-patterns.md");
    });
  });
});