export const PHASE_ID_PATTERN = /^\d{2}$/;

export function isValidPhaseId(phase: string): boolean {
  return PHASE_ID_PATTERN.test(phase);
}
