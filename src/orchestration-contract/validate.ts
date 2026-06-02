import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileOrchestrationContract } from "./compile.js";
import { calculateOrchestrationContractHash } from "./snapshot.js";
import type { OrchestrationContractFailure, OrchestrationContractSnapshot, OrchestrationContractWarning } from "./types.js";

export type VerifyOrchestrationContractResult = {
  ok: boolean;
  failures: OrchestrationContractFailure[];
  warnings: OrchestrationContractWarning[];
  snapshotPresent: boolean;
};

export function readOrchestrationContractSnapshot(cwd: string): OrchestrationContractSnapshot | undefined {
  const path = join(cwd, "generated", "orchestration-contract.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as OrchestrationContractSnapshot;
  } catch {
    return undefined;
  }
}

export function verifyOrchestrationContractSnapshot(options: {
  cwd: string;
  snapshot?: OrchestrationContractSnapshot;
}): VerifyOrchestrationContractResult {
  const loaded = options.snapshot ? { snapshot: options.snapshot } : loadSnapshotForValidation(options.cwd);
  if ("failure" in loaded) {
    return { ok: false, failures: [loaded.failure], warnings: [], snapshotPresent: loaded.snapshotPresent };
  }
  const snapshot = loaded.snapshot;
  if (!snapshot) return { ok: true, failures: [], warnings: [], snapshotPresent: false };

  const failures: OrchestrationContractFailure[] = [];
  const expectedHash = calculateOrchestrationContractHash(snapshot);
  if (snapshot.contractHash !== expectedHash) {
    failures.push({
      failedField: "contractHash",
      expected: expectedHash,
      actual: snapshot.contractHash,
      sourcePaths: ["generated/orchestration-contract.json"],
    });
  }

  if (!snapshot.chain.defaultQueue.some((unit) => unit.unitType === "execute")) {
    failures.push({
      failedField: "chain.defaultQueue",
      expected: "execute unit",
      actual: snapshot.chain.defaultQueue.map((unit) => unit.unitType).join(","),
      sourcePaths: ["generated/orchestration-contract.json"],
    });
  }

  if (!snapshot.outcomes.execute?.requireRecognizedOutcome) {
    failures.push({
      failedField: "outcomes.execute.requireRecognizedOutcome",
      expected: "true",
      actual: String(snapshot.outcomes.execute?.requireRecognizedOutcome),
      sourcePaths: ["generated/orchestration-contract.json"],
    });
  }

  for (const path of requiredSourcePaths(snapshot)) {
    if (!existsSync(join(options.cwd, path))) {
      failures.push({
        failedField: "sourcePaths",
        expected: "present",
        actual: "missing",
        sourcePaths: [path],
      });
    }
  }

  try {
    const compiled = compileOrchestrationContract({
      cwd: options.cwd,
      officialPackage: snapshot.officialPackage,
      officialVersion: snapshot.officialVersion,
    });
    if (compiled.contractHash !== snapshot.contractHash) {
      failures.push({
        failedField: "generatedWorkflows",
        expected: snapshot.contractHash,
        actual: compiled.contractHash,
        sourcePaths: compiled.chain.defaultQueue.flatMap((unit) => unit.sourcePaths),
      });
    }
  } catch (error) {
    failures.push({
      failedField: "generatedWorkflows",
      expected: "compiled orchestration contract",
      actual: error instanceof Error ? error.message : String(error),
      sourcePaths: ["generated/workflows"],
    });
  }

  return { ok: failures.length === 0, failures, warnings: [], snapshotPresent: true };
}

function loadSnapshotForValidation(cwd: string): { snapshot?: OrchestrationContractSnapshot } | { failure: OrchestrationContractFailure; snapshotPresent: boolean } {
  const path = join(cwd, "generated", "orchestration-contract.json");
  if (!existsSync(path)) return {};
  try {
    return { snapshot: JSON.parse(readFileSync(path, "utf8")) as OrchestrationContractSnapshot };
  } catch (error) {
    return {
      failure: {
        failedField: "contractJson",
        expected: "valid JSON",
        actual: error instanceof Error ? error.message : String(error),
        sourcePaths: ["generated/orchestration-contract.json"],
      },
      snapshotPresent: true,
    };
  }
}

function requiredSourcePaths(snapshot: OrchestrationContractSnapshot): string[] {
  return Array.from(new Set([
    ...snapshot.chain.defaultQueue.flatMap((unit) => unit.sourcePaths),
    ...Object.values(snapshot.outcomes).flatMap((outcome) => outcome?.sourcePaths ?? []),
  ]));
}
