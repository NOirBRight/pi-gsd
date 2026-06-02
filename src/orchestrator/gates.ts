import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { classifyFailure } from "../recovery/classify-failure.js";
import { compileToolContracts, readSnapshot, validateUnitToolContract, validateUnitToolContractAgainstDisk } from "../tool-contract/index.js";
import { prepareUnitRoot as prepareSafeUnitRoot } from "../worktree-safety/index.js";
import { evaluatePostDispatchPolicy, POST_DISPATCH_POLICIES } from "./outcomes.js";
import { reconcileBeforeDispatch } from "./reconciliation.js";
import type { GateAdapter, GateName, GateResult, OrchestrationOutcome, OrchestrationSnapshot, OrchestrationUnit } from "./types.js";
import type { ToolContractSnapshot } from "../tool-contract/types.js";

export type GateOverrides = Partial<Record<Exclude<GateName, "artifact">, GateAdapter>>;

export function runPreDispatchGates(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, overrides: GateOverrides = {}): GateResult {
  const orderedGates: [Exclude<GateName, "artifact">, GateAdapter][] = [
    ["reconcileBeforeDispatch", overrides.reconcileBeforeDispatch ?? reconcileBeforeDispatch],
    ["decideDispatch", overrides.decideDispatch ?? decideDispatch],
    ["validateToolContract", overrides.validateToolContract ?? validateToolContract],
    ["prepareUnitRoot", overrides.prepareUnitRoot ?? prepareUnitRoot],
    ["persistRuntimeState", overrides.persistRuntimeState ?? persistRuntimeState],
  ];

  const journalEvents: NonNullable<Extract<GateResult, { ok: true }>["journalEvents"]> = [];
  const releaseEvidence: string[] = [];
  for (const [, gate] of orderedGates) {
    const result = gate(snapshot, unit);
    if (result.ok) releaseEvidence.push(...result.evidence.filter((item) => item.startsWith("branch:")));
    if (result.journalEvents?.length) journalEvents.push(...result.journalEvents);
    if (!result.ok) return { ...result, journalEvents: result.journalEvents?.length ? result.journalEvents : journalEvents };
  }

  return { ok: true, gate: "persistRuntimeState", evidence: [...orderedGates.map(([name]) => name), ...releaseEvidence], journalEvents: journalEvents.length ? journalEvents : undefined };
}

export function runPostDispatchGate(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, options: { cwd?: string; verifierSkip?: boolean; exists?: (path: string) => boolean; written?: string[]; messages?: string[]; outcome?: OrchestrationOutcome } = {}): GateResult {
  const exists = options.exists ?? existsSync;
  const cwd = options.cwd ?? process.cwd();
  const phaseDir = join(cwd, ".planning", "phases");

  if (unit.type === "verify") {
    if (options.verifierSkip || !snapshot.settings.workflow.verifier) return pass("artifact", "verifier skipped by settings");
  }

  if (unit.type === "closeout") {
    if (!closeoutEvidence(cwd, unit.phase, options.written)) {
      return fail("Closeout Unit requires ROADMAP and STATE evidence for the phase.", [`missing-closeout-evidence:${unit.phase}`]);
    }
    if (snapshot.settings.workflow.verifier && !phaseVerificationPassed(cwd, phaseDir, unit.phase, exists)) {
      return fail("Closeout requires latest VERIFICATION.md with status: passed.", [`verification-not-passed:${unit.phase}`]);
    }
    return pass("artifact", "closeout roadmap/state evidence exists");
  }

  const policy = POST_DISPATCH_POLICIES[unit.type];
  if (policy) {
    const artifactPath = policy.artifactSuffix ? findMatchingArtifact(cwd, phaseDir, unit.phase, policy.artifactSuffix, exists, options.written) : undefined;
    if (policy.artifactSuffix && !artifactPath) {
      return fail(`${unit.label} Unit did not produce a *-${policy.artifactSuffix} artifact.`, [`missing:${unit.phase}-*-${policy.artifactSuffix}`]);
    }
    const outcome = evaluatePostDispatchPolicy(policy, {
      artifactPath,
      messages: options.messages,
      outcome: options.outcome,
      phase: unit.phase,
      unitType: unit.type,
    });
    return outcome.ok
      ? { ok: true, gate: "artifact", evidence: outcome.evidence.length ? outcome.evidence : [`${unit.type} outcome accepted`] }
      : fail(outcome.resumeHint, outcome.evidence);
  }

  return pass("artifact", `${unit.type} has no Phase 9 artifact gate`);
}

function decideDispatch(_snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  const knownTypes: OrchestrationUnit["type"][] = ["discuss", "research", "plan", "plan-check", "execute", "code-review", "verify", "ui-review", "security-review", "nyquist-validation", "ai-integration", "ui-safety-gate", "closeout", "settings-gate", "pause-for-user"];
  if (!knownTypes.includes(unit.type)) {
    return { ok: false, gate: "decideDispatch", reason: "ambiguous-dispatch", retryable: false, resumeHint: "Unknown Unit type; update the orchestrator Unit union before dispatch.", evidence: [`type:${String(unit.type)}`] };
  }
  if (unit.type === "pause-for-user") {
    return { ok: false, gate: "decideDispatch", reason: "ambiguous-dispatch", retryable: false, resumeHint: unit.resumeHint ?? "User input is required before dispatch.", evidence: [unit.id] };
  }
  return pass("decideDispatch", `dispatch:${unit.type}`);
}

