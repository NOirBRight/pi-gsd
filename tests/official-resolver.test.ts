import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { OFFICIAL_PACKAGE_NAME, resolveOfficialPackage, OfficialPackageError } from "../src/official.js";

describe("resolveOfficialPackage", () => {
  it("finds official GSD package metadata and required paths", () => {
    const fixture = createOfficialFixture();

    const resolved = resolveOfficialPackage({ startDir: fixture.root });

    expect(resolved.packageName).toBe("@opengsd/gsd-core");
    expect(resolved.packageRoot).toBe(fixture.packageRoot);
    expect(resolved.version).toBe("1.2.3");
    expect(resolved.paths.commandsDir).toBe(join(fixture.packageRoot, "commands", "gsd"));
    expect(resolved.paths.workflowsDir).toBe(join(fixture.packageRoot, "get-shit-done", "workflows"));
    expect(resolved.paths.referencesDir).toBe(join(fixture.packageRoot, "get-shit-done", "references"));
    expect(resolved.paths.templatesDir).toBe(join(fixture.packageRoot, "get-shit-done", "templates"));
    expect(resolved.paths.agentsDir).toBe(join(fixture.packageRoot, "agents"));
    expect(resolved.paths.hooksDir).toBe(join(fixture.packageRoot, "hooks"));
    expect(resolved.paths.gsdTools).toBe(join(fixture.packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"));
  });

  it("resolves a custom official package name", () => {
    const fixture = createOfficialFixture({ packageName: "@example/custom-gsd" });

    const resolved = resolveOfficialPackage({ startDir: fixture.root, packageName: "@example/custom-gsd" });

    expect(resolved.packageName).toBe("@example/custom-gsd");
    expect(resolved.packageRoot).toBe(fixture.packageRoot);
  });

  it("defaults startDir to the current working directory", () => {
    const fixture = createOfficialFixture();
    const originalCwd = process.cwd();

    try {
      process.chdir(fixture.root);

      const resolved = resolveOfficialPackage();

      expect(resolved.packageName).toBe("@opengsd/gsd-core");
      expect(resolved.packageRoot).toBe(fixture.packageRoot);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("falls back to the wrapper dependency when the startDir has no official package", () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "pi-gsd-empty-"));

    const resolved = resolveOfficialPackage({ startDir: emptyRoot });

    expect(resolved.packageName).toBe(OFFICIAL_PACKAGE_NAME);
    expect(normalizePath(resolved.packageRoot)).toMatch(/node_modules\/@opengsd\/gsd-core$/);
  });

  it("throws an actionable error when official package is missing", () => {
    const fixture = createOfficialFixture();

    expect(() =>
      resolveOfficialPackage({ startDir: join(fixture.root, "missing"), packageName: "@example/missing-gsd" }),
    ).toThrow(OfficialPackageError);
    expect(() =>
      resolveOfficialPackage({ startDir: join(fixture.root, "missing"), packageName: "@example/missing-gsd" }),
    ).toThrow(/npm install @example\/missing-gsd/);
  });

  it("throws an actionable error when a required official path is missing", () => {
    const fixture = createOfficialFixture({ omit: ["commands/gsd"] });

    expect(() => resolveOfficialPackage({ startDir: fixture.root })).toThrow(OfficialPackageError);
    expect(() => resolveOfficialPackage({ startDir: fixture.root })).toThrow(/commands\/gsd/);
  });

  it("names the custom package when a required custom package path is missing", () => {
    const fixture = createOfficialFixture({ packageName: "@example/custom-gsd", omit: ["commands/gsd"] });

    expect(() => resolveOfficialPackage({ startDir: fixture.root, packageName: "@example/custom-gsd" })).toThrow(
      OfficialPackageError,
    );
    expect(() => resolveOfficialPackage({ startDir: fixture.root, packageName: "@example/custom-gsd" })).toThrow(
      /commands\/gsd/,
    );
    expect(() => resolveOfficialPackage({ startDir: fixture.root, packageName: "@example/custom-gsd" })).toThrow(
      /npm install @example\/custom-gsd/,
    );
  });
});

function normalizePath(path: string) {
  return path.replaceAll("\\", "/");
}
