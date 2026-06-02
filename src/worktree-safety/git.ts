import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import type { WorktreeSafetyDeps } from "./types.js";

export function readCurrentBranch(root: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, stdio: "pipe", encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

export function hasGitMarker(root: string, deps: Pick<WorktreeSafetyDeps, "existsSync"> = defaultWorktreeSafetyDeps): boolean {
  return deps.existsSync(`${root}/.git`);
}

export const defaultWorktreeSafetyDeps: WorktreeSafetyDeps = {
  existsSync,
  lstatSync,
  readFileSync: (path) => readFileSync(path, "utf8"),
  writeFileSync: (path, content) => writeFileSync(path, content, "utf8"),
  unlinkSync,
  mkdirSync,
  cwd: () => process.cwd(),
  env: (name) => process.env[name],
  currentBranch: readCurrentBranch,
  now: () => new Date().toISOString(),
  hostname,
  pid: () => process.pid,
  isProcessAlive(pid, host) {
    if (host && host !== hostname()) return undefined;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
};
