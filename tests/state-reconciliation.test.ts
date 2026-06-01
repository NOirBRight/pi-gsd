import { describe, expect, it } from "vitest";
import { RECONCILIATION_REASON_CODES } from "../src/state-reconciliation/types.js";
import type { ReconciledStateSnapshot, ReconciliationReasonCode, ReconciliationReport } from "../src/state-reconciliation/types.js";

describe("state reconciliation contracts", () => {
  it("contracts expose the minimal structured report fields", () => {
    const snapshot = {
      phasesPath: ".planning/phases",
      phases: [],
      totals: {
        plans: 0,
        summaries: 0,
        verifications: 0,
        reviews: 0,
        contexts: 0,
        noncanonical: 0,
      },
    } satisfies ReconciledStateSnapshot;

    const report = {
      ok: true,
      snapshot,
      repairs: [],
      blockers: [],
      written: [],
      evidence: [],
    } satisfies ReconciliationReport;

    expect(Object.keys(report).sort()).toEqual(["blockers", "evidence", "ok", "repairs", "snapshot", "written"]);
  });

  it("contracts accept the known drift reason codes", () => {
    const reasonCodes = [
      "sketch-flag-drift",
      "completion-timestamp-drift",
      "roadmap-divergence",
      "stale-worker",
      "unregistered-milestone",
      "summary-count-mismatch",
      "noncanonical-plan-like-file",
      "unknown-drift",
      "partial-write",
    ] satisfies ReconciliationReasonCode[];

    expect(reasonCodes).toContain("summary-count-mismatch");
    expect(reasonCodes).toContain("noncanonical-plan-like-file");
    expect(reasonCodes).toContain("unknown-drift");
    expect(reasonCodes).toContain("partial-write");
    expect(RECONCILIATION_REASON_CODES).toEqual(reasonCodes);
  });
});
