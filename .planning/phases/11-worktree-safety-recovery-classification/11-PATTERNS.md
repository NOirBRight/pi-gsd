# Phase 11: Worktree Safety + Recovery Classification - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 18
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/recovery/types.ts` | model | transform | `src/state-reconciliation/types.ts` | exact |
| `src/recovery/classify-failure.ts` | service | transform | `src/state-reconciliation/catalog.ts` + `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/recovery-classification.ts` | role-match |
| `src/recovery/index.ts` | provider | request-response | `src/state-reconciliation/index.ts` | exact |
| `src/worktree-safety/types.ts` | model | file-I/O | `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts` | exact |
| `src/worktree-safety/git.ts` | service | file-I/O | `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts` | role-match |
| `src/worktree-safety/lease.ts` | service | file-I/O | `src/orchestrator/journal.ts` | role-match |
| `src/worktree-safety/prepare-unit-root.ts` | service | request-response + file-I/O | `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts` + `src/orchestrator/gates.ts` | exact |
| `src/worktree-safety/index.ts` | provider | request-response | `src/state-reconciliation/index.ts` | exact |
| `src/orchestrator/gates.ts` | middleware | request-response | existing file | exact |
| `src/orchestrator/types.ts` | model | event-driven | existing file | exact |
| `src/orchestrator/state-machine.ts` | service | event-driven | existing file | exact |
| `src/orchestrator/journal.ts` | service | file-I/O | existing file | exact |
| `src/orchestrator/reconciliation.ts` | middleware | transform | existing file | exact |
| `src/index.ts` | provider | request-response | existing file | exact |
| `tests/recovery.test.ts` | test | transform | `tests/state-reconciliation.test.ts` | exact |
| `tests/worktree-safety.test.ts` | test | file-I/O | `tests/state-reconciliation.test.ts` + `tests/orchestrator-journal.test.ts` | role-match |
| `tests/orchestrator.test.ts` | test | event-driven | existing file | exact |
| `tests/orchestrator-journal.test.ts` | test | file-I/O | existing file | exact |

## Pattern Assignments

### `src/recovery/types.ts` (model, transform)

**Analog:** `src/state-reconciliation/types.ts`

**Imports pattern:** no imports; keep pure type/value definitions.

**Typed enum-array pattern** (lines 1-13):
```typescript
export const RECONCILIATION_REASON_CODES = [
  "sketch-flag-drift",
  "completion-timestamp-drift",
  "roadmap-divergence",
  "stale-worker",
  "unregistered-milestone",
  "summary-count-mismatch",
  "noncanonical-plan-like-file",
  "unknown-drift",
  "partial-write",
] as const;

export type ReconciliationReasonCode = (typeof RECONCILIATION_REASON_CODES)[number];
```

**Structured handoff shape** (lines 63-74, 117-124):
```typescript
export type ReconciliationBlocker = {
  reasonCode: ReconciliationReasonCode;
  message: string;
  evidence: ReconciliationEvidence[];
  phase?: string;
  artifact?: CanonicalArtifactKind | "state" | "roadmap" | "journal" | "noncanonical";
  repairPlan?: ReconciliationRepair[];
  written?: ReconciliationWrite[];
  suggestedNextAction?: ReconciliationSuggestedNextAction;
};

export type ReconciliationFailureContext = {
  reasonCode: ReconciliationReasonCode;
  blockers: ReconciliationBlocker[];
  repairPlan: ReconciliationRepair[];
  evidence: ReconciliationEvidence[];
  suggestedNextAction: ReconciliationSuggestedNextAction;
  report: ReconciliationReport;
};
```

Apply this to define `RECOVERY_CLASSES`, `RECOVERY_ACTIONS`, `RecoveryClass`, `RecoveryAction`, `RecoveryDecision`, and bounded evidence types. Use `satisfies Record<RecoveryClass, RecoveryAction>` for the fixed action table.

---

### `src/recovery/classify-failure.ts` (service, transform)

**Analogs:** `src/state-reconciliation/catalog.ts`; reference only: `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/recovery-classification.ts`

**Local import pattern** (`src/state-reconciliation/catalog.ts`, lines 1-11):
```typescript
import { detectNoncanonicalPlanLikeFiles } from "./drift/noncanonical-plan-like-file.js";
import { detectCompletionTimestampDrift } from "./drift/completion-timestamp.js";
import type { ReconciledStateSnapshot, ReconciliationBlocker, ReconciliationEvidence, ReconciliationReasonCode, ReconciliationRepair } from "./types.js";
```
Use NodeNext `.js` suffixes for local imports.

**Table/list-driven transform pattern** (`src/state-reconciliation/catalog.ts`, lines 13-24, 45-53):
```typescript
export const KNOWN_DRIFT_KINDS = [
  "sketch-flag-drift",
  "completion-timestamp-drift",
  "roadmap-divergence",
  "stale-worker",
  "unregistered-milestone",
  "summary-count-mismatch",
  "noncanonical-plan-like-file",
  "unknown-drift",
] as const satisfies readonly ReconciliationReasonCode[];

