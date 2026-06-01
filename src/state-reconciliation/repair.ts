import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { DriftDetection } from "./catalog.js";
import { applyRoadmapRepair } from "./roadmap.js";
import type { ReconciliationBlocker, ReconciliationRepair, ReconciliationWrite } from "./types.js";

export type RepairFileSystem = {
  exists(path: string): boolean;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
};

export type RepairApplicationResult = {
  ok: boolean;
  written: ReconciliationWrite[];
  blockers: ReconciliationBlocker[];
};

export function planRepairs(detection: Pick<DriftDetection, "repairs">): ReconciliationRepair[] {
  return [...detection.repairs].sort((left, right) => repairKey(left).localeCompare(repairKey(right)));
}

export function applyRepairs(
  basePath: string,
  repairs: ReconciliationRepair[],
  fs: RepairFileSystem = defaultFileSystem,
): RepairApplicationResult {
  const written: ReconciliationWrite[] = [];
  const blockers: ReconciliationBlocker[] = [];

  for (const repair of planRepairs({ repairs })) {
    const precondition = checkPreconditions(basePath, repair, fs);
    if (precondition) {
      blockers.push(written.length > 0 ? partialWriteBlocker(precondition.message, repair, written) : precondition);
      break;
    }

    const path = repair.path as string;
    try {
      const before = fs.readFile(path);
      const after = applyRepairContent(before, repair);
      if (after === before) continue;

      fs.writeFile(path, after);
      written.push({ reasonCode: repair.reasonCode, path, action: "update" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      blockers.push(partialWriteBlocker(`Failed to apply repair: ${detail}`, repair, written));
      break;
    }
  }

  return { ok: blockers.length === 0, written, blockers };
}

function repairKey(repair: ReconciliationRepair): string {
  return [
    repair.path ?? "",
    repair.phase ?? "",
    repair.plan ?? "",
    repair.reasonCode,
    repair.action,
  ].join("\0");
}

function applyRepairContent(content: string, repair: ReconciliationRepair): string {
  if (repair.action === "update-roadmap-row" || repair.action === "update-roadmap-completed") {
    return applyRoadmapRepair(content, repair);
  }
  return content;
}

function checkPreconditions(basePath: string, repair: ReconciliationRepair, fs: RepairFileSystem): ReconciliationBlocker | undefined {
  if (!repair.path) return repairBlocker("Repair target path is missing.", repair);
  if (!isInsidePlanning(basePath, repair.path)) return repairBlocker(`Repair target is outside .planning: ${repair.path}`, repair);
  if (!fs.exists(repair.path)) return repairBlocker(`Repair target does not exist: ${repair.path}`, repair);
  return undefined;
}

function isInsidePlanning(basePath: string, path: string): boolean {
  const planningRoot = resolve(basePath, ".planning");
  const target = resolve(path);
  const rel = relative(planningRoot, target);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function repairBlocker(message: string, repair: ReconciliationRepair): ReconciliationBlocker {
  return {
    reasonCode: "unknown-drift",
    message,
    evidence: repair.evidence,
    repairPlan: [repair],
    suggestedNextAction: "manual-review",
  };
}

function partialWriteBlocker(message: string, repair: ReconciliationRepair, written: ReconciliationWrite[]): ReconciliationBlocker {
  return {
    reasonCode: "partial-write",
    message,
    evidence: repair.evidence,
    repairPlan: [repair],
    written,
    suggestedNextAction: "rerun-reconcile",
  };
}

const defaultFileSystem: RepairFileSystem = {
  exists: existsSync,
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => writeFileSync(path, content, "utf8"),
};
