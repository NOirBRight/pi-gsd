import { dirname, isAbsolute, relative, resolve } from "node:path";
import { classifyFailure } from "../recovery/classify-failure.js";
import type { LeaseJournalEvent, PrepareUnitRootInput, WorktreeLeaseCheck, WorktreeLeaseRecord, WorktreeSafetyDeps } from "./types.js";
import { defaultWorktreeSafetyDeps } from "./git.js";

type LeaseReadResult =
  | { ok: true; path: string; record?: WorktreeLeaseRecord }
  | { ok: false; path: string; message: string };

export function readLeaseRecord(root: string, leasePath: string | undefined, deps: WorktreeSafetyDeps = defaultWorktreeSafetyDeps): WorktreeLeaseRecord | undefined {
  const result = readLeaseRecordStrict(root, leasePath, deps);
  return result.ok ? result.record : undefined;
}

function readLeaseRecordStrict(root: string, leasePath: string | undefined, deps: WorktreeSafetyDeps = defaultWorktreeSafetyDeps): LeaseReadResult {
  const resolved = resolveLeasePath(root, leasePath);
  const path = resolved.ok ? resolved.path : leasePath ?? `.planning/worktree-leases/lease.json`;
  if (!resolved.ok) return { ok: false, path, message: resolved.message };
  if (!deps.existsSync(resolved.path)) return { ok: true, path: resolved.path };
  try {
    const parsed = JSON.parse(deps.readFileSync(resolved.path)) as unknown;
    const validation = validateLeaseRecord(parsed);
    if (!validation.ok) return { ok: false, path: resolved.path, message: validation.message };
    return { ok: true, path: resolved.path, record: validation.record };
  } catch (error) {
    return { ok: false, path: resolved.path, message: error instanceof Error ? error.message : String(error) };
  }
}

export function checkLeaseOwnership(input: PrepareUnitRootInput, root: string, branch?: string, deps: WorktreeSafetyDeps = defaultWorktreeSafetyDeps): WorktreeLeaseCheck {
  const resolved = resolveLeasePath(root, input.leasePath);
  if (!resolved.ok) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-path-outside-planning", class: "worktree-invalid", message: resolved.message, remediation: "Use a lease path under .planning.", evidence: { unitId: input.unitId, unitType: input.unitType, root, branch, paths: [input.leasePath ?? ""] } }) };
  }
  const leaseRead = readLeaseRecordStrict(root, input.leasePath, deps);
  if (!leaseRead.ok) {
    return leaseIoFailure(input, root, branch, "lease-invalid", "user-input-required", `Cannot prove lease ownership because the lease file is unreadable or invalid: ${leaseRead.message}`, "Inspect and repair or remove the lease only after proving ownership or process inactivity.", [leaseRead.path], [leaseRead.message]);
  }
  const record = leaseRead.record;
  const expected = expectedRecord(input, root, branch, deps);
  if (!record) {
    try {
      deps.mkdirSync(dirname(resolved.path), { recursive: true });
      deps.writeFileSync(resolved.path, JSON.stringify(expected, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return leaseIoFailure(input, root, branch, "lease-acquire-failed", "worktree-invalid", `Cannot acquire lease: ${message}`, "Inspect lease path permissions and retry only after source-writing ownership can be recorded.", [resolved.path], [message]);
    }
    return { ok: true, record: expected, journalEvents: [leaseAcquiredEvent(expected, resolved.path, input.attempt)] };
  }
  if (isOwner(record, expected)) return { ok: true, record };
  const stale = reclaimStaleLeaseIfSafe(record, expected, resolved.path, deps, input.attempt);
  if (stale.ok) return stale;
  const evidence = { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, expected: expected as unknown as Record<string, unknown>, actual: record as unknown as Record<string, unknown> };
  const partial = !record.pid || !record.host || !record.root || !record.branch;
  const contradictory = Boolean(record.root && record.root !== root) || Boolean(record.branch && branch && record.branch !== branch);
  if (partial || contradictory) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: partial ? "lease-stale-incomplete" : "lease-stale-contradictory", class: partial ? "user-input-required" : "unrepaired-state-drift", message: "Stale lease evidence is incomplete or contradictory.", remediation: "Inspect and remediate the stale lease before continuing.", evidence }) };
  }
  return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-wrong-owner", class: "worktree-invalid", message: "Lease is held by a different owner.", remediation: "Stop and inspect lease ownership before source-writing dispatch.", evidence }) };
}

