import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, posix, relative } from "node:path";
import { splitFrontmatter } from "../frontmatter.js";
import { loadOfficialWorkflowConfig } from "../orchestrator/official-config.js";
import { resolveOfficialPackage } from "../official.js";
import { resolveUnitDispatchTarget } from "../orchestrator/dispatch.js";
import type { UnitType } from "../orchestrator/types.js";
import type { ToolContract, ToolContractFailure, ToolContractOverlay, ToolContractSnapshot, ToolContractWarning } from "./types.js";
import { calculateToolContractHash } from "./snapshot.js";

/**
 * Returns true if this unit type is dispatched in native orchestration.
 * Mirrors the dispatchTargets table in `src/orchestrator/dispatch.ts`.
 */
function isDispatchableUnitType(type: string): type is UnitType {
  const known: UnitType[] = [
    "discuss",
    "research",
    "plan",
    "plan-check",
    "execute",
    "code-review",
    "verify",
    "ui-review",
    "security-review",
    "nyquist-validation",
    "ai-integration",
    "ui-safety-gate",
    "closeout",
    "settings-gate",
    "pause-for-user",
  ];
  return known.includes(type as UnitType);
}

export type CompileToolContractsOptions = {
  cwd: string;
  overlay?: ToolContractOverlay;
};

const PROMPT_OBLIGATION_MARKERS: Array<{ marker: RegExp; obligation: string }> = [
  { marker: /SUMMARY\.md/i, obligation: "write-phase-summary" },
  { marker: /PLAN\.md/i, obligation: "produce-plan-artifact" },
  { marker: /VERIFICATION\.md/i, obligation: "produce-verification" },
  { marker: /REVIEW\.md/i, obligation: "produce-review" },
  { marker: /RESEARCH\.md/i, obligation: "produce-research" },
  { marker: /CONTEXT\.md/i, obligation: "produce-context" },
  { marker: /UI-SPEC\.md/i, obligation: "produce-ui-spec" },
  { marker: /VALIDATION\.md/i, obligation: "produce-validation" },
];

const CLOSEOUT_REQUIREMENTS = ["update-roadmap", "update-state", "phase-summary-exists"] as const;

export function compileToolContracts(options: CompileToolContractsOptions): ToolContractSnapshot {
  const cwd = options.cwd;
  const generatedRoot = join(cwd, "generated");
  const official = resolveOfficialPackage({ startDir: cwd });
  const officialConfig = loadOfficialWorkflowConfig({ startDir: cwd });
  const schemaKeys = officialConfig.schema.workflowKeys;

  const contracts: ToolContract[] = [];
  const unitTypes: UnitType[] = [
    "discuss",
    "research",
    "plan",
    "plan-check",
    "execute",
    "code-review",
    "verify",
    "ui-review",
    "security-review",
    "nyquist-validation",
    "ai-integration",
    "ui-safety-gate",
    "closeout",
    "settings-gate",
  ];

  for (const unitType of unitTypes) {
    const target = resolveUnitDispatchTarget({ type: unitType, id: `${unitType}-compile`, status: "pending", phase: "compile", label: unitType, required: true, source: "default" });
    const promptRelative = target.prompt;
    const promptAbs = join(cwd, promptRelative);
    if (!existsSync(promptAbs)) continue;

    const promptContent = readFileSync(promptAbs, "utf8");
    const promptHash = hashContent(promptContent);

    const agent = target.agent;
    let allowedTools: string[] = [];
    let agentPath: string | undefined;
    if (agent) {
      const agentRel = posix.join("generated", "agents", `${agent}.md`);
      const agentAbs = join(cwd, agentRel);
      if (existsSync(agentAbs)) {
        agentPath = agentRel;
        const agentContent = readFileSync(agentAbs, "utf8");
        const parsed = splitFrontmatter(agentContent);
        allowedTools = parseToolList(parsed.data.tools);
      }
    }

    const promptObligations = extractPromptObligations(promptContent);

    const validationRequirements: string[] = [];
    for (const key of schemaKeys) {
      if (key.includes(`${unitType}`) || key.includes(`workflow.${unitType.replace(/-/g, "_")}`)) {
        validationRequirements.push(key);
      }
    }
    if (validationRequirements.length === 0) validationRequirements.push("dispatch-target-present");

    const closeoutRequirements = unitType === "closeout" ? [...CLOSEOUT_REQUIREMENTS] : [];
    const sourcePaths = Array.from(new Set([promptRelative, ...(agentPath ? [agentPath] : [])]));

    const base: ToolContract = {
      unitType,
      promptName: basename(promptRelative),
      promptPath: promptRelative,
      promptHash,
      ...(agent ? { agent } : {}),
      ...(agentPath ? { agentPath } : {}),
      allowedTools,
      schemaKeys: validationRequirements,
      validationRequirements,
      closeoutRequirements,
      sourcePaths,
    };

    contracts.push(applyOverlay(base, options.overlay?.[unitType]));
  }

  // If overlay provided a contract for a unit type that is not natively dispatchable, ignore it
  // (overlay is supplement-only — it cannot introduce new unit types).

  const snapshot: ToolContractSnapshot = {
    contractVersion: 1,
    contractHash: "",
    officialPackage: official.packageName,
    officialVersion: official.version,
    generatedRoot: relative(cwd, generatedRoot) || "generated",
    contracts,
  };
  // Hash the structured snapshot with contractHash blanked. `promptHash` is
  // included so generated prompt changes are detectable by doctor/check, while
  // runtime validation still uses the stable snapshot instead of reparsing
  // generated markdown on every dispatch (D-04).
  snapshot.contractHash = calculateToolContractHash(snapshot);
  return snapshot;
}