function validateToolContract(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  const cwd = snapshot.cwd ?? process.cwd();
  // Prefer the verified snapshot (D-04). If the snapshot file is missing,
  // fall back to an inline compile so the gate still produces a stable
  // contract decision without depending on disk I/O race conditions.
  let contractSnapshot: ToolContractSnapshot | undefined = readSnapshot(cwd);
  if (!contractSnapshot) {
    try {
      contractSnapshot = compileToolContracts({ cwd });
    } catch (error) {
      return toolContractGateFailure(unit, {
        unitId: unit.id,
        unitType: unit.type,
        failedField: "snapshot",
        expected: "generated/tool-contracts.json or upstream package",
        actual: error instanceof Error ? error.message : String(error),
        sourcePaths: ["generated/tool-contracts.json"],
      });
    }
  }
  // If the contract snapshot is empty (no generated files in the cwd), the
  // project is not configured for native auto orchestration in this context,
  // so the contract gate is a no-op. This preserves the seam behaviour for
  // smoke tests that exercise gates in fresh temp directories.
  if (contractSnapshot.contracts.length === 0) {
    return pass("validateToolContract", `contract:empty-snapshot:${unit.type}`);
  }
  if (!contractSnapshot.contracts.some((entry) => entry.unitType === unit.type)) {
    return toolContractGateFailure(unit, {
      unitId: unit.id,
      unitType: unit.type,
      failedField: "unitType",
      expected: "known unit type",
      actual: String(unit.type),
      sourcePaths: ["generated/tool-contracts.json"],
    });
  }
  // Cheap runtime validation against the verified snapshot.
  const cheap = validateUnitToolContract(unit, { snapshot: contractSnapshot });
  if (!cheap.ok) {
    return toolContractGateFailure(unit, cheap.failure);
  }
  // Disk-backed verification: the prompt and agent paths in the snapshot
  // must still resolve to existing files (D-04/D-05).
  const disk = validateUnitToolContractAgainstDisk({ cwd, snapshot: contractSnapshot, unit });
  if (!disk.ok) {
    return toolContractGateFailure(unit, disk.failure);
  }
  return pass("validateToolContract", `contract:${unit.type}:${disk.contract.promptHash.slice(0, 12)}`);
}

function toolContractGateFailure(unit: OrchestrationUnit, failure: { unitId?: string; unitType: string; contractHash?: string; contractVersion?: number; failedField: string; expected?: string; actual?: string; sourcePaths?: string[] }): GateResult {
  const recoveryDecision = classifyFailure({
    kind: "dispatch",
    reason: "dispatch-contract-invalid",
    evidence: {
      reasonCode: "dispatch-contract-invalid",
      unitId: unit.id,
      unitType: unit.type,
      contractHash: failure.contractHash,
      contractVersion: failure.contractVersion,
      failedField: failure.failedField,
      expected: failure.expected,
      actual: failure.actual,
      sourcePaths: failure.sourcePaths,
    },
  });
  return {
    ok: false,
    gate: "validateToolContract",
    reason: recoveryDecision.class,
    retryable: false,
    resumeHint: recoveryDecision.remediation,
    evidence: [
      `failedField:${failure.failedField}`,
      `unitId:${unit.id}`,
      failure.contractHash ? `contractHash:${failure.contractHash}` : undefined,
      ...(failure.sourcePaths ?? []).map((path) => `path:${path}`),
    ].filter((item): item is string => Boolean(item)),
    recoveryDecision,
    exitReason: recoveryDecision.class,
  };
}

function prepareUnitRoot(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  const result = prepareSafeUnitRoot({
    unitType: unit.type,
    unitId: unit.id,
    phase: unit.phase,
    projectRoot: snapshot.cwd,
    unitRoot: snapshot.cwd,
    expectedBranch: typeof unit.metadata?.expectedBranch === "string" ? unit.metadata.expectedBranch : undefined,
    workflow: { worktrees: snapshot.settings.workflow.worktrees },
    attempt: snapshot.attempt,
  });
  if (result.ok) {
    return {
      ok: true,
      gate: "prepareUnitRoot",
      evidence: ["worktree-safety", `root:${result.root}`, result.evidence.branch ? `branch:${result.evidence.branch}` : undefined, ...(result.evidence.messages ?? [])].filter((item): item is string => Boolean(item)),
      journalEvents: result.evidence.journalEvents,
    };
  }
  return {
    ok: false,
    gate: "prepareUnitRoot",
    reason: result.decision.class,
    retryable: result.decision.action === "retry",
    resumeHint: result.decision.remediation,
    evidence: evidenceFromDecision(result.decision),
    recoveryDecision: result.decision,
    exitReason: result.decision.class,
    journalEvents: Array.isArray(result.decision.evidence?.journalEvents) ? result.decision.evidence.journalEvents as Extract<GateResult, { ok: false }>["journalEvents"] : undefined,
  };
}