export function classifyDrift(input: DriftDetectionInput): DriftDetection {
  return DETECTORS.reduce<DriftDetection>((combined, detector) => {
    const result = detector(input);
    combined.repairs.push(...result.repairs);
    combined.blockers.push(...result.blockers);
    combined.evidence.push(...result.evidence);
    return combined;
  }, { repairs: [], blockers: [], evidence: [] });
}
```

**Switch-based classifier pattern** (`gsd-pi/.../recovery-classification.ts`, lines 36-46, 71-82, 96-116):
```typescript
export function classifyFailure(input: RecoveryClassificationInput): RecoveryClassification {
  const message = errorMessage(input.error);
  const failureKind =
    input.error instanceof ReconciliationFailedError
      ? "reconciliation-drift"
      : input.failureKind ?? inferFailureKind(message);

  switch (failureKind) {
    case "worktree-invalid":
      return {
        failureKind,
        action: "stop",
        reason: `Worktree invalid${unitSuffix(input)}: ${message}`,
        exitReason: "worktree-invalid",
        remediation: "Repair or recreate the milestone worktree before launching source-writing Units.",
      };
    case "provider": {
      const providerClass = classifyError(message, input.retryAfterMs);
      return {
        failureKind,
        action: isTransient(providerClass) ? "retry" : "escalate",
        reason: message,
        exitReason: `provider-${providerClass.kind}`,
        remediation: isTransient(providerClass)
          ? "Retry after the provider/network condition clears."
          : "Inspect provider credentials, model entitlement, or request shape.",
        providerClass: providerClass.kind,
      };
    }
  }
}
```
Do **not** copy gsd-pi taxonomy/action names. Copy only the exhaustive classifier structure; Phase 11 uses exactly the eight locked classes and actions from CONTEXT D-09/D-14.

**Reconciliation input/error pattern** (`src/state-reconciliation/errors.ts`, lines 10-35, 61-64):
```typescript
export class ReconciliationFailedError extends Error implements ReconciliationFailureContext {
  readonly reasonCode: ReconciliationReasonCode;
  readonly blockers: ReconciliationFailureContext["blockers"];
  readonly repairPlan: ReconciliationRepair[];
  readonly evidence: ReconciliationEvidence[];
  readonly suggestedNextAction: ReconciliationSuggestedNextAction;
  readonly report: ReconciliationReport;

  constructor(report: ReconciliationReport) {
    const firstBlocker = report.blockers[0];
    const reasonCode = firstBlocker?.reasonCode ?? "unknown-drift";
    super(`State reconciliation failed: ${reasonCode}`);
    this.name = "ReconciliationFailedError";
    this.reasonCode = reasonCode;
    this.blockers = report.blockers;
    this.repairPlan = firstBlocker?.repairPlan?.length ? firstBlocker.repairPlan : report.repairs;
    this.evidence = uniqueEvidence([
      ...report.evidence,
      ...report.blockers.flatMap((blocker) => blocker.evidence),
    ]);
    this.suggestedNextAction = firstBlocker?.suggestedNextAction ?? suggestedActionFor(reasonCode);
    this.report = report;
  }
}

