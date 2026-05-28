import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, parse, relative, resolve } from "node:path";

export type SafeOutDirOptions = {
  officialRoot: string;
  outDir: string;
  safeRoot?: string;
};

export function assertSafeOutDir(options: SafeOutDirOptions) {
  const officialRoot = resolve(options.officialRoot);
  const outDir = resolve(options.outDir);
  const safeRoot = options.safeRoot ? resolve(options.safeRoot) : undefined;

  if (
    parse(outDir).root === outDir ||
    samePath(outDir, process.cwd()) ||
    (safeRoot !== undefined && samePath(outDir, safeRoot)) ||
    samePath(outDir, officialRoot) ||
    isInside(outDir, officialRoot) ||
    isInside(officialRoot, outDir)
  ) {
    throw new Error(`Unsafe output directory: ${outDir}`);
  }

  if (existsSync(outDir) && statSync(outDir).isDirectory() && readdirSync(outDir).length > 0 && !hasGeneratedSegment(outDir)) {
    throw new Error(`Unsafe output directory: ${outDir}`);
  }
}

function samePath(left: string, right: string) {
  return normalizePath(left) === normalizePath(right);
}

function isInside(parent: string, child: string) {
  const childRelativePath = relative(parent, child);
  return childRelativePath !== "" && !childRelativePath.startsWith("..") && !isAbsolute(childRelativePath);
}

function normalizePath(path: string) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function hasGeneratedSegment(path: string) {
  return normalizePath(path)
    .split(/[\\/]+/)
    .includes("generated");
}
