import { existsSync } from "node:fs";
import { join } from "node:path";
import { calculateToolContractHash } from "./snapshot.js";
import { resolveUnitDispatchTarget } from "../orchestrator/dispatch.js";
import type { OrchestrationUnit } from "../orchestrator/types.js";
import type { ToolContract, ToolContractFailure, ToolContractSnapshot, ValidateUnitToolContractResult } from "./types.js";

const MAX_FIELD_SUMMARY = 80;

export type CheapValidateUnitToolContractOptions = {
  snapshot: ToolContractSnapshot;
};

/**
 * Cheap, runtime validator that loads the verified Tool Contract snapshot
 * (D-04) and validates the current Unit's dispatch fields without re-parsing
 * every generated prompt/agent/workflow markdown.
 *
 * Returns bounded evidence per D-08: no full prompt text, no raw user text,
 * no secrets, no unbounded diffs.
 */
export function validateUnitToolContract(unit: OrchestrationUnit, options: CheapValidateUnitToolContractOptions): ValidateUnitToolContractResult {
  const { snapshot } = options;
  const expectedHash = calculateToolContractHash(snapshot);
  if (snapshot.contractHash !== expectedHash) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit.id,
        unitType: String(unit.type),
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "contractHash",
        expected: expectedHash,
        actual: snapshot.contractHash,
        sourcePaths: ["generated/tool-contracts.json"],
      }),
    };
  }
  const contract = snapshot.contracts.find((entry) => entry.unitType === unit.type);
  if (!contract) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit.id,
        unitType: String(unit.type),
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "unitType",
        expected: "known unit type",
        actual: truncate(String(unit.type)),
        sourcePaths: [],
      }),
    };
  }
  return { ok: true, contract };
}

/**
 * Disk-backed validator that re-verifies that the resources referenced by the
 * snapshot still exist. Cheap when the snapshot is in sync; reports
 * dispatch-critical failures when not.
 */
export function validateUnitToolContractAgainstDisk(options: { cwd: string; snapshot: ToolContractSnapshot; unit: OrchestrationUnit }): ValidateUnitToolContractResult {
  const { snapshot, unit, cwd } = options;
  const cheap = validateUnitToolContract(unit, { snapshot });
  if (!cheap.ok) return cheap;
  const contract = cheap.contract;

  const target = resolveUnitDispatchTarget(unit);
  const expectedPromptRel = target.prompt;
  const expectedAgent = target.agent;
  if (contract.promptPath !== expectedPromptRel) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "promptPath",
        expected: truncate(expectedPromptRel),
        actual: truncate(contract.promptPath),
        sourcePaths: [contract.promptPath, expectedPromptRel],
      }),
    };
  }

  const promptAbs = join(cwd, expectedPromptRel);
  if (!existsSync(promptAbs)) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "promptPath",
        expected: truncate(expectedPromptRel),
        actual: "missing",
        sourcePaths: [expectedPromptRel],
      }),
    };
  }

  if (contract.agent !== expectedAgent) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "agent",
        expected: expectedAgent ?? "none",
        actual: contract.agent ?? "none",
        sourcePaths: [contract.agentPath, expectedAgent ? `generated/agents/${expectedAgent}.md` : undefined].filter((path): path is string => Boolean(path)),
      }),
    };
  }

  if (expectedAgent) {
    const expectedAgentPath = `generated/agents/${expectedAgent}.md`;
    if (contract.agentPath !== expectedAgentPath) {
      return {
        ok: false,
        failure: boundedFailure({
          unitId: unit.id,
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: truncate(expectedAgentPath),
          actual: truncate(contract.agentPath ?? "missing"),
          sourcePaths: [contract.agentPath, expectedAgentPath].filter((path): path is string => Boolean(path)),
        }),
      };
    }
  } else if (contract.agentPath) {
    return {
      ok: false,
      failure: boundedFailure({
        unitId: unit.id,
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "agentPath",
        expected: "none",
        actual: truncate(contract.agentPath),
        sourcePaths: [contract.agentPath],
      }),
    };
  }

  if (contract.agent) {
    if (!contract.agentPath) {
      return {
        ok: false,
        failure: boundedFailure({
          unitId: unit.id,
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: "agentPath present",
          actual: "missing",
          sourcePaths: [contract.agentPath ?? ""].filter(Boolean),
        }),
      };
    }
    const agentAbs = join(cwd, contract.agentPath);
    if (!existsSync(agentAbs)) {
      return {
        ok: false,
        failure: boundedFailure({
          unitId: unit.id,
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: truncate(contract.agentPath),
          actual: "missing",
          sourcePaths: [contract.agentPath],
        }),
      };
    }
  }

  return { ok: true, contract };
}

function boundedFailure(failure: ToolContractFailure): ToolContractFailure {
  return {
    unitId: failure.unitId,
    unitType: failure.unitType,
    contractHash: failure.contractHash,
    contractVersion: failure.contractVersion,
    failedField: failure.failedField,
    expected: failure.expected ? truncate(failure.expected) : undefined,
    actual: failure.actual ? truncate(failure.actual) : undefined,
    sourcePaths: (failure.sourcePaths ?? []).map((path) => truncate(path, 160)).slice(0, 6),
  };
}

function truncate(value: string, max = MAX_FIELD_SUMMARY): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}
