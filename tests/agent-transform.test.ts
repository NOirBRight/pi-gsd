import { materializeOfficialAgentPaths, transformOfficialAgentMarkdown } from "../src/agent-transform.js";

describe("transformOfficialAgentMarkdown", () => {
  it("preserves agent identity and maps known Claude tools to Pi tools", () => {
    const result = transformOfficialAgentMarkdown(`---
name: gsd-planner
description: Creates plans
tools: Read, Write, Bash, Glob, Grep
color: green
---

@~/.claude/get-shit-done/references/mandatory-initial-read.md

Plan the phase.
`);

    expect(result.unsupportedTools).toEqual([]);
    expect(result.markdown).toContain("name: gsd-planner\n");
    expect(result.markdown).toContain("description: Creates plans\n");
    expect(result.markdown).toContain("tools: read, write, bash, find, grep\n");
    expect(result.markdown).not.toContain("color:");
    expect(result.markdown).toContain("@__PI_GSD_OFFICIAL_ROOT__/get-shit-done/references/mandatory-initial-read.md");
  });

  it("omits unsupported tools and records an adapter note", () => {
    const result = transformOfficialAgentMarkdown(`---
name: gsd-researcher
description: Researches docs
tools: Read, WebFetch, WebSearch, mcp__context7__*
---

Research the topic.
`);

    expect(result.unsupportedTools).toEqual(["WebFetch", "WebSearch", "mcp__context7__*"]);
    expect(result.markdown).toContain("tools: read\n");
    expect(result.markdown).toContain("Pi adapter note: unsupported official tools omitted: WebFetch, WebSearch, mcp__context7__*");
  });

  it("omits tools frontmatter when no official tools map to Pi tools", () => {
    const result = transformOfficialAgentMarkdown(`---
name: gsd-empty
description: No mapped tools
tools: WebFetch
---

Body.
`);

    expect(result.markdown).not.toContain("tools:");
    expect(result.markdown).toContain("unsupported official tools omitted: WebFetch");
  });

  it("normalizes official GSD slash command references in agent descriptions and bodies", () => {
    const described = transformOfficialAgentMarkdown(`---
name: gsd-planner
description: Spawned by /gsd:plan-phase orchestrator
---

Body.
`);

    expect(described.markdown).toContain("description: Spawned by /gsd-plan-phase orchestrator");


    const result = transformOfficialAgentMarkdown(`---
name: gsd-roadmapper
description: Creates roadmaps
---

Next: \`/gsd:plan-phase 1\`
URL: https://example.com/#/gsd:plan-phase
`);

    expect(result.markdown).toContain("Next: `/gsd-plan-phase 1`");
    expect(result.markdown).toContain("URL: https://example.com/#/gsd:plan-phase");
  });

  it("rewrites bare HOME references to official root placeholders", () => {
    const result = transformOfficialAgentMarkdown(`---
name: gsd-runner
description: Runs GSD tools
---

Run node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs".
`);

    expect(result.markdown).toContain(
      "node \"__PI_GSD_OFFICIAL_ROOT__/get-shit-done/bin/gsd-tools.cjs\"",
    );
    expect(result.markdown).not.toContain("$HOME/.claude/get-shit-done/");
  });

  it("materializes official root placeholders for synced agents", () => {
    const materialized = materializeOfficialAgentPaths(
      "@__PI_GSD_OFFICIAL_ROOT__/get-shit-done/references/mandatory-initial-read.md\n",
      "D:\\Workstation\\pi-gsd\\node_modules\\@opengsd\\get-shit-done-redux",
    );

    expect(materialized).toBe(
      "@D:/Workstation/pi-gsd/node_modules/@opengsd/get-shit-done-redux/get-shit-done/references/mandatory-initial-read.md\n",
    );
  });
});