function suggestedActionFor(reasonCode: ReconciliationReasonCode): ReconciliationSuggestedNextAction {
  if (reasonCode === "partial-write") return "rerun-reconcile";
  if (reasonCode === "stale-worker") return "requires-recovery-classification";
  return "manual-review";
}
```
Map by `reasonCode`, not prose or `suggestedNextAction`. Preserve `written[]` evidence for `partial-write`.

---

### `src/recovery/index.ts` (provider, request-response)

**Analog:** `src/state-reconciliation/index.ts`

**Barrel export + public function pattern** (lines 10-18):
```typescript
export { classifyDrift, KNOWN_DRIFT_KINDS } from "./catalog.js";
export { classifyArtifactName } from "./artifacts.js";
export { ReconciliationFailedError } from "./errors.js";
export { readJournalState } from "./journal.js";
export { applyRepairs, planRepairs } from "./repair.js";
export { readRoadmapState } from "./roadmap.js";
export { scanPlanningArtifacts } from "./scan.js";
export { readStateDigest } from "./state.js";
export * from "./types.js";
```
Export `classifyFailure`, `RECOVERY_CLASSES`, `RECOVERY_ACTIONS`, and all recovery types here.

---

### `src/worktree-safety/types.ts` (model, file-I/O)

**Analog:** `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts`

**Result-style safety model** (lines 15-40):
```typescript
export type WorktreeSafetyResult =
  | {
      ok: true;
      kind: "not-required";
      reason: string;
    }
  | {
      ok: true;
      kind: "safe";
      projectRoot: string;
      unitRoot: string;
      milestoneId: string;
      branch?: string;
    }
  | {
      ok: false;
      kind: WorktreeSafetyFailureKind;
      reason: string;
      remediation: string;
      details?: Record<string, string | number | boolean | null>;
    };
