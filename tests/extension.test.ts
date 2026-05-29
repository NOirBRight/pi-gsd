import { rewriteMessageForRuntime } from "../src/extension.js";

describe("piGsdExtension message rewriting", () => {
  it("rewrites assistant next-step slash commands", () => {
    const message = {
      role: "assistant",
      content: "Next: /gsd:plan-phase 1, then /gsd:complete-milestone",
    };

    expect(rewriteMessageForRuntime(message, "/pkg/root")).toEqual({
      role: "assistant",
      content: "Next: /gsd-plan-phase 1, then /gsd-complete-milestone",
    });
  });

  it("rewrites text blocks without changing the role", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: "Run /gsd:complete-milestone" },
        { type: "image", source: "unchanged" },
      ],
    };

    expect(rewriteMessageForRuntime(message, "/pkg/root")).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Run /gsd-complete-milestone" },
        { type: "image", source: "unchanged" },
      ],
    });
  });
});
