import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSourceWritingUnit, leaseAcquiredEvent, leaseReleasedEvent, leaseStaleReclaimedEvent, prepareUnitRoot, releaseLeaseOwnership } from "../src/worktree-safety/index.js";
import type { PrepareUnitRootInput, WorktreeSafetyDeps } from "../src/worktree-safety/index.js";

function rootFixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-gsd-worktree-"));
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, ".planning"), { recursive: true });
  return root;
}

function deps(root: string, branch = "worktree-agent-test", extras: Partial<WorktreeSafetyDeps> = {}): Partial<WorktreeSafetyDeps> {
  return {
    cwd: () => root,
    env: (name) => name === "GSD_PROJECT_ROOT" ? root : undefined,
    currentBranch: () => branch,
    hostname: () => "host-a",
    pid: () => 100,
    now: () => "2026-06-02T00:00:00.000Z",
    ...extras,
  };
}

function input(root: string, extra: Partial<PrepareUnitRootInput> = {}): PrepareUnitRootInput {
  return { unitType: "execute", unitId: "11:execute", phase: "11", projectRoot: root, unitRoot: root, expectedBranch: "worktree-agent-test", workflow: { worktrees: false }, deps: deps(root), ...extra };
}

describe("worktree safety", () => {
  it("classifies source-writing and read-only units explicitly", () => {
    expect(isSourceWritingUnit("execute")).toBe(true);
    for (const type of ["discuss", "research", "plan", "plan-check", "code-review"] as const) {
      expect(isSourceWritingUnit(type)).toBe(false);
    }
  });

  it("returns ok/not-required evidence for read-only units without lease validation", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-readonly-"));
    const result = prepareUnitRoot({ unitType: "plan", unitId: "11:plan", projectRoot: root, unitRoot: root, workflow: { worktrees: true }, deps: deps(root) });
    expect(result.ok).toBe(true);
    expect(result.ok && result.evidence.messages?.[0]).toContain("does not require");
  });

  it("fails closed when .git is missing, including workflow.worktrees=false", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-no-git-"));
    const result = prepareUnitRoot(input(root, { deps: deps(root) }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.decision.class).toBe("worktree-invalid");
    expect(!result.ok && result.decision.action).toBe("stop");
  });

  it("rejects branch mismatch without checkout side effects", () => {
    const root = rootFixture();
    const result = prepareUnitRoot(input(root, { deps: deps(root, "main") }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.decision.class).toBe("worktree-invalid");
    expect(!result.ok && result.decision.evidence?.expectedBranch).toBe("worktree-agent-test");
  });

  it("rejects GSD_PROJECT_ROOT mismatch with required evidence", () => {
    const root = rootFixture();
    const result = prepareUnitRoot(input(root, { deps: deps(root, "worktree-agent-test", { env: (name) => name === "GSD_PROJECT_ROOT" ? join(root, "other") : undefined }) }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.decision.evidence).toEqual(expect.objectContaining({ expectedProjectRoot: root, resolvedUnitRoot: root, unitId: "11:execute", unitType: "execute", branch: "worktree-agent-test" }));
  });

  it("acquires a lease and emits bounded journal evidence when worktrees are enabled", () => {
    const root = rootFixture();
    const result = prepareUnitRoot(input(root, { workflow: { worktrees: true } }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.evidence.journalEvents?.[0]).toEqual(expect.objectContaining({ type: "lease_acquired", unitId: "11:execute", phase: "11", branch: "worktree-agent-test" }));
  });

  it("malformed existing lease JSON fails closed and is not overwritten", () => {
    const root = rootFixture();
    const leasePath = join(root, ".planning", "worktree-leases", "lease.json");
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(leasePath, "{not-json", "utf8");

    const result = prepareUnitRoot(input(root, { workflow: { worktrees: true } }));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.decision.class).toBe("user-input-required");
    expect(!result.ok && result.decision.reasonCode).toBe("lease-invalid");
    expect(!result.ok && result.decision.evidence?.paths).toEqual([leasePath]);
    expect(readFileSync(leasePath, "utf8")).toBe("{not-json");
  });

  it.each(["null", "false"])("malformed existing lease JSON value %s fails closed and is not overwritten", (leaseContent) => {
    const root = rootFixture();
    const leasePath = join(root, ".planning", "worktree-leases", "lease.json");
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(leasePath, leaseContent, "utf8");

    const result = prepareUnitRoot(input(root, { workflow: { worktrees: true } }));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.decision.class).toBe("user-input-required");
    expect(!result.ok && result.decision.reasonCode).toBe("lease-invalid");
    expect(!result.ok && result.decision.evidence?.paths).toEqual([leasePath]);
    expect(readFileSync(leasePath, "utf8")).toBe(leaseContent);
  });

  it("injected unlink failure returns a typed recovery decision instead of throwing", () => {
    const root = rootFixture();
    const leasePath = join(root, ".planning", "worktree-leases", "lease.json");
    const owner = { unitId: "11:execute", sessionId: "session-a", phase: "11", branch: "worktree-agent-test", root, host: "host-a", pid: 100 };
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(leasePath, JSON.stringify(owner), "utf8");

    const result = releaseLeaseOwnership(input(root, { sessionId: "session-a", workflow: { worktrees: true }, deps: deps(root, "worktree-agent-test", { unlinkSync: () => { throw new Error("locked lease"); } }) }), root, "worktree-agent-test");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.decision.class).toBe("worktree-invalid");
    expect(!result.ok && result.decision.reasonCode).toBe("lease-release-failed");
    expect(!result.ok && result.decision.evidence?.paths).toEqual([leasePath]);
    expect(!result.ok && result.decision.evidence?.messages).toEqual(["locked lease"]);
    expect(readFileSync(leasePath, "utf8")).toContain("11:execute");
  });

  it("wrong lease owner stops with ownership evidence", () => {
    const root = rootFixture();
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(join(root, ".planning", "worktree-leases", "lease.json"), JSON.stringify({ unitId: "other", sessionId: "s", phase: "11", branch: "worktree-agent-test", root, host: "host-a", pid: 100 }), "utf8");
    const result = prepareUnitRoot(input(root, { workflow: { worktrees: true } }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.decision.class).toBe("worktree-invalid");
    expect(!result.ok && result.decision.action).toBe("stop");
    expect(!result.ok && result.decision.evidence).toEqual(expect.objectContaining({ unitId: "11:execute", phase: "11", branch: "worktree-agent-test" }));
  });

  it("proven inactive stale lease with matching root and branch self-heals with stale reclaim event", () => {
    const root = rootFixture();
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(join(root, ".planning", "worktree-leases", "lease.json"), JSON.stringify({ unitId: "other", phase: "11", branch: "worktree-agent-test", root, host: "host-a", pid: 999 }), "utf8");
    const result = prepareUnitRoot(input(root, { workflow: { worktrees: true }, deps: deps(root, "worktree-agent-test", { isProcessAlive: () => false }) }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.evidence.journalEvents?.[0].type).toBe("lease_stale_reclaimed");
  });

  it("incomplete or contradictory stale leases pause with remediation", () => {
    const root = rootFixture();
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(join(root, ".planning", "worktree-leases", "lease.json"), JSON.stringify({ unitId: "other", phase: "11" }), "utf8");
    const incomplete = prepareUnitRoot(input(root, { workflow: { worktrees: true }, deps: deps(root, "worktree-agent-test", { isProcessAlive: () => undefined }) }));
    expect(incomplete.ok).toBe(false);
    expect(!incomplete.ok && incomplete.decision.action).toBe("pause-with-remediation");
    expect(!incomplete.ok && incomplete.decision.class).not.toBe("worktree-invalid");

    const root2 = rootFixture();
    mkdirSync(join(root2, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(join(root2, ".planning", "worktree-leases", "lease.json"), JSON.stringify({ unitId: "other", phase: "11", branch: "main", root: root2, host: "host-a", pid: 999 }), "utf8");
    const contradictory = prepareUnitRoot(input(root2, { workflow: { worktrees: true }, deps: deps(root2, "worktree-agent-test", { isProcessAlive: () => undefined }) }));
    expect(contradictory.ok).toBe(false);
    expect(!contradictory.ok && contradictory.decision.action).toBe("pause-with-remediation");
    expect(!contradictory.ok && contradictory.decision.class).not.toBe("worktree-invalid");
  });

  it("releases an owned lease and emits bounded journal evidence from the real operation", () => {
    const root = rootFixture();
    const leasePath = join(root, ".planning", "worktree-leases", "lease.json");
    const owner = { unitId: "11:execute", sessionId: "session-a", phase: "11", branch: "worktree-agent-test", root, host: "host-a", pid: 100 };
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(leasePath, JSON.stringify(owner), "utf8");

    const result = releaseLeaseOwnership(input(root, { sessionId: "session-a", workflow: { worktrees: true }, attempt: 2 }), root, "worktree-agent-test");

    expect(result.ok).toBe(true);
    expect(result.ok && result.journalEvents).toHaveLength(1);
    expect(result.ok && result.journalEvents?.[0]).toEqual(expect.objectContaining({ type: "lease_released", unitId: "11:execute", phase: "11", root, branch: "worktree-agent-test", attempt: 2, action: "self-heal", recoveryClass: "repairable-state-drift", reasonCode: "lease-released" }));
    expect(existsSync(leasePath)).toBe(false);
  });

  it("does not emit release evidence for wrong-owner or missing leases", () => {
    const root = rootFixture();
    mkdirSync(join(root, ".planning", "worktree-leases"), { recursive: true });
    writeFileSync(join(root, ".planning", "worktree-leases", "lease.json"), JSON.stringify({ unitId: "other", sessionId: "session-a", phase: "11", branch: "worktree-agent-test", root, host: "host-a", pid: 100 }), "utf8");

    const wrongOwner = releaseLeaseOwnership(input(root, { sessionId: "session-a", workflow: { worktrees: true } }), root, "worktree-agent-test");
    expect(wrongOwner.ok).toBe(false);
    expect(!wrongOwner.ok && wrongOwner.decision.class).toBe("worktree-invalid");
    expect(!wrongOwner.ok && wrongOwner.decision.evidence?.journalEvents).toBeUndefined();
    expect(readFileSync(join(root, ".planning", "worktree-leases", "lease.json"), "utf8")).toContain("other");

    const missingRoot = rootFixture();
    const missing = releaseLeaseOwnership(input(missingRoot, { workflow: { worktrees: true } }), missingRoot, "worktree-agent-test");
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.decision.class).toBe("worktree-invalid");
    expect(!missing.ok && missing.decision.evidence?.journalEvents).toBeUndefined();
  });

  it("release rejects lease paths outside .planning without deleting", () => {
    const root = rootFixture();
    const outside = join(root, "lease.json");
    writeFileSync(outside, JSON.stringify({ unitId: "11:execute" }), "utf8");

    const result = releaseLeaseOwnership(input(root, { workflow: { worktrees: true }, leasePath: outside }), root, "worktree-agent-test");

    expect(result.ok).toBe(false);
    expect(existsSync(outside)).toBe(true);
  });

  it("rejects lease paths outside .planning without writing", () => {
    const root = rootFixture();
    const outside = join(root, "lease.json");
    const result = prepareUnitRoot(input(root, { workflow: { worktrees: true }, leasePath: outside }));
    expect(result.ok).toBe(false);
    expect(existsSync(outside)).toBe(false);
  });

  it("lease event builders expose bounded D-18 fields", () => {
    const record = { unitId: "11:execute", phase: "11", root: "/tmp/root", branch: "worktree-agent-test", host: "host-a", pid: 100 };
    expect(leaseAcquiredEvent(record)).toEqual(expect.objectContaining({ type: "lease_acquired", unitId: "11:execute", action: "self-heal", recoveryClass: "repairable-state-drift" }));
    expect(leaseReleasedEvent(record)).toEqual(expect.objectContaining({ type: "lease_released" }));
    expect(leaseStaleReclaimedEvent(record)).toEqual(expect.objectContaining({ type: "lease_stale_reclaimed" }));
  });
});