```
Adapt to Phase 11 contract: `{ ok: true; root; evidence } | { ok: false; decision: RecoveryDecision }`.

**Dependency interface pattern** (lines 71-78):
```typescript
export interface WorktreeSafetyDeps {
  existsSync(path: string): boolean;
  lstatSync(path: string): Pick<Stats, "isFile">;
  listRegisteredWorktrees?(projectRoot: string): readonly RegisteredWorktree[];
  pruneRegisteredWorktrees?(projectRoot: string): void;
  getCurrentBranch?(unitRoot: string): string;
}
```
Use injectable deps for filesystem, Git, cwd/env, process/host liveness, and lease reads/writes.

---

### `src/worktree-safety/git.ts` (service, file-I/O)

**Analog:** `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts`

**Node built-in import pattern** (lines 3-11):
```typescript
import { existsSync, lstatSync, type Stats } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
```

**Default deps pattern** (lines 80-96):
```typescript
const defaultDeps: WorktreeSafetyDeps = {
  ...fsOnlyDeps,
  listRegisteredWorktrees(projectRoot) {
    return listWorktrees(projectRoot).map((worktree) => ({
      path: worktree.path,
      branch: worktree.branch,
    }));
  },
  pruneRegisteredWorktrees(projectRoot) {
    execFileSync("git", ["worktree", "prune"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
  },
  getCurrentBranch,
};
```
Use `execFileSync("git", [...])` argument arrays; do not shell-concatenate commands.

---

### `src/worktree-safety/lease.ts` (service, file-I/O)

**Analog:** `src/orchestrator/journal.ts`

**Safe path resolution pattern** (lines 166-178):
```typescript
function resolveJournalPath(options: JournalOptions): { ok: true; path: string } | { ok: false; messages: string[] } {
  const cwd = resolve(options.cwd);
  const planningDir = resolve(cwd, ".planning");
  const candidate = resolve(cwd, options.journalPath ?? DEFAULT_JOURNAL_PATH);

  if (!isInsideOrSame(planningDir, candidate)) {
    return { ok: false, messages: [`refusing orchestration journal path outside .planning: ${candidate}`] };
  }

  return { ok: true; path: candidate };
}
```
Keep lease files under `.planning/...`; fail closed on paths outside `.planning`.

**Redaction/bounded evidence pattern** (lines 38-42, 119-142, 196-202):
```typescript
const allowedEventKeys = new Set(["type", "ts", "phase", "unitId", "status", "attempt", "reason", "resumeHint", "evidence"]);
const unsafeEventKeys = new Set(["prompt", "userText", "env", "token", "secret", "password", "apiKey", "api_key", "authorization", "bearer", "args", "arguments", "rawArgs"]);
const secretPattern = /(?:password|secret|token|api[_-]?key|authorization|bearer)/i;
const maxStringLength = 240;
const maxEvidenceItems = 20;

export function redactJournalEvent(event: JournalEvent): JournalEvent {
  const redacted: JournalEvent = {};
  for (const [key, value] of Object.entries(event)) {
    if (unsafeEventKeys.has(key) || !allowedEventKeys.has(key)) continue;
    if (key === "evidence") {
      const evidence = Array.isArray(value) ? value : [];
      redacted.evidence = evidence.filter((item): item is string => typeof item === "string").slice(0, maxEvidenceItems).map(safeString);
      continue;
    }
    if (typeof value === "string") redacted[key] = safeString(value);
    if (typeof value === "number" || typeof value === "boolean") redacted[key] = value;
  }
  return redacted;
}

function safeString(value: string): string {
  return secretPattern.test(value) ? "[REDACTED]" : truncate(value);
}
```
Use same bounded/redacted approach for lease holder/session evidence.

---

### `src/worktree-safety/prepare-unit-root.ts` (service, request-response + file-I/O)

**Analogs:** `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/worktree-safety.ts`; `src/orchestrator/gates.ts`

**Planning-only/source-writing skip pattern** (`gsd-pi/.../worktree-safety.ts`, lines 131-139):
```typescript
return {
  validateUnitRoot(input) {
    if (input.writeScope === "planning-only") {
      return {
        ok: true,
        kind: "not-required",
        reason: "planning-only Units may write GSD artifacts without a source worktree",
      };
    }
```
Adapt to current `OrchestrationUnit` values; at minimum table-test `execute` as source-writing and discuss/research/plan as not requiring isolated source worktree.

**Root, `.git`, branch, and lease checks** (`gsd-pi/.../worktree-safety.ts`, lines 161-173, 186-213, 296-311):
```typescript
const expectedRoot = isolationMode === "worktree"
  ? join(projectRoot, ".gsd", "worktrees", milestoneId)
  : projectRoot;
if (!samePath(unitRoot, expectedRoot)) {
  return failure(
    "invalid-root",
    isolationMode === "worktree"
      ? `Unit root ${unitRoot} is not the expected worktree root for ${milestoneId}.`
      : `Unit root ${unitRoot} is not the project root while isolation mode is ${isolationMode}.`,
    isolationMode === "worktree"
      ? "Prepare the Unit in its canonical milestone worktree before allowing source writes."
      : "Run the Unit from the project root when worktree isolation is disabled.",
    { expectedRoot, unitRoot },
  );
}

const gitMarker = join(unitRoot, ".git");
if (!deps.existsSync(gitMarker)) {
  return failure("worktree-git-marker-missing", `Worktree root ${unitRoot} has no .git marker.`, "Recover or recreate the milestone worktree before dispatching the source-writing Unit.", { gitMarker });
}

if (branch !== expectedBranch) {
  return failure("branch-mismatch", `Worktree root ${unitRoot} is on branch ${branch}, expected ${expectedBranch}.`, "Switch to the expected milestone branch or recover the worktree before dispatching the Unit.", { branch, expectedBranch });
}

if (input.lease?.required && !input.lease.held) {
  return failure("lease-lost", `Milestone lease for ${milestoneId} is not held by the current worker.`, "Reclaim the milestone lease before dispatching the source-writing Unit.", { owner: input.lease.owner ?? null });
}
```
Phase 11 must return `RecoveryDecision` class `worktree-invalid` with action `stop`, not gsd-pi failure kinds as public classes.

**Current local seam to replace** (`src/orchestrator/gates.ts`, lines 73-79):
```typescript
function prepareUnitRoot(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): GateResult {
  if (unit.type === "execute" && snapshot.settings.workflow.worktrees === false) {
    return pass("prepareUnitRoot", "worktree disabled by settings");
  }
  return pass("prepareUnitRoot", "phase-11-worktree-safety-seam");
}
```
Do not keep this bypass. With `workflow.worktrees=false`, still validate project root `.git`, branch, and `GSD_PROJECT_ROOT`; only skip isolated worktree/lease requirements.

---

### `src/worktree-safety/index.ts` (provider, request-response)

**Analog:** `src/state-reconciliation/index.ts`

Use the same barrel pattern as `src/recovery/index.ts`: export `prepareUnitRoot`, git/lease helper types that are intended for tests, and all public worktree-safety types with `.js` import suffixes.

---

### `src/orchestrator/gates.ts` (middleware, request-response)

**Analog:** existing file

**Gate order pattern** (lines 8-24):
```typescript
export function runPreDispatchGates(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, overrides: GateOverrides = {}): GateResult {
  const orderedGates: [Exclude<GateName, "artifact">, GateAdapter][] = [
    ["reconcileBeforeDispatch", overrides.reconcileBeforeDispatch ?? reconcileBeforeDispatch],
    ["decideDispatch", overrides.decideDispatch ?? decideDispatch],
    ["validateToolContract", overrides.validateToolContract ?? validateToolContract],
    ["prepareUnitRoot", overrides.prepareUnitRoot ?? prepareUnitRoot],
    ["persistRuntimeState", overrides.persistRuntimeState ?? persistRuntimeState],
  ];

  for (const [, gate] of orderedGates) {
    const result = gate(snapshot, unit);
    if (!result.ok) return result;
  }

  return { ok: true, gate: "persistRuntimeState", evidence: orderedGates.map(([name]) => name) };
}
```
Import the real worktree-safety module and adapt its result in the existing `prepareUnitRoot` gate position.

**Gate failure shape pattern** (lines 88-90):
```typescript
function fail(resumeHint: string, evidence: string[]): GateResult {
  return { ok: false, gate: "artifact", reason: "gate-failed", retryable: false, resumeHint, evidence };
}
```
Extend failure objects with `recoveryDecision` while retaining `reason`, `resumeHint`, and `evidence`.

---

### `src/orchestrator/types.ts` (model, event-driven)

**Analog:** existing file

**Current gate/result/event models** (lines 24-31, 96-98, 113-138):
```typescript
export type StopReason = "gate-failed" | "ambiguous-dispatch" | "retry-budget-exhausted" | "dispatch-failed" | "stopped";

export type OrchestrationUnit = {
  id: string;
  type: UnitType;
  status: UnitStatus;
  phase: string;
  label: string;
  required: boolean;
  source: WorkflowSettingSource | "phase-signal";
  metadata?: Record<string, string | number | boolean>;
  resumeHint?: string;
};

export type GateResult =
  | { ok: true; gate: GateName; evidence: string[]; retryable?: false }
  | { ok: false; gate: GateName; reason: StopReason | string; retryable: boolean; resumeHint: string; evidence?: string[] };

export type OrchestrationEvent = {
  type: "orchestration_started" | "settings_resolved" | "unit_started" | "unit_ended" | "gate_passed" | "gate_failed" | "retry_scheduled" | "pause" | "resume" | "stop" | "orchestration_completed" | "start" | "unit-start" | "unit-end" | "gate-pass" | "gate-fail" | "retry";
  ts: string;
  phase: string;
  unitId?: string;
  status: UnitStatus;
  attempt: number;
  reason?: string;
  resumeHint?: string;
  evidence?: string[];
};
```
Add `recoveryDecision?: RecoveryDecision` and `exitReason?: RecoveryClass` to failure/event shapes without breaking existing fields.

---

### `src/orchestrator/state-machine.ts` (service, event-driven)

**Analog:** existing file

**Retry/pause handling pattern** (lines 134-175):
```typescript
function handleGateFailure(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit, gate: Extract<GateResult, { ok: false }>, now?: () => string): AdvanceResult {
  if (gate.retryable && snapshot.settings.workflow.node_repair && snapshot.attempt < snapshot.settings.workflow.node_repair_budget) {
    const retrying = withEvent({ ...snapshot, attempt: snapshot.attempt + 1 }, {
      type: "retry_scheduled",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit.id,
      status: "running",
      attempt: snapshot.attempt + 1,
      reason: gate.reason,
      resumeHint: gate.resumeHint,
      evidence: gate.evidence,
    });
    const gateFailed: OrchestrationEvent = {
      type: "gate_failed",
      ts: timestamp(now),
      phase: snapshot.phase,
      unitId: unit.id,
      status: "failed",
      attempt: snapshot.attempt,
      reason: gate.reason,
      resumeHint: gate.resumeHint,
      evidence: gate.evidence,
    };
    return { ok: true, messages: [`retry scheduled: ${gate.reason}`], snapshot: retrying, status: getSnapshotStatus(retrying), events: [gateFailed, retrying.lastEvent].filter((event): event is OrchestrationEvent => Boolean(event)) };
  }

  const reason = gate.retryable ? "retry-budget-exhausted" : gate.reason;
  const paused = pause(snapshot, unit, reason, gate.resumeHint, now, gate.evidence);
```
Map `RecoveryAction.retry` to `retryable: true`. For stop-class decisions, update status/event behavior as planned while preserving existing retry budget tests.

---

### `src/orchestrator/journal.ts` (service, file-I/O)

**Analog:** existing file

**Append and redact pattern** (lines 94-112, 119-142):
```typescript
export function appendJournalEvent(options: JournalEventOptions): JournalWriteResult {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages, written: [] };

  const existing = readJournal(options);
  if (!existing.ok) return { ok: false, messages: existing.messages, written: [] };
  const events = existing.journal ? existing.journal.events : [];
  const journal: OrchestrationJournal = {
    version: 1,
    snapshot: redactSnapshot(options.snapshot),
    events: [...events, redactJournalEvent(options.event)],
  };
  return writeJournal(resolved.path, journal);
}

export function redactJournalEvent(event: JournalEvent): JournalEvent {
  const redacted: JournalEvent = {};
  for (const [key, value] of Object.entries(event)) {
    if (unsafeEventKeys.has(key) || !allowedEventKeys.has(key)) continue;
    // bounded evidence/string handling...
  }
  return redacted;
}
```
Extend `allowedEventKeys` to include only bounded recovery fields (`recoveryDecision`, `exitReason`, perhaps `action`) and keep unsafe key filtering.

---

### `src/orchestrator/reconciliation.ts` (middleware, transform)

**Analog:** existing file

**Structured blocker to gate failure pattern** (lines 12-36, 58-66):
```typescript
export function reconcileBeforeDispatch(snapshot: OrchestrationSnapshot, unit: OrchestrationUnit): ReconcileBeforeDispatchResult {
  if (snapshot.status !== "running") {
    return {
      ok: false,
      gate: "reconcileBeforeDispatch",
      reason: "ambiguous-dispatch",
      retryable: false,
      resumeHint: "Resume or start orchestration before dispatching the next Unit.",
      evidence: [`status:${snapshot.status}`],
    };
  }

  const report = reconcilePlanningStateBeforeDispatch(basePath, {
    activeUnitId: unit.id,
    phase: unit.phase,
    apply: snapshot.settings.workflow.state_reconciliation_apply === true,
  });
  if (!report.ok) return toGateFailure(toReconciliationFailedError(report), basePath);
}

export function toGateFailure(error: ReconciliationFailedError, basePath = process.cwd()): GateResult {
  return {
    ok: false,
    gate: "reconcileBeforeDispatch",
    reason: error.reasonCode,
    retryable: false,
    resumeHint: `State reconciliation blocked dispatch: ${error.reasonCode}. Inspect structured blockers before continuing.`,
    evidence: boundedGateEvidence(error, basePath),
  };
}
```
Call `classifyFailure` here or immediately downstream so reason-code mappings produce a `recoveryDecision`.

**Bounded evidence pattern** (lines 69-98):
```typescript
function boundedGateEvidence(error: ReconciliationFailedError, basePath: string): string[] {
  const values = [
    `reason:${error.reasonCode}`,
    `suggestedNextAction:${error.suggestedNextAction}`,
    ...error.blockers.flatMap((blocker) => [
      `blocker:${blocker.reasonCode}`,
      ...blocker.evidence.flatMap((evidence) => evidenceToStrings(evidence, basePath)),
    ]),
  ];
  return [...new Set(values.map(truncateEvidence))].slice(0, maxEvidenceItems);
}
```
Keep evidence bounded and path-relative where safe.

---

### `src/index.ts` (provider, request-response)

**Analog:** existing file

**Public export pattern** (lines 1-10):
```typescript
export * from "./official.js";
export * from "./frontmatter.js";
export * from "./prompt-transform.js";
export * from "./agent-transform.js";
export * from "./agent-sync.js";
export * from "./agent-generator.js";
export * from "./generator.js";
export * from "./doctor.js";
export * from "./pi-subagents.js";
export * from "./runtime-rewrites.js";
export * from "./orchestrator/index.js";
```
Add `export * from "./recovery/index.js";` and `export * from "./worktree-safety/index.js";` only if these modules are intended as stable package API.

---

### `tests/recovery.test.ts` (test, transform)

**Analog:** `tests/state-reconciliation.test.ts`

**Contract test pattern** (lines 16-56):
```typescript
it("contracts expose the minimal structured report fields", () => {
  const report = {
    ok: true,
    snapshot,
    repairs: [],
    blockers: [],
    written: [],
    evidence: [],
  } satisfies ReconciliationReport;

  expect(Object.keys(report).sort()).toEqual(["blockers", "evidence", "ok", "repairs", "snapshot", "written"]);
});

it("contracts accept the known drift reason codes", () => {
  const reasonCodes = [
    "sketch-flag-drift",
    "completion-timestamp-drift",
    "roadmap-divergence",
    "stale-worker",
    "unregistered-milestone",
    "summary-count-mismatch",
    "noncanonical-plan-like-file",
    "unknown-drift",
    "partial-write",
  ] satisfies ReconciliationReasonCode[];

  expect(RECONCILIATION_REASON_CODES).toEqual(reasonCodes);
});
```
Use equivalent tests for exactly eight `RECOVERY_CLASSES`, exact `RECOVERY_ACTIONS`, no `other`/`unknown`, all Phase 10 reason codes, and `partial-write` preserving `written[]`.

**Structured handoff test pattern** (lines 62-104):
```typescript
const error = new ReconciliationFailedError({
  ok: false,
  snapshot: { phasesPath: ".planning/phases", phases: [], totals: { plans: 1, summaries: 0, verifications: 0, reviews: 0, contexts: 0, noncanonical: 0 } },
  blockers: [blocker],
  repairs: [repair],
  written: [],
  evidence: blocker.evidence,
});

expect(error).toBeInstanceOf(Error);
expect(error.reasonCode).toBe("summary-count-mismatch");
expect(error.blockers).toEqual([blocker]);
expect(error.repairPlan).toEqual([repair]);
expect(error.evidence).toEqual(blocker.evidence);
```

---

### `tests/worktree-safety.test.ts` (test, file-I/O)

**Analogs:** `tests/state-reconciliation.test.ts`; `tests/orchestrator-journal.test.ts`

**Temp fixture pattern** (`tests/state-reconciliation.test.ts`, lines 181-207):
```typescript
const root = mkdtempSync(join(tmpdir(), "pi-gsd-state-scan-"));
const phaseDir = join(root, ".planning", "phases", "10-state-reconciliation-module");
mkdirSync(phaseDir, { recursive: true });
for (const filename of ["10-01-PLAN.md", "10-01-SUMMARY.md", "10-VERIFICATION.md", "10-REVIEW.md", "10-CONTEXT.md", "10-PLAN-CHECK.md"]) {
  writeFileSync(join(phaseDir, filename), `${filename}\n`, "utf8");
}

const scan = scanPlanningArtifacts(root);

expect(scan.blockers).toEqual([]);
expect(scan.totals).toEqual({ plans: 1, summaries: 1, verifications: 1, reviews: 1, contexts: 1, noncanonical: 1 });
```
Use temp dirs and injected deps; avoid mutating real Git worktrees.

**Fail-closed write pattern** (`tests/orchestrator-journal.test.ts`, lines 139-156):
```typescript
const cwd = mkdtempSync(join(tmpdir(), "pi-gsd-journal-"));
const journalPath = join(cwd, ".planning", "orchestration-state.json");
mkdirSync(join(cwd, ".planning"), { recursive: true });
writeFileSync(journalPath, "{ corrupt", "utf8");

const result = appendJournalEvent({ cwd, snapshot: snapshot(), event: { type: "pause", ts: "2026-06-01T00:00:00.000Z", phase: "09", status: "paused", attempt: 1 } });

expect(result.ok).toBe(false);
expect(readFileSync(journalPath, "utf8")).toBe("{ corrupt");
```
Test that invalid roots/leases return decisions and do not attempt unsafe recovery or branch checkout.

---

### `tests/orchestrator.test.ts` (test, event-driven)

**Analog:** existing file

**Pre-dispatch gate order test** (lines 35-53):
```typescript
const result = advanceOrchestration(snapshot, {
  gates: {
    reconcileBeforeDispatch: pass("reconcileBeforeDispatch", calls),
    decideDispatch: pass("decideDispatch", calls),
    validateToolContract: pass("validateToolContract", calls),
    prepareUnitRoot: pass("prepareUnitRoot", calls),
    persistRuntimeState: pass("persistRuntimeState", calls),
  },
  dispatch: () => ({ ok: true, messages: ["dispatched"] }),
  postDispatchGate: () => ({ ok: true, gate: "artifact", evidence: ["current-run-artifact"] }),
});

expect(result.ok).toBe(true);
expect(calls).toEqual(["reconcileBeforeDispatch", "decideDispatch", "validateToolContract", "prepareUnitRoot", "persistRuntimeState"]);
```
Keep this ordering while replacing the prepareUnitRoot seam.

**Retry budget test** (lines 55-75):
```typescript
const gate = () => ({ ok: false, gate: "prepareUnitRoot", reason: "gate-failed", retryable: true, resumeHint: "repair root" }) satisfies GateResult;

const first = advanceOrchestration(snapshot, { gates: { reconcileBeforeDispatch: passReconcile, prepareUnitRoot: gate } });
expect(first.snapshot?.status).toBe("running");
expect(first.snapshot?.attempt).toBe(1);

const third = advanceOrchestration(snapshot, { gates: { reconcileBeforeDispatch: passReconcile, prepareUnitRoot: gate } });
expect(third.ok).toBe(false);
expect(third.snapshot?.status).toBe("paused");
expect(third.snapshot?.lastEvent?.reason).toBe("retry-budget-exhausted");
```
Add cases for `recoveryDecision`, `exitReason`, action→retry behavior, and stop-class worktree invalid failures.

---

### `tests/orchestrator-journal.test.ts` (test, file-I/O)

**Analog:** existing file

**Redacted lifecycle persistence test** (lines 58-103):
```typescript
for (const type of eventTypes) {
  const result = appendJournalEvent({
    cwd,
    snapshot: snapshot(),
    event: {
      type,
      ts: "2026-06-01T00:00:00.000Z",
      phase: "09",
      unitId: "09:execute",
      status: "paused",
      attempt: 1,
      reason: "short reason",
      resumeHint: "resume",
      evidence: ["bounded evidence"],
      prompt: "raw prompt must not persist",
      userText: "raw user text must not persist",
      env: { SECRET: "nope" },
      token: "token-value",
      secret: "secret-value",
      args: ["unbounded"],
    },
  });
  expect(result.ok).toBe(true);
}

expect(JSON.stringify(journal.journal?.events)).not.toContain("raw prompt");
expect(JSON.stringify(journal.journal?.events)).not.toContain("SECRET");
```
Add recovery decision journal tests ensuring class/action/reasonCode/unitId/paths/branch/attempt/written are persisted, while raw errors/user text/secrets are removed.

## Shared Patterns

### NodeNext local imports
**Source:** `src/state-reconciliation/index.ts`, lines 1-8
**Apply to:** all new `src/recovery/*`, `src/worktree-safety/*`, and test imports from source.
```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import { classifyDrift } from "./catalog.js";
import { readJournalState } from "./journal.js";
import type { CanonicalPhaseArtifacts, PlanningArtifactTotals, ReconciliationOptions, ReconciliationReport } from "./types.js";
```

### Structured Result APIs, not prints or boundary throws
**Source:** `src/orchestrator/gates.ts`, lines 8-24; `src/state-reconciliation/index.ts`, lines 20-54
**Apply to:** recovery classifier, worktree safety, orchestrator gate adapters.
```typescript
if (!report.ok) return toGateFailure(toReconciliationFailedError(report), basePath);
return {
  ok: true,
  gate: "reconcileBeforeDispatch",
  evidence: ["native-state-reconciliation", `repairs:${report.repairs.length}`, `written:${report.written.length}`],
};
```

### Bounded/redacted evidence
**Source:** `src/orchestrator/journal.ts`, lines 38-42, 119-142; `src/orchestrator/reconciliation.ts`, lines 69-98
**Apply to:** `RecoveryDecision.evidence`, lease evidence, journal/status events, gate failures.
```typescript
const values = [
  `reason:${error.reasonCode}`,
  `suggestedNextAction:${error.suggestedNextAction}`,
  ...error.blockers.flatMap((blocker) => [
    `blocker:${blocker.reasonCode}`,
    ...blocker.evidence.flatMap((evidence) => evidenceToStrings(evidence, basePath)),
  ]),
];
return [...new Set(values.map(truncateEvidence))].slice(0, maxEvidenceItems);
```

### Table-driven tests with `satisfies`
**Source:** `tests/state-reconciliation.test.ts`, lines 42-56
**Apply to:** `tests/recovery.test.ts`, `tests/worktree-safety.test.ts`.
```typescript
const reasonCodes = [
  "sketch-flag-drift",
  "completion-timestamp-drift",
  "roadmap-divergence",
  "stale-worker",
  "unregistered-milestone",
  "summary-count-mismatch",
  "noncanonical-plan-like-file",
  "unknown-drift",
  "partial-write",
] satisfies ReconciliationReasonCode[];

expect(RECONCILIATION_REASON_CODES).toEqual(reasonCodes);
```

### Orchestrator failure event propagation
**Source:** `src/orchestrator/state-machine.ts`, lines 134-175
**Apply to:** all gate failures with `recoveryDecision`.
```typescript
const gateFailed: OrchestrationEvent = {
  type: "gate_failed",
  ts: timestamp(now),
  phase: snapshot.phase,
  unitId: unit.id,
  status: "failed",
  attempt: snapshot.attempt,
  reason,
  resumeHint: gate.resumeHint,
  evidence: gate.evidence,
};
```
Add `recoveryDecision` and `exitReason` to both `gate_failed` and resulting pause/stop/retry events.

## No Analog Found

None. Every planned file has either an exact in-repo analog or a strong local gsd-pi reference implementation.

## Metadata

**Analog search scope:** `src/**/*.ts`, `tests/**/*.test.ts`, `D:/Workstation/gsd-pi-fork/src/resources/extensions/gsd/{worktree-safety,recovery-classification}.ts`
**Files scanned:** 61 TypeScript source/test files plus 2 gsd-pi reference files
**Pattern extraction date:** 2026-06-02