export function releaseLeaseOwnership(input: PrepareUnitRootInput, root: string, branch?: string, deps: WorktreeSafetyDeps = defaultWorktreeSafetyDeps): WorktreeLeaseCheck {
  const effectiveDeps = { ...deps, ...input.deps } satisfies WorktreeSafetyDeps;
  const resolved = resolveLeasePath(root, input.leasePath);
  if (!resolved.ok) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-path-outside-planning", class: "worktree-invalid", message: resolved.message, remediation: "Use a lease path under .planning.", evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, paths: [input.leasePath ?? ""] } }) };
  }

  const leaseRead = readLeaseRecordStrict(root, input.leasePath, effectiveDeps);
  if (!leaseRead.ok) {
    return leaseIoFailure(input, root, branch, "lease-invalid", "user-input-required", `Cannot release lease because the lease file is unreadable or invalid: ${leaseRead.message}`, "Inspect and repair or remove the lease only after proving ownership or process inactivity.", [leaseRead.path], [leaseRead.message]);
  }
  const record = leaseRead.record;
  const expected = expectedRecord(input, root, branch, effectiveDeps);
  if (!record) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-missing", class: "worktree-invalid", message: "Cannot release a missing lease.", remediation: "Inspect lease lifecycle evidence before continuing.", evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, paths: [resolved.path] } }) };
  }

  if (!isOwner(record, expected)) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-wrong-owner", class: "worktree-invalid", message: "Cannot release a lease held by a different owner.", remediation: "Stop and inspect lease ownership before releasing source-writing ownership.", evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, expected: expected as unknown as Record<string, unknown>, actual: record as unknown as Record<string, unknown>, paths: [resolved.path] } }) };
  }

  try {
    effectiveDeps.unlinkSync(resolved.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return leaseIoFailure(input, root, branch, "lease-release-failed", "worktree-invalid", `Cannot release lease: ${message}`, "Inspect and remove the lease only after proving ownership or process inactivity.", [resolved.path], [message], { expected, actual: record });
  }
  return { ok: true, record, journalEvents: [leaseReleasedEvent(record, resolved.path, input.attempt)] };
}

