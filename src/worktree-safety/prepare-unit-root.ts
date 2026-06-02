import { resolve } from "node:path";
import { classifyFailure } from "../recovery/classify-failure.js";
import type { UnitType } from "../orchestrator/types.js";
import { defaultWorktreeSafetyDeps } from "./git.js";
import { checkLeaseOwnership } from "./lease.js";
import type { PrepareUnitRootInput, PrepareUnitRootOptions, PrepareUnitRootResult, WorktreeSafetyDeps } from "./types.js";

const SOURCE_WRITING_UNITS = {
  discuss: false,
  research: false,
  plan: false,
  "plan-check": false,
  execute: true,
  "code-review": false,
  verify: false,
  "ui-review": false,
  "security-review": false,
  "nyquist-validation": false,
  "ai-integration": false,
  "ui-safety-gate": false,
  closeout: false,
  "settings-gate": false,
  "pause-for-user": false,
} as const satisfies Record<UnitType, boolean>;

export function isSourceWritingUnit(unitType: UnitType): boolean {
  return SOURCE_WRITING_UNITS[unitType] === true;
}

export function resolveExpectedUnitRoot(input: PrepareUnitRootInput, deps: WorktreeSafetyDeps): string {
  return resolve(input.unitRoot ?? input.projectRoot ?? deps.cwd());
}

export function prepareUnitRoot(unitType: UnitType, unitId: string, options?: PrepareUnitRootOptions): PrepareUnitRootResult;
export function prepareUnitRoot(input: PrepareUnitRootInput): PrepareUnitRootResult;
export function prepareUnitRoot(unitTypeOrInput: UnitType | PrepareUnitRootInput, unitId?: string, options: PrepareUnitRootOptions = {}): PrepareUnitRootResult {
  const input: PrepareUnitRootInput = typeof unitTypeOrInput === "string" ? { ...options, unitType: unitTypeOrInput, unitId: unitId ?? `${options.phase ?? "unit"}:${unitTypeOrInput}` } : unitTypeOrInput;
  const deps = { ...defaultWorktreeSafetyDeps, ...input.deps } satisfies WorktreeSafetyDeps;
  const projectRoot = resolve(input.projectRoot ?? deps.env("GSD_PROJECT_ROOT") ?? deps.cwd());
  const root = resolveExpectedUnitRoot({ ...input, projectRoot }, deps);
  const branch = deps.currentBranch(root);

  if (!isSourceWritingUnit(input.unitType)) {
    return { ok: true, root, evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, messages: [`${input.unitType} does not require isolated source worktree validation`] } };
  }

  if (!deps.existsSync(`${root}/.git`)) {
    return fail("missing-git-marker", "Worktree root is missing a .git marker.", "Recover or recreate the expected Git root before dispatch.", input, root, branch);
  }

  const envRoot = deps.env("GSD_PROJECT_ROOT");
  if (envRoot && resolve(envRoot) !== projectRoot) {
    return fail("project-root-mismatch", "GSD_PROJECT_ROOT does not match the expected project root.", "Run from the expected project root or update GSD_PROJECT_ROOT before dispatch.", input, root, branch, { expectedProjectRoot: projectRoot, actualCwd: deps.cwd(), resolvedUnitRoot: root });
  }

  if (input.expectedBranch && branch !== input.expectedBranch) {
    return fail("branch-mismatch", "Current branch does not match the expected branch.", "Switch to the expected branch manually before dispatch; the orchestrator will not checkout branches.", input, root, branch, { expectedBranch: input.expectedBranch });
  }

  if (input.workflow?.worktrees === false) {
    return { ok: true, root, evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, messages: ["project-root validation passed; isolated lease skipped by workflow.worktrees=false"] } };
  }

  const lease = checkLeaseOwnership(input, root, branch, deps);
  if (!lease.ok) return lease;
  return { ok: true, root, evidence: { unitId: input.unitId, unitType: input.unitType, phase: input.phase, root, branch, journalEvents: lease.journalEvents, messages: lease.selfHealed ? ["stale lease reclaimed"] : ["worktree validation passed"] } };
}

function fail(reasonCode: string, message: string, remediation: string, input: PrepareUnitRootInput, root: string, branch: string | undefined, extra: Record<string, unknown> = {}): PrepareUnitRootResult {
  return {
    ok: false,
    decision: classifyFailure({
      kind: "worktree",
      reasonCode,
      class: "worktree-invalid",
      message,
      remediation,
      evidence: {
        unitId: input.unitId,
        unitType: input.unitType,
        phase: input.phase,
        root,
        branch,
        resolvedUnitRoot: root,
        actualCwd: input.deps?.cwd?.(),
        ...extra,
      },
    }),
  };
}
