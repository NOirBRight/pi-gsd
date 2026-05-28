import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const OFFICIAL_PACKAGE_NAME = "@opengsd/get-shit-done-redux";

export interface OfficialPaths {
  commandsDir: string;
  workflowsDir: string;
  referencesDir: string;
  templatesDir: string;
  agentsDir: string;
  hooksDir: string;
  gsdTools: string;
}

export interface OfficialPackage {
  packageRoot: string;
  packageName: string;
  version: string;
  paths: OfficialPaths;
}

export class OfficialPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialPackageError";
  }
}

export function resolveOfficialPackage(options: { startDir?: string; packageName?: string } = {}): OfficialPackage {
  const startDir = options.startDir ?? process.cwd();
  const packageName = options.packageName ?? OFFICIAL_PACKAGE_NAME;

  if (!existsSync(startDir)) {
    throw missingOfficialPackageError(startDir, packageName);
  }

  const require = createRequire(import.meta.url);
  let packageJsonPath: string;

  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [startDir] });
  } catch {
    try {
      packageJsonPath = require.resolve(`${packageName}/package.json`);
    } catch {
      throw missingOfficialPackageError(startDir, packageName);
    }
  }

  const packageRoot = dirname(packageJsonPath);
  const packageJson = readPackageJson(packageJsonPath);
  const paths = buildOfficialPaths(packageRoot);

  validateRequiredPath("commands/gsd", paths.commandsDir, "directory", packageName);
  validateRequiredPath("get-shit-done/workflows", paths.workflowsDir, "directory", packageName);
  validateRequiredPath("get-shit-done/references", paths.referencesDir, "directory", packageName);
  validateRequiredPath("get-shit-done/templates", paths.templatesDir, "directory", packageName);
  validateRequiredPath("agents", paths.agentsDir, "directory", packageName);
  validateRequiredPath("hooks", paths.hooksDir, "directory", packageName);
  validateRequiredPath("get-shit-done/bin/gsd-tools.cjs", paths.gsdTools, "file", packageName);

  return {
    packageRoot,
    packageName,
    version: packageJson.version,
    paths,
  };
}

function buildOfficialPaths(packageRoot: string): OfficialPaths {
  return {
    commandsDir: join(packageRoot, "commands", "gsd"),
    workflowsDir: join(packageRoot, "get-shit-done", "workflows"),
    referencesDir: join(packageRoot, "get-shit-done", "references"),
    templatesDir: join(packageRoot, "get-shit-done", "templates"),
    agentsDir: join(packageRoot, "agents"),
    hooksDir: join(packageRoot, "hooks"),
    gsdTools: join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"),
  };
}

function readPackageJson(packageJsonPath: string): { version: string } {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };

  if (typeof packageJson.version !== "string") {
    throw new OfficialPackageError(`Official package package.json is missing a string version.`);
  }

  return { version: packageJson.version };
}

function validateRequiredPath(relativePath: string, fullPath: string, kind: "directory" | "file", packageName: string) {
  if (!existsSync(fullPath)) {
    throw missingPathError(relativePath, packageName);
  }

  const stats = statSync(fullPath);
  if (kind === "directory" && !stats.isDirectory()) {
    throw missingPathError(relativePath, packageName);
  }

  if (kind === "file" && !stats.isFile()) {
    throw missingPathError(relativePath, packageName);
  }
}

function missingOfficialPackageError(startDir: string, packageName: string) {
  return new OfficialPackageError(
    `Official GSD package not found from ${startDir}. Run: npm install ${packageName}`,
  );
}

function missingPathError(relativePath: string, packageName: string) {
  return new OfficialPackageError(
    `Official GSD package is incomplete: missing ${relativePath}. Run: npm install ${packageName}`,
  );
}