export function reclaimStaleLeaseIfSafe(record: WorktreeLeaseRecord, expected: WorktreeLeaseRecord, path: string, deps: WorktreeSafetyDeps = defaultWorktreeSafetyDeps, attempt?: number): WorktreeLeaseCheck {
  const alive = record.pid ? deps.isProcessAlive?.(record.pid, record.host) : undefined;
  if (alive !== false || !record.root || !record.branch || record.root !== expected.root || record.branch !== expected.branch) {
    return { ok: false, decision: classifyFailure({ kind: "worktree", reasonCode: "lease-not-reclaimable", class: "unrepaired-state-drift", message: "Lease is not safely reclaimable.", remediation: "Inspect the lease owner before continuing.", evidence: { unitId: expected.unitId, phase: expected.phase, root: expected.root, branch: expected.branch } }) };
  }
  try {
    deps.mkdirSync(dirname(path), { recursive: true });
    deps.writeFileSync(path, JSON.stringify(expected, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return leaseIoFailure({ unitId: expected.unitId, unitType: "execute", phase: expected.phase }, expected.root ?? "", expected.branch, "lease-reclaim-failed", "worktree-invalid", `Cannot reclaim stale lease: ${message}`, "Inspect lease path permissions and retry only after source-writing ownership can be recorded.", [path], [message], { expected, actual: record });
  }
  return { ok: true, record: expected, selfHealed: true, journalEvents: [leaseStaleReclaimedEvent(expected, path, attempt)] };
}

export function leaseAcquiredEvent(record: WorktreeLeaseRecord, path?: string, attempt?: number): LeaseJournalEvent {
  return leaseEvent("lease_acquired", record, path, attempt, "self-heal", "repairable-state-drift", "lease-acquired");
}

export function leaseReleasedEvent(record: WorktreeLeaseRecord, path?: string, attempt?: number): LeaseJournalEvent {
  return leaseEvent("lease_released", record, path, attempt, "self-heal", "repairable-state-drift", "lease-released");
}

export function leaseStaleReclaimedEvent(record: WorktreeLeaseRecord, path?: string, attempt?: number): LeaseJournalEvent {
  return leaseEvent("lease_stale_reclaimed", record, path, attempt, "self-heal", "repairable-state-drift", "lease-stale-reclaimed");
}

function leaseEvent(type: LeaseJournalEvent["type"], record: WorktreeLeaseRecord, path: string | undefined, attempt: number | undefined, action: string, recoveryClass: string, reasonCode: string): LeaseJournalEvent {
  return { type, event: type, unitId: record.unitId, phase: record.phase, root: record.root, branch: record.branch, paths: path ? [path] : undefined, attempt, action, recoveryClass, reasonCode, message: type, host: record.host, pid: record.pid };
}

function validateLeaseRecord(value: unknown): { ok: true; record: WorktreeLeaseRecord } | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "lease record must be a JSON object" };

  const record = value as Partial<WorktreeLeaseRecord>;
  if (typeof record.unitId !== "string" || record.unitId.length === 0) return { ok: false, message: "lease record must include a unitId" };
  if (record.sessionId !== undefined && typeof record.sessionId !== "string") return { ok: false, message: "lease record sessionId must be a string" };
  if (record.phase !== undefined && typeof record.phase !== "string") return { ok: false, message: "lease record phase must be a string" };
  if (record.branch !== undefined && typeof record.branch !== "string") return { ok: false, message: "lease record branch must be a string" };
  if (record.root !== undefined && typeof record.root !== "string") return { ok: false, message: "lease record root must be a string" };
  if (record.host !== undefined && typeof record.host !== "string") return { ok: false, message: "lease record host must be a string" };
  if (record.pid !== undefined && typeof record.pid !== "number") return { ok: false, message: "lease record pid must be a number" };
  if (record.updatedAt !== undefined && typeof record.updatedAt !== "string") return { ok: false, message: "lease record updatedAt must be a string" };

  return { ok: true, record: record as WorktreeLeaseRecord };
}

function leaseIoFailure(input: Pick<PrepareUnitRootInput, "unitId" | "unitType" | "phase">, root: string, branch: string | undefined, reasonCode: string, recoveryClass: "worktree-invalid" | "user-input-required", message: string, remediation: string, paths: string[], messages?: string[], ownership?: { expected?: WorktreeLeaseRecord; actual?: WorktreeLeaseRecord }): WorktreeLeaseCheck {
  return {
    ok: false,
    decision: classifyFailure({
      kind: "worktree",
      reasonCode,
      class: recoveryClass,
      message,
      remediation,
      evidence: {
        unitId: input.unitId,
        unitType: input.unitType,
        phase: input.phase,
        root,
        branch,
        paths,
        messages,
        ...(ownership?.expected ? { expected: ownership.expected as unknown as Record<string, unknown> } : {}),
        ...(ownership?.actual ? { actual: ownership.actual as unknown as Record<string, unknown> } : {}),
      },
    }),
  };
}

function expectedRecord(input: PrepareUnitRootInput, root: string, branch: string | undefined, deps: WorktreeSafetyDeps): WorktreeLeaseRecord {
  return { unitId: input.unitId, sessionId: input.sessionId, phase: input.phase, branch, root, host: deps.hostname(), pid: deps.pid(), updatedAt: deps.now() };
}

function isOwner(record: WorktreeLeaseRecord, expected: WorktreeLeaseRecord): boolean {
  return record.unitId === expected.unitId && record.sessionId === expected.sessionId && record.phase === expected.phase && record.branch === expected.branch && record.root === expected.root && record.host === expected.host && record.pid === expected.pid;
}

function resolveLeasePath(root: string, leasePath?: string): { ok: true; path: string } | { ok: false; message: string } {
  const planningDir = resolve(root, ".planning");
  const candidate = resolve(root, leasePath ?? `.planning/worktree-leases/lease.json`);
  if (!isInsideOrSame(planningDir, candidate)) return { ok: false, message: `refusing lease path outside .planning: ${candidate}` };
  return { ok: true, path: candidate };
}

function isInsideOrSame(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
