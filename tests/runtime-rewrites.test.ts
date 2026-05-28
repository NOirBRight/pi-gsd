import { rewriteOfficialClaudePaths, rewriteRuntimeMessageText } from "../src/runtime-rewrites.js";

describe("runtime rewrites", () => {
  it("rewrites official Claude get-shit-done references to the resolved official package", () => {
    const text = "Read @~/.claude/get-shit-done/workflows/plan-phase.md before continuing.";

    expect(rewriteOfficialClaudePaths(text, "C:\\pkg\\root")).toBe(
      "Read @C:/pkg/root/get-shit-done/workflows/plan-phase.md before continuing.",
    );
  });

  it("rewrites official HOME-prefixed Claude get-shit-done references", () => {
    const text = "Read @$HOME/.claude/get-shit-done/workflows/plan-phase.md before continuing.";

    expect(rewriteOfficialClaudePaths(text, "C:\\pkg\\root")).toBe(
      "Read @C:/pkg/root/get-shit-done/workflows/plan-phase.md before continuing.",
    );
  });

  it("rewrites bare official Claude get-shit-done references", () => {
    const text = "Read ~/.claude/get-shit-done/workflows/plan-phase.md before continuing.";

    expect(rewriteOfficialClaudePaths(text, "C:\\pkg\\root")).toBe(
      "Read C:/pkg/root/get-shit-done/workflows/plan-phase.md before continuing.",
    );
  });

  it("normalizes slash commands and official paths together", () => {
    const text = "Next run /gsd:plan-phase and read @~/.claude/get-shit-done/references/ui-brand.md";

    expect(rewriteRuntimeMessageText(text, "/pkg/root")).toBe(
      "Next run /gsd-plan-phase and read @/pkg/root/get-shit-done/references/ui-brand.md",
    );
  });

  it("does not rewrite slash command-looking text inside URLs", () => {
    const text = "See https://example.com/#/gsd:plan-phase then run /gsd:plan-phase";

    expect(rewriteRuntimeMessageText(text, "/pkg/root")).toBe(
      "See https://example.com/#/gsd:plan-phase then run /gsd-plan-phase",
    );
  });
});
