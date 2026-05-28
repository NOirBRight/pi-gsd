import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const requiredDirectories = [
  "commands/gsd",
  "get-shit-done/workflows",
  "get-shit-done/references",
  "get-shit-done/templates",
  "agents",
  "hooks",
];

export function createOfficialFixture(options: { omit?: string[]; packageName?: string } = {}) {
  const root = mkdtempRoot();
  const packageName = options.packageName ?? "@opengsd/get-shit-done-redux";
  const packageRoot = join(root, "node_modules", ...packageName.split("/"));
  const omitted = new Set(options.omit ?? []);

  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version: "1.2.3",
      },
      null,
      2,
    ),
  );

  for (const requiredDirectory of requiredDirectories) {
    if (!omitted.has(requiredDirectory)) {
      mkdirSync(join(packageRoot, requiredDirectory), { recursive: true });
    }
  }

  if (!omitted.has("commands/gsd")) {
    writeFileSync(join(packageRoot, "commands", "gsd", "plan-phase.md"), "# Plan Phase\n");
  }

  if (!omitted.has("get-shit-done/bin/gsd-tools.cjs")) {
    mkdirSync(join(packageRoot, "get-shit-done", "bin"), { recursive: true });
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"), "module.exports = {};\n");
  }

  return { root, packageRoot };
}

function mkdtempRoot() {
  return mkdtempSync(join(tmpdir(), "pi-gsd-official-"));
}
