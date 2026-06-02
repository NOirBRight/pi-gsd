import { readOrchestrationContractSnapshot } from "../orchestration-contract/index.js";

export const PHASE_ID_PATTERN = /^\d+(?:\.\d+)*$/;

export function isValidPhaseId(phase: string, options: { cwd?: string } = {}): boolean {
  const pattern = phasePattern(options.cwd);
  return pattern.test(phase);
}

function phasePattern(cwd: string | undefined): RegExp {
  if (!cwd) return PHASE_ID_PATTERN;
  const lexicalPattern = readOrchestrationContractSnapshot(cwd)?.phaseIdPolicy.lexicalPattern;
  if (!lexicalPattern) return PHASE_ID_PATTERN;
  try {
    return new RegExp(lexicalPattern);
  } catch {
    return PHASE_ID_PATTERN;
  }
}
