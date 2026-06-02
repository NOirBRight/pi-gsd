import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { ToolContractSnapshot } from "./types.js";

export type WriteToolContractSnapshotOptions = {
  cwd: string;
  outDir?: string;
  outFileName?: string;
};

/**
 * Write a stable, deterministic Tool Contract snapshot to disk.
 *
 * The snapshot is the single runtime source of truth for pre-dispatch
 * contract validation (D-04) and is published with the package via
 * `package.json` `files` so downstream consumers can load by stable hash
 * without re-parsing every generated prompt/agent/workflow on each dispatch.
 */
export function writeToolContractSnapshot(snapshot: ToolContractSnapshot, options: WriteToolContractSnapshotOptions): string {
  const outDir = options.outDir ?? join(options.cwd, "generated");
  const outFileName = options.outFileName ?? "tool-contracts.json";
  const outPath = join(outDir, outFileName);
  mkdirSync(outDir, { recursive: true });
  const contentHash = calculateToolContractHash(snapshot);
  // Stamp the hash into the snapshot's contractHash for downstream consumers.
  const stamped: ToolContractSnapshot = { ...snapshot, contractHash: contentHash };
  const stampedJson = stableStringify(stamped);
  writeFileSync(outPath, `${stampedJson}\n`, "utf8");
  return outPath;
}

export function readToolContractSnapshot(path: string): ToolContractSnapshot | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as ToolContractSnapshot;
  } catch {
    return undefined;
  }
}

export function calculateToolContractHash(snapshot: ToolContractSnapshot): string {
  return createHash("sha256").update(stableStringify({ ...snapshot, contractHash: "" }), "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export { dirname };
