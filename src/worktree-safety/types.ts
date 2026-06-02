import type { Stats } from "node:fs";
import type { RecoveryDecision, RecoveryDecisionEvidence } from "../recovery/types.js";
import type { UnitType } from "../orchestrator/types.js";

export type LeaseJournalEvent = {
  type: "lease_acquired" | "lease_released" | "lease_stale_reclaimed";
  event?: "lease_acquired" | "lease_released" | "lease_stale_reclaimed";
  ts?: string;
  phase?: string;
  unitId: string;
  root?: string;
  paths?: string[];
  branch?: string;
  attempt?: number;
  action?: string;
  recoveryClass?: string;
  reasonCode?: string;
  written?: string[];
  message?: string;
  host?: string;
  pid?: number;
};

export type WorktreeEvidence = RecoveryDecisionEvidence & {
  root?: string;
  branch?: string;
  expectedBranch?: string;
  journalEvents?: LeaseJournalEvent[];
};

export type PrepareUnitRootResult =
  | { ok: true; root: string; evidence: WorktreeEvidence }
  | { ok: false; decision: RecoveryDecision };

export type WorktreeLeaseRecord = {
  unitId: string;
  sessionId?: string;
  phase?: string;
  branch?: string;
  root?: string;
  host?: string;
  pid?: number;
  updatedAt?: string;
};

export type LeaseOwnershipEvidence = {
  expected?: Partial<WorktreeLeaseRecord>;
  actual?: Partial<WorktreeLeaseRecord>;
  provenInactive?: boolean;
  incomplete?: boolean;
  contradictory?: boolean;
};

export type WorktreeLeaseCheck =
  | { ok: true; record?: WorktreeLeaseRecord; journalEvents?: LeaseJournalEvent[]; selfHealed?: boolean }
  | { ok: false; decision: RecoveryDecision };

export type GitProbeDeps = {
  existsSync(path: string): boolean;
  lstatSync(path: string): Pick<Stats, "isFile" | "isDirectory">;
  readFileSync(path: string): string;
  writeFileSync(path: string, content: string): void;
  unlinkSync(path: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  cwd(): string;
  env(name: string): string | undefined;
  currentBranch(root: string): string | undefined;
  now(): string;
  hostname(): string;
  pid(): number;
  isProcessAlive?(pid: number, host?: string): boolean | undefined;
};

export type WorktreeSafetyDeps = GitProbeDeps;

export type PrepareUnitRootInput = {
  unitType: UnitType;
  unitId: string;
  phase?: string;
  projectRoot?: string;
  unitRoot?: string;
  expectedBranch?: string;
  workflow?: { worktrees?: boolean };
  sessionId?: string;
  attempt?: number;
  leasePath?: string;
  deps?: Partial<WorktreeSafetyDeps>;
};

export type PrepareUnitRootOptions = Omit<PrepareUnitRootInput, "unitType" | "unitId">;
