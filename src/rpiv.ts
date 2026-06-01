import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const RPIV_PACKAGE_NAME = "@juicesharp/rpiv-ask-user-question";

export type RpivPackage = {
  packageRoot: string;
  packageName: string;
  version: string;
};

/**
 * Resolves the @juicesharp/rpiv-ask-user-question package.
 * Throws if the package cannot be found or has no valid version.
 */
export function resolveRpivPackage(options: { startDir?: string } = {}): RpivPackage {
  const startDir = options.startDir ?? process.cwd();
  const require = createRequire(import.meta.url);

  // Strategy 1: resolve package.json directly (works when exports allow it)
  let packageJsonPath: string | undefined;
  try {
    packageJsonPath = require.resolve(`${RPIV_PACKAGE_NAME}/package.json`, { paths: [startDir] });
  } catch {
    try {
      packageJsonPath = require.resolve(`${RPIV_PACKAGE_NAME}/package.json`);
    } catch {
      // package.json not exported — fall through to strategy 2
    }
  }

  // Strategy 2: resolve the package entrypoint, then walk up to find package.json
  if (!packageJsonPath) {
    try {
      const entryPath = require.resolve(RPIV_PACKAGE_NAME, { paths: [startDir] });
      // Walk up from the resolved entry to find the nearest package.json
      let dir = dirname(entryPath);
      for (let i = 0; i < 10; i++) {
        const candidate = join(dir, "package.json");
        try {
          readFileSync(candidate, "utf8");
          packageJsonPath = candidate;
          break;
        } catch {
          const parent = dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
      }
    } catch {
      // Package not found at all
    }
  }

  if (!packageJsonPath) {
    throw new Error(`Cannot resolve ${RPIV_PACKAGE_NAME}. Install with: pi install npm:${RPIV_PACKAGE_NAME}`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown; version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new Error(`@juicesharp/rpiv-ask-user-question package.json is missing a string version.`);
  }
  return { packageRoot: dirname(packageJsonPath), packageName: RPIV_PACKAGE_NAME, version: packageJson.version };
}