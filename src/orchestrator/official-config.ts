import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OFFICIAL_PACKAGE_NAME, resolveOfficialPackage } from "../official.js";

export type OfficialWorkflowConfig = {
  official: {
    packageName: string;
    version: string;
    packageRoot: string;
  };
  defaults: {
    workflow: Record<string, unknown>;
  };
  schema: {
    validKeys: string[];
    workflowKeys: string[];
  };
};

export function loadOfficialWorkflowConfig(options: { startDir?: string; officialRoot?: string } = {}): OfficialWorkflowConfig {
  const official = options.officialRoot
    ? {
        packageName: OFFICIAL_PACKAGE_NAME,
        version: readPackageVersion(options.officialRoot),
        packageRoot: options.officialRoot,
        paths: {
          configDefaultsManifest: join(options.officialRoot, "get-shit-done", "bin", "shared", "config-defaults.manifest.json"),
          configSchemaManifest: join(options.officialRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json"),
        },
      }
    : resolveOfficialPackage({ startDir: options.startDir });

  const defaults = readJson(official.paths.configDefaultsManifest);
  const schema = readJson(official.paths.configSchemaManifest);
  const workflow = isRecord(defaults.workflow) ? defaults.workflow : {};
  const validKeys = Array.isArray(schema.valid_keys)
    ? schema.valid_keys.filter((key): key is string => typeof key === "string")
    : Array.isArray(schema.validKeys)
      ? schema.validKeys.filter((key): key is string => typeof key === "string")
      : [];

  return {
    official: {
      packageName: official.packageName,
      version: official.version,
      packageRoot: official.packageRoot,
    },
    defaults: { workflow },
    schema: {
      validKeys,
      workflowKeys: validKeys.filter((key) => key.startsWith("workflow.")),
    },
  };
}

function readPackageVersion(officialRoot: string): string {
  try {
    const parsed = readJson(join(officialRoot, "package.json"));
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
