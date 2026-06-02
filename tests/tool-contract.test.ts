import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileToolContracts, validateUnitToolContract, validateUnitToolContractAgainstDisk, writeToolContractSnapshot, verifyToolContractSnapshot } from "../src/tool-contract/index.js";
import { calculateToolContractHash } from "../src/tool-contract/snapshot.js";

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "pi-gsd-contract-"));
  mkdirSync(join(root, "generated", "prompts"), { recursive: true });
  mkdirSync(join(root, "generated", "agents"), { recursive: true });
  mkdirSync(join(root, "generated", "workflows", "references"), { recursive: true });
  mkdirSync(join(root, "generated", "workflows", "workflows"), { recursive: true });
  writeFileSync(join(root, "generated", "prompts", "gsd-plan-phase.md"), "# plan\nValidate PLAN.md\n", "utf8");
  writeFileSync(join(root, "generated", "prompts", "gsd-plan-review-convergence.md"), "# plan check\nReview PLAN.md\n", "utf8");
  writeFileSync(join(root, "generated", "prompts", "gsd-execute-phase.md"), "# execute\nCreate SUMMARY.md\n", "utf8");
  writeFileSync(join(root, "generated", "prompts", "gsd-ship.md"), "# ship\nUpdate ROADMAP.md and STATE.md\n", "utf8");
  writeFileSync(join(root, "generated", "agents", "gsd-planner.md"), "---\nname: gsd-planner\ntools: [Read, Write, Grep]\n---\nplanner\n", "utf8");
  writeFileSync(join(root, "generated", "agents", "gsd-executor.md"), "---\nname: gsd-executor\ntools: [Read, Write, Edit, Bash]\n---\nexecutor\n", "utf8");
  writeFileSync(join(root, "generated", "agents", "gsd-plan-checker.md"), "---\nname: gsd-plan-checker\ntools: [read, bash, find, grep]\n---\nchecker\n", "utf8");
  writeFileSync(join(root, "generated", "workflows", "workflows", "code-review-fix.md"), "# fix\nCreate REVIEW-FIX.md\n", "utf8");
  return root;
}

describe("tool contract compiler and snapshot", () => {
  it("compiles generated-first contracts for dispatchable units", () => {
    const root = fixtureRoot();
    const snapshot = compileToolContracts({ cwd: root });
    const plan = snapshot.contracts.find((contract) => contract.unitType === "plan");
    expect(plan).toMatchObject({ unitType: "plan", promptPath: "generated/prompts/gsd-plan-phase.md", agent: "gsd-planner" });
    expect(plan?.allowedTools).toEqual(expect.arrayContaining(["Read", "Write"]));
    expect(plan?.agentPath).toBe("generated/agents/gsd-planner.md");
    expect(plan?.sourcePaths.every((path) => !path.includes("\\"))).toBe(true);
    const planCheck = snapshot.contracts.find((contract) => contract.unitType === "plan-check");
    expect(planCheck).toMatchObject({
      unitType: "plan-check",
      promptPath: "generated/prompts/gsd-plan-review-convergence.md",
    });
    expect(planCheck?.agent).toBeUndefined();
    expect(planCheck?.agentPath).toBeUndefined();
    expect(planCheck?.sourcePaths).toEqual(["generated/prompts/gsd-plan-review-convergence.md"]);
    expect(snapshot.contracts.map((contract) => String(contract.unitType))).not.toContain("code-review-fix");
    expect(snapshot.contractHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects supplement overlays that relax upstream tools", () => {
    const root = fixtureRoot();
    expect(() => compileToolContracts({ cwd: root, overlay: { plan: { allowedTools: ["Read"] } } })).toThrow(/cannot relax/i);
  });

  it("verifyToolContractSnapshot fails when the snapshot hash is mismatched", () => {
    const root = fixtureRoot();
    const snapshot = compileToolContracts({ cwd: root });
    mkdirSync(join(root, "generated"), { recursive: true });
    writeFileSync(join(root, "generated", "tool-contracts.json"), JSON.stringify({ ...snapshot, contractHash: "bad-hash" }), "utf8");

    const result = verifyToolContractSnapshot({ cwd: root });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ failedField: "contractHash", unitType: "snapshot" });
  });

  it("verifies dispatch-critical drift and warns for prompt prose drift", () => {
    const root = fixtureRoot();
    const snapshot = compileToolContracts({ cwd: root });
    writeToolContractSnapshot(snapshot, { cwd: root });
    writeFileSync(join(root, "generated", "prompts", "gsd-plan-phase.md"), "# plan changed prose only\nValidate PLAN.md\n", "utf8");
    expect(verifyToolContractSnapshot({ cwd: root }).ok).toBe(true);
    expect(verifyToolContractSnapshot({ cwd: root }).warnings.map((w) => w.field).join("\n")).toContain("promptHash");
    writeFileSync(join(root, "generated", "agents", "gsd-planner.md"), "---\nname: gsd-planner\ntools: [Read]\n---\nplanner\n", "utf8");
    const result = verifyToolContractSnapshot({ cwd: root });
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ failedField: "allowedTools", unitType: "plan" });
  });

  it("fails cheap validation when the snapshot hash is tampered", () => {
    const root = fixtureRoot();
    const snapshot = compileToolContracts({ cwd: root });
    const tampered = { ...snapshot, contracts: snapshot.contracts.slice(1) };

    const result = validateUnitToolContract({ id: "12:plan", type: "plan", status: "pending", phase: "12", label: "Plan", required: true, source: "default" }, { snapshot: tampered });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toMatchObject({ failedField: "contractHash", unitType: "plan" });
  });

  it("validates Unit dispatch inputs with bounded evidence", () => {
    const root = fixtureRoot();
    const snapshot = compileToolContracts({ cwd: root });
    const valid = validateUnitToolContract({ id: "12:plan", type: "plan", status: "pending", phase: "12", label: "Plan", required: true, source: "default" }, { snapshot });
    expect(valid.ok).toBe(true);
    const missingPlanCheck = { ...snapshot, contracts: snapshot.contracts.filter((contract) => contract.unitType !== "plan-check"), contractHash: "" };
    missingPlanCheck.contractHash = calculateToolContractHash(missingPlanCheck);
    const invalid = validateUnitToolContract({ id: "12:plan", type: "plan-check", status: "pending", phase: "12", label: "Plan", required: true, source: "default" }, { snapshot: missingPlanCheck });
    expect(invalid.ok).toBe(false);
    expect(!invalid.ok && invalid.failure).toMatchObject({ unitId: "12:plan", unitType: "plan-check", failedField: "unitType" });
    expect(JSON.stringify(!invalid.ok && invalid.failure)).not.toContain("# plan");
  });

  it("fails disk validation when a stale prompt-only snapshot points to an unexpected agent", () => {
    const root = fixtureRoot();
    const snapshot = compileToolContracts({ cwd: root });
    const stale = {
      ...snapshot,
      contracts: snapshot.contracts.map((contract) => contract.unitType === "plan-check"
        ? { ...contract, agent: "gsd-planner", agentPath: "generated/agents/gsd-planner.md" }
        : contract),
      contractHash: "",
    };
    stale.contractHash = calculateToolContractHash(stale);

    const result = validateUnitToolContractAgainstDisk({
      cwd: root,
      snapshot: stale,
      unit: { id: "12:plan-check", type: "plan-check", status: "pending", phase: "12", label: "Plan Check", required: true, source: "default" },
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toMatchObject({
      unitId: "12:plan-check",
      unitType: "plan-check",
      failedField: "agent",
      expected: "none",
      actual: "gsd-planner",
    });
  });
});
