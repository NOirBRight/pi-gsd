import { describe, expect, it } from "vitest";
import { classifyArtifactName } from "../src/state-reconciliation/artifacts.js";
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

describe("canonical artifact classification", () => {
  it("canonical artifact names classify with phase and plan metadata", () => {
    expect(classifyArtifactName("10-01-PLAN.md")).toEqual({
      canonical: true,
      filename: "10-01-PLAN.md",
      kind: "plan",
      phase: "10",
      plan: "01",
    });
    expect(classifyArtifactName("10-01-SUMMARY.md")).toEqual(expect.objectContaining({ canonical: true, kind: "summary", phase: "10", plan: "01" }));
    expect(classifyArtifactName("10-VERIFICATION.md")).toEqual(expect.objectContaining({ canonical: true, kind: "verification", phase: "10" }));
    expect(classifyArtifactName("10-REVIEW.md")).toEqual(expect.objectContaining({ canonical: true, kind: "review", phase: "10" }));
    expect(classifyArtifactName("10-CONTEXT.md")).toEqual(expect.objectContaining({ canonical: true, kind: "context", phase: "10" }));
  });

  it("noncanonical plan-like files are evidence and are not counted as plans", () => {
    const result = classifyArtifactName("09-PLAN-CHECK.md");

    expect(result).toEqual(expect.objectContaining({
      canonical: false,
      filename: "09-PLAN-CHECK.md",
      kind: "noncanonical",
      reasonCode: "noncanonical-plan-like-file",
      phase: "09",
    }));
    expect(result.kind).not.toBe("plan");
  });
});
