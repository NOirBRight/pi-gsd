import type { DriftDetection } from "./catalog.js";
import type { ReconciliationRepair } from "./types.js";

export function planRepairs(detection: Pick<DriftDetection, "repairs">): ReconciliationRepair[] {
  return [...detection.repairs].sort((left, right) => repairKey(left).localeCompare(repairKey(right)));
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