function persistRuntimeState(_snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  return pass("persistRuntimeState", `persist-ready:${unit.id}`);
}

function evidenceFromDecision(decision: NonNullable<Extract<GateResult, { ok: false }>["recoveryDecision"]>): string[] {
  const evidence = decision.evidence ?? {};
  return [
    `class:${decision.class}`,
    `action:${decision.action}`,
    evidence.reasonCode ? `reasonCode:${String(evidence.reasonCode)}` : undefined,
    evidence.unitId ? `unitId:${evidence.unitId}` : undefined,
    evidence.root ? `root:${evidence.root}` : undefined,
    evidence.branch ? `branch:${evidence.branch}` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function pass(gate: GateName, evidence: string): GateResult {
  return { ok: true, gate, evidence: [evidence] };
}

function fail(resumeHint: string, evidence: string[]): GateResult {
  const recoveryDecision = classifyFailure({
    kind: "artifact-gate",
    reason: resumeHint,
    evidence: { messages: evidence },
  });
  return {
    ok: false,
    gate: "artifact",
    reason: recoveryDecision.class,
    retryable: false,
    resumeHint,
    evidence,
    recoveryDecision,
    exitReason: recoveryDecision.class,
  };
}

function findMatchingArtifact(cwd: string, phaseRoot: string, phase: string, suffix: string, exists: (path: string) => boolean, written?: string[], requireWritten = true): string | undefined {
  if (requireWritten && !written?.length) return undefined;
  const writtenSet = written?.length ? new Set(written.map((path) => normalizeWrittenPath(cwd, path))) : undefined;
  const artifactPattern = new RegExp(`^${escapeRegExp(phase)}(?:-\\d+)?-${escapeRegExp(suffix)}$`);

  try {
    const candidates = [
      ...readdirSync(phaseRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(phaseRoot, entry.name)),
      ...readdirSync(phaseRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${phase}-`))
        .flatMap((entry) => readdirSync(join(phaseRoot, entry.name), { withFileTypes: true })
          .filter((child) => child.isFile())
          .map((child) => join(phaseRoot, entry.name, child.name))),
    ];
    return candidates.find((path) => artifactPattern.test(basename(path)) && (!writtenSet || writtenSet.has(resolve(path))) && exists(path));
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWrittenPath(cwd: string, value: string): string {
  return resolve(isAbsolute(value) ? value : resolve(cwd, value));
}

function closeoutEvidence(cwd: string, phase: string, written?: string[]): boolean {
  if (!written?.length) return false;
  const writtenSet = new Set(written.map((path) => normalizeWrittenPath(cwd, path)));
  const roadmapPath = resolve(cwd, ".planning", "ROADMAP.md");
  const statePath = resolve(cwd, ".planning", "STATE.md");
  if (!writtenSet.has(roadmapPath) || !writtenSet.has(statePath)) return false;
  try {
    const roadmap = readFileSync(roadmapPath, "utf8");
    const state = readFileSync(statePath, "utf8");
    statSync(join(cwd, ".planning", "phases"));
    return roadmapPhaseComplete(roadmap, phase) && statePhaseComplete(state, phase);
  } catch {
    return false;
  }
}

function phaseVerificationPassed(cwd: string, phaseRoot: string, phase: string, exists: (path: string) => boolean): boolean {
  const verificationPath = findMatchingArtifact(cwd, phaseRoot, phase, "VERIFICATION.md", exists, undefined, false);
  if (!verificationPath) return false;
  const content = readFileSync(verificationPath, "utf8");
  const status = /^status:\s*(\S+)/m.exec(content)?.[1]?.trim().toLowerCase();
  return status === "passed" || status === "pass";
}

function roadmapPhaseComplete(roadmap: string, phase: string): boolean {
  const phaseNumber = Number(phase);
  return roadmap.split(/\r?\n/).some((line) => {
    const columns = line.split("|").map((part) => part.trim());
    if (columns.length < 6) return false;
    const [done, total] = columns[3].split("/").map((part) => Number(part));
    return columns[1].startsWith(`${phaseNumber}.`)
      && Number.isInteger(done)
      && Number.isInteger(total)
      && total > 0
      && done === total
      && /^(Complete|✓ Done)$/.test(columns[4]);
  });
}

function statePhaseComplete(state: string, phase: string): boolean {
  const currentPosition = extractCurrentPositionSection(state);
  if (!currentPosition) return false;
  const phaseNumber = Number(phase);
  return currentPosition.split(/\r?\n/).some((line) => {
    const normalized = line.trim();
    return normalized.startsWith(`Phase: ${phaseNumber} `)
      && /\(\*\*completed\*\*\)|\bcompleted\b/i.test(normalized)
      && !/\bnot\s+completed\b|\bnot\s+complete\b|\bincomplete\b/i.test(normalized);
  });
}

function extractCurrentPositionSection(state: string): string {
  const match = state.match(/^## Current Position\s*\n([\s\S]*?)(?=\n##\s|$)/m);
  return match?.[1] ?? "";
}