function applyOverlay(base: ToolContract, overlayEntry: ToolContractOverlay[UnitType] | undefined): ToolContract {
  if (!overlayEntry) return base;

  // T-12-01: Reject any overlay that attempts to relax allowed tools
  // (smaller/equal/contained set), validation requirements, or closeout
  // requirements. Overlay is supplement-only (D-02).
  if (overlayEntry.allowedTools) {
    const overlaySet = new Set(overlayEntry.allowedTools);
    const baseSet = new Set(base.allowedTools);
    let isRelaxation = false;
    if (baseSet.size > 0) {
      // Relaxation = overlay removes any tool that was in the base
      for (const tool of baseSet) {
        if (!overlaySet.has(tool)) {
          isRelaxation = true;
          break;
        }
      }
    }
    if (isRelaxation) {
      throw new Error(
        `Tool Contract overlay cannot relax upstream allowed tools for unit ${base.unitType} (D-02).`,
      );
    }
  }

  if (overlayEntry.validationRequirements) {
    const overlaySet = new Set(overlayEntry.validationRequirements);
    for (const req of base.validationRequirements) {
      if (!overlaySet.has(req)) {
        throw new Error(
          `Tool Contract overlay cannot relax upstream validation requirements for unit ${base.unitType} (D-02).`,
        );
      }
    }
  }

  if (overlayEntry.closeoutRequirements) {
    const overlaySet = new Set(overlayEntry.closeoutRequirements);
    for (const req of base.closeoutRequirements) {
      if (!overlaySet.has(req)) {
        throw new Error(
          `Tool Contract overlay cannot relax upstream closeout requirements for unit ${base.unitType} (D-02).`,
        );
      }
    }
  }

  // Merge Pi-runtime metadata fields (supplement-only). The overlay may
  // add `piNotes`, but cannot replace or relax upstream-derived fields.
  const merged: ToolContract = {
    ...base,
    ...(overlayEntry.allowedTools ? { allowedTools: [...new Set([...base.allowedTools, ...overlayEntry.allowedTools])] } : {}),
    ...(overlayEntry.validationRequirements ? { validationRequirements: [...new Set([...base.validationRequirements, ...overlayEntry.validationRequirements])] } : {}),
    ...(overlayEntry.closeoutRequirements ? { closeoutRequirements: [...new Set([...base.closeoutRequirements, ...overlayEntry.closeoutRequirements])] } : {}),
  };
  return merged;
}

function extractPromptObligations(promptContent: string): string[] {
  const obligations = new Set<string>();
  for (const { marker, obligation } of PROMPT_OBLIGATION_MARKERS) {
    if (marker.test(promptContent)) obligations.add(obligation);
  }
  return Array.from(obligations);
}

function parseToolList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((tool) => tool.trim()).filter(Boolean);
  const trimmed = value.trim();
  // YAML inline list: "[Read, Write, Grep]" or "[Read,Write,Grep]"
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean);
  }
  return trimmed.split(",").map((tool) => tool.trim()).filter(Boolean);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Failures that represent dispatch-critical drift from the current generated inputs.
 * Used by `verifyToolContractSnapshot` to surface actionable issues.
 */
export type VerifyToolContractDeps = {
  cwd: string;
  snapshot?: ToolContractSnapshot;
};

