import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateOrchestrationContractHash, compileOrchestrationContract, verifyOrchestrationContractSnapshot } from "../src/orchestration-contract/index.js";
import type { OrchestrationContractSnapshot } from "../src/orchestration-contract/index.js";

function fixtureRoot() {
  return mkdtempSync(join(tmpdir(), "pi-gsd-orchestration-contract-"));
}

function writeGeneratedWorkflowFixture(root: string) {
  mkdirSync(join(root, "generated", "workflows", "workflows", "discuss-phase", "modes"), { recursive: true });
  mkdirSync(join(root, "generated", "workflows", "workflows"), { recursive: true });
  writeFileSync(join(root, "generated", "workflows", "workflows", "discuss-phase", "modes", "chain.md"), [
    'Skill(skill="gsd-plan-phase", args="${PHASE} --auto ${GSD_WS}")',
    "Auto-advance pipeline finished: discuss -> plan -> execute",
  ].join("\n"), "utf8");
  writeFileSync(join(root, "generated", "workflows", "workflows", "plan-phase.md"), [
    'Skill(skill="gsd-execute-phase", args="${PHASE} --auto --no-transition ${GSD_WS}")',
    "The `--no-transition` flag tells execute-phase to return status after verification.",
  ].join("\n"), "utf8");
  writeFileSync(join(root, "generated", "workflows", "workflows", "execute-phase.md"), [
    "## PHASE COMPLETE",
    "Verification: {Passed | Gaps Found}",
    "| `passed` | -> update_roadmap |",
    "| `human_needed` | Persist and present human testing items |",
    "| `gaps_found` | Present gap summary |",
  ].join("\n"), "utf8");
  writeFileSync(join(root, "generated", "workflows", "workflows", "verify-work.md"), [
    "Verification: {Passed | Gaps Found}",
  ].join("\n"), "utf8");
}

describe("orchestration contract snapshot", () => {
  it("hashes snapshots with contractHash blanked", () => {
    const snapshot: OrchestrationContractSnapshot = {
      contractVersion: 1,
      contractHash: "will-be-ignored",
      officialPackage: "@opengsd/gsd-core",
      officialVersion: "1.2.0",
      generatedRoot: "generated",
      phaseIdPolicy: {
        lexicalPattern: "^\\d+(?:\\.\\d+)*$",
        examples: ["9", "09", "2.1", "02.1"],
        validationHint: "Use upstream roadmap.get-phase/find-phase for existence checks.",
      },
      chain: {
        defaultQueue: [
          { unitType: "discuss", argsByMode: { chain: "--chain", auto: "--auto" }, required: false, sourcePaths: ["generated/workflows/workflows/discuss-phase/modes/chain.md"] },
          { unitType: "plan", argsByMode: { chain: "--auto", auto: "--auto" }, required: true, sourcePaths: ["generated/workflows/workflows/plan-phase.md"] },
          { unitType: "execute", argsByMode: { chain: "--auto --no-transition", auto: "--auto --no-transition" }, required: true, sourcePaths: ["generated/workflows/workflows/plan-phase.md"] },
        ],
        standaloneStarts: {
          "gsd-discuss-phase": "discuss",
          "gsd-plan-phase": "plan",
          "gsd-execute-phase": "execute",
          "gsd-verify-work": "verify",
          "gsd-ship": "closeout",
        },
      },
      outcomes: {},
      piOverlay: {
        nativeOwnerEnv: "PI_GSD_NATIVE_CHAIN_OWNER",
        noNestedWorkflowDispatchWhenNativeOwner: true,
      },
    };

    const first = calculateOrchestrationContractHash(snapshot);
    const second = calculateOrchestrationContractHash({ ...snapshot, contractHash: first });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("compiles upstream chain and execute outcome contract", () => {
    const root = fixtureRoot();
    writeGeneratedWorkflowFixture(root);

    const snapshot = compileOrchestrationContract({
      cwd: root,
      officialPackage: "@opengsd/gsd-core",
      officialVersion: "1.2.0",
    });

    expect(snapshot.chain.defaultQueue.map((unit) => unit.unitType)).toEqual(["discuss", "plan", "execute"]);
    expect(snapshot.chain.defaultQueue.find((unit) => unit.unitType === "execute")?.argsByMode.chain).toBe("--auto --no-transition");
    expect(snapshot.outcomes.execute?.passStatuses).toEqual(expect.arrayContaining(["passed"]));
    expect(snapshot.outcomes.execute?.pauseStatuses).toEqual(expect.objectContaining({ gaps_found: expect.any(String), human_needed: expect.any(String) }));
    expect(snapshot.outcomes.execute?.passMarkers ?? []).not.toContain("phase_complete");
  });

  it("fails validation when orchestration contract hash is tampered", () => {
    const root = fixtureRoot();
    writeGeneratedWorkflowFixture(root);
    const snapshot = compileOrchestrationContract({ cwd: root });
    writeFileSync(join(root, "generated", "orchestration-contract.json"), JSON.stringify({ ...snapshot, contractHash: "bad-hash" }), "utf8");

    const result = verifyOrchestrationContractSnapshot({ cwd: root });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ failedField: "contractHash" });
  });

  it("fails validation when orchestration contract json is malformed", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "generated"), { recursive: true });
    writeFileSync(join(root, "generated", "orchestration-contract.json"), "{not json", "utf8");

    const result = verifyOrchestrationContractSnapshot({ cwd: root });

    expect(result.ok).toBe(false);
    expect(result.snapshotPresent).toBe(true);
    expect(result.failures[0]).toMatchObject({ failedField: "contractJson" });
  });

  it("fails validation when generated workflow evidence drifts from the snapshot", () => {
    const root = fixtureRoot();
    writeGeneratedWorkflowFixture(root);
    const snapshot = compileOrchestrationContract({ cwd: root });
    writeFileSync(join(root, "generated", "orchestration-contract.json"), JSON.stringify(snapshot), "utf8");
    writeFileSync(join(root, "generated", "workflows", "workflows", "plan-phase.md"), [
      'Skill(skill="gsd-execute-phase", args="${PHASE} --auto ${GSD_WS}")',
      "The execute phase is launched without no-transition.",
    ].join("\n"), "utf8");

    const result = verifyOrchestrationContractSnapshot({ cwd: root });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ failedField: "generatedWorkflows" });
  });
});
