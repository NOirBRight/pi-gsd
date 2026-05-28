import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

export const PI_SUBAGENTS_PACKAGE_NAME = "pi-subagents";

export type PiSubagentsPackage = {
  packageRoot: string;
  packageName: string;
  version: string;
};

export function resolvePiSubagentsPackage(options: { startDir?: string } = {}): PiSubagentsPackage {
  const startDir = options.startDir ?? process.cwd();
  const require = createRequire(import.meta.url);
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve(`${PI_SUBAGENTS_PACKAGE_NAME}/package.json`, { paths: [startDir] });
  } catch {
    packageJsonPath = require.resolve(`${PI_SUBAGENTS_PACKAGE_NAME}/package.json`);
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown; version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new Error("pi-subagents package.json is missing a string version.");
  }
  return { packageRoot: dirname(packageJsonPath), packageName: PI_SUBAGENTS_PACKAGE_NAME, version: packageJson.version };
}