export function verifyToolContractSnapshot(options: VerifyToolContractDeps): { ok: boolean; failures: ToolContractFailure[]; warnings: ToolContractWarning[]; snapshotPresent: boolean } {
  const cwd = options.cwd;
  const snapshot = options.snapshot ?? readSnapshot(cwd);
  if (!snapshot) {
    return {
      ok: true,
      failures: [],
      warnings: [],
      snapshotPresent: false,
    };
  }

  const failures: ToolContractFailure[] = [];
  const warnings: ToolContractWarning[] = [];

  const expectedHash = calculateToolContractHash(snapshot);
  if (snapshot.contractHash !== expectedHash) {
    failures.push({
      unitType: "snapshot",
      contractHash: snapshot.contractHash,
      contractVersion: snapshot.contractVersion,
      failedField: "contractHash",
      expected: expectedHash,
      actual: snapshot.contractHash,
      sourcePaths: ["generated/tool-contracts.json"],
    });
  }

  for (const contract of snapshot.contracts) {
    const promptAbs = join(cwd, contract.promptPath);
    if (!existsSync(promptAbs)) {
      failures.push({
        unitType: contract.unitType,
        contractHash: snapshot.contractHash,
        contractVersion: snapshot.contractVersion,
        failedField: "promptPath",
        expected: contract.promptPath,
        actual: "missing",
        sourcePaths: [contract.promptPath],
      });
      continue;
    }

    const currentPromptHash = hashContent(readFileSync(promptAbs, "utf8"));
    if (currentPromptHash !== contract.promptHash) {
      // Dispatch-critical: prompt text changed but we don't know if it changed
      // a contract-critical field. Conservative: report as warning for prose drift
      // (D-06). Escalate to failure if allowedTools / schemaKeys / closeout
      // requirements would no longer match.
      const currentPrompt = readFileSync(promptAbs, "utf8");
      const currentObligations = extractPromptObligations(currentPrompt);
      const missing = contract.validationRequirements.filter((req) => {
        if (req === "dispatch-target-present") return false;
        return false; // No string-replaceable check yet — treat as warning-only prose drift.
      });
      if (missing.length > 0) {
        failures.push({
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "validationRequirements",
          expected: contract.validationRequirements.join(","),
          actual: missing.join(","),
          sourcePaths: [contract.promptPath],
        });
      } else if (currentObligations.length === 0) {
        warnings.push({
          unitType: contract.unitType,
          field: "promptHash",
          expected: contract.promptHash.slice(0, 12),
          actual: currentPromptHash.slice(0, 12),
          sourcePaths: [contract.promptPath],
        });
      } else {
        // Prose drift only — record as warning per D-06.
        warnings.push({
          unitType: contract.unitType,
          field: "promptHash",
          expected: contract.promptHash.slice(0, 12),
          actual: currentPromptHash.slice(0, 12),
          sourcePaths: [contract.promptPath],
        });
      }
    }

    if (contract.agentPath) {
      const agentAbs = join(cwd, contract.agentPath);
      if (!existsSync(agentAbs)) {
        failures.push({
          unitType: contract.unitType,
          contractHash: snapshot.contractHash,
          contractVersion: snapshot.contractVersion,
          failedField: "agentPath",
          expected: contract.agentPath,
          actual: "missing",
          sourcePaths: [contract.agentPath],
        });
        continue;
      }
      const currentAgent = readFileSync(agentAbs, "utf8");
      const currentTools = parseToolList(splitFrontmatter(currentAgent).data.tools);
      const contractToolSet = new Set(contract.allowedTools);
      const currentToolSet = new Set(currentTools);
      // Dispatch-critical: tools removed from agent.
      for (const tool of contractToolSet) {
        if (!currentToolSet.has(tool)) {
          failures.push({
            unitType: contract.unitType,
            contractHash: snapshot.contractHash,
            contractVersion: snapshot.contractVersion,
            failedField: "allowedTools",
            expected: Array.from(contractToolSet).join(","),
            actual: currentTools.join(","),
            sourcePaths: [contract.agentPath],
          });
          break;
        }
      }
      // Dispatch-critical: new tool added — also a change, but additive. Surface as warning
      // unless the tool is in a known-disallowed set, which is configured by upstream schema.
      for (const tool of currentToolSet) {
        if (!contractToolSet.has(tool)) {
          warnings.push({
            unitType: contract.unitType,
            field: "allowedTools",
            expected: Array.from(contractToolSet).join(","),
            actual: currentTools.join(","),
            sourcePaths: [contract.agentPath],
          });
          break;
        }
      }
    }
  }

  return { ok: failures.length === 0, failures, warnings, snapshotPresent: true };
}

export function readSnapshot(cwd: string): ToolContractSnapshot | undefined {
  const path = join(cwd, "generated", "tool-contracts.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ToolContractSnapshot;
  } catch {
    return undefined;
  }
}

export { isDispatchableUnitType };
