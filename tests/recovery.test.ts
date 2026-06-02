import { describe, expect, it } from "vitest";
import { classifyFailure, RECOVERY_ACTIONS, RECOVERY_ACTION_VALUES, RECOVERY_CLASSES } from "../src/recovery/index.js";
import type { RecoveryAction, RecoveryClass } from "../src/recovery/index.js";
import { RECONCILIATION_REASON_CODES, type ReconciliationReasonCode } from "../src/state-reconciliation/types.js";

const classes = [
  "transient-external-failure",
  "repairable-state-drift",
  "unrepaired-state-drift",
  "worktree-invalid",
  "dispatch-contract-invalid",
  "artifact-gate-failed",
  "user-input-required",
  "internal-invariant-violation",
] satisfies RecoveryClass[];

describe("recovery classifier", () => {
  it("exposes exactly the locked recovery classes and actions", () => {
    expect(RECOVERY_CLASSES).toEqual(classes);
    expect([...new Set(Object.values(RECOVERY_ACTIONS))].sort()).toEqual([...RECOVERY_ACTION_VALUES].sort());
    expect(Object.keys(RECOVERY_ACTIONS).sort()).toEqual([...RECOVERY_CLASSES].sort());
    expect(Object.values(RECOVERY_ACTIONS)).toEqual([
      "retry",
      "self-heal",
      "pause-with-remediation",
      "stop",
      "stop",
      "pause-with-remediation",
      "pause-with-remediation",
      "stop",
    ] satisfies RecoveryAction[]);
  });

  it("maps every reconciliation reason code through an explicit class table", () => {
    const cases = RECONCILIATION_REASON_CODES.map((reasonCode) => [reasonCode, classifyFailure({ kind: "reconciliation", reasonCode })] as const);
    expect(cases.map(([reasonCode]) => reasonCode)).toEqual(RECONCILIATION_REASON_CODES satisfies readonly ReconciliationReasonCode[]);
    for (const [, decision] of cases) {
      expect(RECOVERY_CLASSES).toContain(decision.class);
      expect(decision.action).toBe(RECOVERY_ACTIONS[decision.class]);
      expect(RECOVERY_CLASSES).toContain(decision.class);
    }
  });

  it("stops partial writes and preserves written evidence", () => {
    const written = [{ reasonCode: "partial-write", path: ".planning/STATE.md", action: "update" }] as const;
    const decision = classifyFailure({ kind: "reconciliation", reasonCode: "partial-write", written: [...written] });
    expect(decision.class).toBe("internal-invariant-violation");
    expect(decision.action).toBe("stop");
    expect(decision.evidence?.written).toEqual(written);
  });

  it("covers v1 triage families with explicit classes", () => {
    expect(classifyFailure({ kind: "external", reasonCode: "provider-network" }).class).toBe("transient-external-failure");
    expect(classifyFailure({ kind: "external", reasonCode: "missing-auth" }).class).toBe("user-input-required");
    expect(classifyFailure({ kind: "dispatch", reason: "contract mismatch" }).class).toBe("dispatch-contract-invalid");
    expect(classifyFailure({ kind: "artifact-gate", reason: "missing summary" }).class).toBe("artifact-gate-failed");
    expect(classifyFailure({ kind: "reconciliation", reasonCode: "summary-count-mismatch" }).class).toBe("unrepaired-state-drift");
    expect(classifyFailure({ kind: "worktree", reasonCode: "branch-mismatch" }).class).toBe("worktree-invalid");
    expect(classifyFailure({ kind: "external", reasonCode: "internal" }).class).toBe("internal-invariant-violation");
  });
});
