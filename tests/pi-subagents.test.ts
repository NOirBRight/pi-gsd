import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { resolvePiSubagentsPackage } from "../src/pi-subagents.js";

describe("resolvePiSubagentsPackage", () => {
  it("resolves pi-subagents package metadata from cwd", () => {
    const fixture = createOfficialFixture();
    const packageRoot = join(fixture.root, "node_modules", "pi-subagents");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "pi-subagents", version: "0.25.0" }), "utf8");

    const resolved = resolvePiSubagentsPackage({ startDir: fixture.root });

    expect(resolved.packageName).toBe("pi-subagents");
    expect(resolved.version).toBe("0.25.0");
    expect(resolved.packageRoot).toBe(packageRoot);
  });
});
