import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { resolveRpivPackage } from "../src/rpiv.js";
import { createOfficialFixture } from "./fixtures.js";

describe("resolveRpivPackage", () => {
  it("resolves rpiv from Pi's npm package store", () => {
    const fixture = createOfficialFixture();
    const agentDir = mkdtempSync(join(tmpdir(), "pi-gsd-rpiv-agent-"));
    const packageRoot = join(agentDir, "npm", "node_modules", "@juicesharp", "rpiv-ask-user-question");
    const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@juicesharp/rpiv-ask-user-question", version: "1.17.1" }), "utf8");
    process.env.PI_CODING_AGENT_DIR = agentDir;

    try {
      const resolved = resolveRpivPackage({ startDir: fixture.root });

      expect(resolved.packageName).toBe("@juicesharp/rpiv-ask-user-question");
      expect(resolved.version).toBe("1.17.1");
      expect(resolved.packageRoot).toBe(packageRoot);
    } finally {
      if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
    }
  });
});
