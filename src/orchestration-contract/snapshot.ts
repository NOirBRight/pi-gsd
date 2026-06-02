import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OrchestrationContractSnapshot } from "./types.js";

export type WriteOrchestrationContractSnapshotOptions = {
  cwd: string;
  outDir?: string;
  outFileName?: string;
};

export function calculateOrchestrationContractHash(snapshot: OrchestrationContractSnapshot): string {
  return createHash("sha256")
    .update(stableStringify({ ...snapshot, contractHash: "" }), "utf8")
    .digest("hex");
}

export function writeOrchestrationContractSnapshot(
  snapshot: OrchestrationContractSnapshot,
  options: WriteOrchestrationContractSnapshotOptions,
): string {
  const outDir = options.outDir ?? join(options.cwd, "generated");
  const outFileName = options.outFileName ?? "orchestration-contract.json";
  const outPath = join(outDir, outFileName);
  mkdirSync(outDir, { recursive: true });
  const stamped: OrchestrationContractSnapshot = {
    ...snapshot,
    contractHash: calculateOrchestrationContractHash(snapshot),
  };
  writeFileSync(outPath, `${stableStringify(stamped)}\n`, "utf8");
  return outPath;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
}
