# Orchestration Contract Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pi native orchestration derive queue, target, phase, and outcome contracts from generated upstream GSD workflow evidence plus a small Pi overlay, so upstream drift is caught at generate/doctor time and runtime fails closed instead of silently diverging.

**Architecture:** Add a new `orchestration-contract` module beside the existing `tool-contract` module. The compiler reads generated upstream workflow files and official config manifests, emits `generated/orchestration-contract.json`, then runtime modules consume that snapshot for `buildUnitQueue`, dispatch target validation, phase id validation, and post-dispatch outcome policy. Markdown extraction is generation-time only; runtime never reparses upstream Markdown.

**Tech Stack:** TypeScript, Node.js fs/path/crypto APIs, Vitest, existing `generate`, `doctor`, `tool-contract`, and `official-config` patterns.

---

## Engineering Estimate

This is **medium-sized**, not huge, because the repo already has most primitives: upstream package resolution, generated workflow copies, config manifests, tool-contract snapshots, doctor gates, and orchestrator tests.

Expected effort:
- **MVP drift detection only:** 0.5-1 day.
- **Good implementation, runtime consumes contract:** 2-3 focused days.
- **Full hardening with fixtures for future upstream drift:** 3-4 days.

Recommended scope: implement the good version in one phase, with five commits. Avoid waiting for upstream to expose a formal JSON orchestration API.

---

## File Structure

- Create `src/orchestration-contract/types.ts`
  - Owns `OrchestrationContractSnapshot`, `ChainUnitContract`, `OutcomeUnitContract`, `PhaseIdPolicy`, and failure/warning types.
- Create `src/orchestration-contract/snapshot.ts`
  - Owns stable hashing and `writeOrchestrationContractSnapshot`.
- Create `src/orchestration-contract/compile.ts`
  - Reads generated workflows and official manifests; extracts chain edges, phase policy, and outcome markers.
- Create `src/orchestration-contract/validate.ts`
  - Validates snapshot hash, required upstream evidence, and drift between generated workflows and snapshot.
- Create `src/orchestration-contract/index.ts`
  - Re-exports public contract helpers.
- Modify `src/generator.ts`
  - Writes `generated/orchestration-contract.json` after `generated/tool-contracts.json`.
- Modify `src/orchestrator/settings.ts`
  - Replaces hardcoded default queue with contract-driven `buildUnitQueue`.
- Modify `src/orchestrator/dispatch.ts`
  - Uses contract dispatch targets or validates existing targets against the orchestration contract.
- Modify `src/orchestrator/outcomes.ts`
  - Builds post-dispatch policy from contract status/marker definitions plus Pi overlay.
- Modify `src/orchestrator/gates.ts`
  - Passes all contract-required artifact paths to outcome evaluation, especially execute `SUMMARY.md` + `VERIFICATION.md`.
- Modify `src/orchestrator/phase.ts`
  - Replaces two-digit-only pattern with contract phase policy and upstream-compatible lexical safety.
- Modify `src/orchestrator/trigger.ts`
  - Uses the new phase validator and clearer integer/decimal error message.
- Modify `src/doctor.ts` or the existing doctor entrypoint module
  - Adds orchestration contract validation to doctor/check output.
- Modify `package.json`
  - Adds `generated/orchestration-contract.json` to published files.
- Modify tests:
  - `tests/orchestration-contract.test.ts`
  - `tests/orchestrator-settings.test.ts`
  - `tests/orchestrator.test.ts`
  - `tests/e2e/orchestrator-chain.test.ts`
  - `tests/tool-contract.test.ts`
  - `tests/doctor.test.ts`
  - `tests/cli.test.ts`

---

### Task 1: Add Orchestration Contract Types And Snapshot Hashing

**Files:**
- Create: `src/orchestration-contract/types.ts`
- Create: `src/orchestration-contract/snapshot.ts`
- Create: `src/orchestration-contract/index.ts`
- Test: `tests/orchestration-contract.test.ts`

- [ ] **Step 1: Write the failing snapshot hash test**

Add this test:

```ts
import { calculateOrchestrationContractHash } from "../src/orchestration-contract/index.js";
import type { OrchestrationContractSnapshot } from "../src/orchestration-contract/index.js";

describe("orchestration contract snapshot", () => {
  it("hashes snapshots with contractHash blanked", () => {
    const snapshot: OrchestrationContractSnapshot = {
      contractVersion: 1,
      contractHash: "will-be-ignored",
      officialPackage: "@opengsd/gsd-core",
      officialVersion: "1.2.0",
      generatedRoot: "generated",
      phaseIdPolicy: {
        lexicalPattern: "^\\d+(?:\\.\\d+)*$",
        examples: ["9", "09", "2.1", "02.1"],
        validationHint: "Use upstream roadmap.get-phase/find-phase for existence checks.",
      },
      chain: {
        defaultQueue: [
          { unitType: "discuss", argsByMode: { chain: "--chain", auto: "--auto" }, required: false, sourcePaths: ["generated/workflows/workflows/discuss-phase/modes/chain.md"] },
          { unitType: "plan", argsByMode: { chain: "--auto", auto: "--auto" }, required: true, sourcePaths: ["generated/workflows/workflows/plan-phase.md"] },
          { unitType: "execute", argsByMode: { chain: "--auto --no-transition", auto: "--auto --no-transition" }, required: true, sourcePaths: ["generated/workflows/workflows/plan-phase.md"] },
        ],
        standaloneStarts: {
          "gsd-discuss-phase": "discuss",
          "gsd-plan-phase": "plan",
          "gsd-execute-phase": "execute",
          "gsd-verify-work": "verify",
          "gsd-ship": "closeout",
        },
      },
      outcomes: {},
      piOverlay: {
        nativeOwnerEnv: "PI_GSD_NATIVE_CHAIN_OWNER",
        noNestedWorkflowDispatchWhenNativeOwner: true,
      },
    };

    const first = calculateOrchestrationContractHash(snapshot);
    const second = calculateOrchestrationContractHash({ ...snapshot, contractHash: first });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx vitest run tests/orchestration-contract.test.ts
```

Expected: fail because `src/orchestration-contract/index.ts` does not exist.

- [ ] **Step 3: Implement types and snapshot hashing**

Create `src/orchestration-contract/types.ts`:

```ts
import type { UnitType } from "../orchestrator/types.js";

export type ChainUnitContract = {
  unitType: UnitType;
  argsByMode: Partial<Record<"chain" | "auto", string>>;
  required: boolean;
  sourcePaths: string[];
};

export type PhaseIdPolicy = {
  lexicalPattern: string;
  examples: string[];
  validationHint: string;
};

export type OutcomeUnitContract = {
  artifactSuffixes: string[];
  passStatuses?: string[];
  pauseStatuses?: Record<string, string>;
  passMarkers?: string[];
  pauseMarkers?: Record<string, string>;
  requiredArtifacts?: string[];
  requireRecognizedOutcome?: boolean;
  sourcePaths: string[];
};

export type OrchestrationContractSnapshot = {
  contractVersion: 1;
  contractHash: string;
  officialPackage?: string;
  officialVersion?: string;
  generatedRoot: string;
  phaseIdPolicy: PhaseIdPolicy;
  chain: {
    defaultQueue: ChainUnitContract[];
    standaloneStarts: Partial<Record<"gsd-discuss-phase" | "gsd-plan-phase" | "gsd-execute-phase" | "gsd-verify-work" | "gsd-ship", UnitType>>;
  };
  outcomes: Partial<Record<UnitType, OutcomeUnitContract>>;
  piOverlay: {
    nativeOwnerEnv: "PI_GSD_NATIVE_CHAIN_OWNER";
    noNestedWorkflowDispatchWhenNativeOwner: boolean;
  };
};

export type OrchestrationContractFailure = {
  failedField: string;
  expected?: string;
  actual?: string;
  sourcePaths?: string[];
};

export type OrchestrationContractWarning = {
  field: string;
  expected?: string;
  actual?: string;
  sourcePaths?: string[];
};
```

Create `src/orchestration-contract/snapshot.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OrchestrationContractSnapshot } from "./types.js";

export function calculateOrchestrationContractHash(snapshot: OrchestrationContractSnapshot): string {
  return createHash("sha256")
    .update(stableStringify({ ...snapshot, contractHash: "" }), "utf8")
    .digest("hex");
}

export function writeOrchestrationContractSnapshot(snapshot: OrchestrationContractSnapshot, options: { cwd: string }) {
  const stamped = { ...snapshot, contractHash: calculateOrchestrationContractHash(snapshot) };
  const generatedDir = join(options.cwd, "generated");
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(join(generatedDir, "orchestration-contract.json"), JSON.stringify(stamped, null, 2), "utf8");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, sortValue(child)]));
}
```

Create `src/orchestration-contract/index.ts`:

```ts
export type {
  ChainUnitContract,
  OrchestrationContractFailure,
  OrchestrationContractSnapshot,
  OrchestrationContractWarning,
  OutcomeUnitContract,
  PhaseIdPolicy,
} from "./types.js";
export { calculateOrchestrationContractHash, writeOrchestrationContractSnapshot } from "./snapshot.js";
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```powershell
npx vitest run tests/orchestration-contract.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration-contract tests/orchestration-contract.test.ts
git commit -m "feat: add orchestration contract snapshot types"
```

---

### Task 2: Compile Contract From Generated Upstream Evidence

**Files:**
- Create: `src/orchestration-contract/compile.ts`
- Modify: `src/orchestration-contract/index.ts`
- Modify: `src/generator.ts`
- Modify: `package.json`
- Test: `tests/orchestration-contract.test.ts`

- [ ] **Step 1: Write failing compiler tests for upstream chain evidence**

Append:

```ts
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileOrchestrationContract, writeOrchestrationContractSnapshot } from "../src/orchestration-contract/index.js";

function writeGeneratedWorkflowFixture(root: string) {
  mkdirSync(join(root, "generated", "workflows", "workflows", "discuss-phase", "modes"), { recursive: true });
  mkdirSync(join(root, "generated", "workflows", "workflows"), { recursive: true });
  writeFileSync(join(root, "generated", "workflows", "workflows", "discuss-phase", "modes", "chain.md"), [
    "Skill(skill=\"gsd-plan-phase\", args=\"${PHASE} --auto ${GSD_WS}\")",
    "Auto-advance pipeline finished: discuss → plan → execute",
  ].join("\n"), "utf8");
  writeFileSync(join(root, "generated", "workflows", "workflows", "plan-phase.md"), [
    "Skill(skill=\"gsd-execute-phase\", args=\"${PHASE} --auto --no-transition ${GSD_WS}\")",
    "The `--no-transition` flag tells execute-phase to return status after verification.",
  ].join("\n"), "utf8");
  writeFileSync(join(root, "generated", "workflows", "workflows", "execute-phase.md"), [
    "## PHASE COMPLETE",
    "Verification: {Passed | Gaps Found}",
    "| `passed` | → update_roadmap |",
    "| `human_needed` | Persist and present human testing items |",
    "| `gaps_found` | Present gap summary |",
  ].join("\n"), "utf8");
}

it("compiles upstream chain and execute outcome contract", () => {
  const root = fixtureRoot();
  writeGeneratedWorkflowFixture(root);

  const snapshot = compileOrchestrationContract({
    cwd: root,
    officialPackage: "@opengsd/gsd-core",
    officialVersion: "1.2.0",
  });

  expect(snapshot.chain.defaultQueue.map((unit) => unit.unitType)).toEqual(["discuss", "plan", "execute"]);
  expect(snapshot.chain.defaultQueue.find((unit) => unit.unitType === "execute")?.argsByMode.chain).toBe("--auto --no-transition");
  expect(snapshot.outcomes.execute?.passStatuses).toEqual(expect.arrayContaining(["passed"]));
  expect(snapshot.outcomes.execute?.pauseStatuses).toEqual(expect.objectContaining({ gaps_found: expect.any(String), human_needed: expect.any(String) }));
  expect(snapshot.outcomes.execute?.passMarkers).toEqual(expect.arrayContaining(["phase_complete"]));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx vitest run tests/orchestration-contract.test.ts
```

Expected: fail because `compileOrchestrationContract` is not exported.

- [ ] **Step 3: Implement compiler with fail-closed evidence checks**

Create `src/orchestration-contract/compile.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { OrchestrationContractSnapshot, OutcomeUnitContract } from "./types.js";
import { calculateOrchestrationContractHash } from "./snapshot.js";

export function compileOrchestrationContract(options: { cwd: string; officialPackage?: string; officialVersion?: string }): OrchestrationContractSnapshot {
  const generatedRoot = join(options.cwd, "generated");
  const chainPath = "generated/workflows/workflows/discuss-phase/modes/chain.md";
  const planPath = "generated/workflows/workflows/plan-phase.md";
  const executePath = "generated/workflows/workflows/execute-phase.md";

  const chain = readRequired(options.cwd, chainPath);
  const plan = readRequired(options.cwd, planPath);
  const execute = readRequired(options.cwd, executePath);

  requireText(chain, /Skill\(skill="gsd-plan-phase", args="\$\{PHASE\} --auto\b/, chainPath, "discuss chain must launch plan --auto");
  requireText(plan, /Skill\(skill="gsd-execute-phase", args="\$\{PHASE\} --auto --no-transition\b/, planPath, "plan auto must launch execute --auto --no-transition");
  requireText(execute, /##\s*PHASE COMPLETE/i, executePath, "execute must emit PHASE COMPLETE");
  requireText(execute, /Verification:\s*\{?Passed\s*\|\s*Gaps Found\}?/i, executePath, "execute must report verification result");

  const executeOutcome: OutcomeUnitContract = {
    artifactSuffixes: ["SUMMARY.md", "VERIFICATION.md"],
    requiredArtifacts: ["SUMMARY.md", "VERIFICATION.md"],
    passStatuses: ["passed", "pass"],
    pauseStatuses: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion.",
    },
    passMarkers: ["phase_complete"],
    pauseMarkers: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion.",
      verification_failed: "Execution verification failed; inspect VERIFICATION.md before continuing.",
    },
    requireRecognizedOutcome: true,
    sourcePaths: [executePath],
  };

  const snapshot: OrchestrationContractSnapshot = {
    contractVersion: 1,
    contractHash: "",
    officialPackage: options.officialPackage,
    officialVersion: options.officialVersion,
    generatedRoot: relative(options.cwd, generatedRoot) || "generated",
    phaseIdPolicy: {
      lexicalPattern: "^\\d+(?:\\.\\d+)*$",
      examples: ["9", "09", "2.1", "02.1"],
      validationHint: "Use upstream roadmap.get-phase/find-phase for existence checks.",
    },
    chain: {
      defaultQueue: [
        { unitType: "discuss", argsByMode: { chain: "--chain", auto: "--auto" }, required: false, sourcePaths: [chainPath] },
        { unitType: "plan", argsByMode: { chain: "--auto", auto: "--auto" }, required: true, sourcePaths: [planPath] },
        { unitType: "execute", argsByMode: { chain: "--auto --no-transition", auto: "--auto --no-transition" }, required: true, sourcePaths: [planPath, executePath] },
      ],
      standaloneStarts: {
        "gsd-discuss-phase": "discuss",
        "gsd-plan-phase": "plan",
        "gsd-execute-phase": "execute",
        "gsd-verify-work": "verify",
        "gsd-ship": "closeout",
      },
    },
    outcomes: {
      discuss: { artifactSuffixes: ["CONTEXT.md"], sourcePaths: [chainPath] },
      plan: { artifactSuffixes: ["PLAN.md"], sourcePaths: [planPath] },
      execute: executeOutcome,
      verify: {
        artifactSuffixes: ["VERIFICATION.md"],
        passStatuses: ["passed", "pass"],
        pauseStatuses: {
          gaps_found: "Verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
          human_needed: "Phase verification requires human verification before closeout.",
        },
        requireRecognizedOutcome: true,
        sourcePaths: ["generated/workflows/workflows/verify-work.md"],
      },
    },
    piOverlay: {
      nativeOwnerEnv: "PI_GSD_NATIVE_CHAIN_OWNER",
      noNestedWorkflowDispatchWhenNativeOwner: true,
    },
  };
  snapshot.contractHash = calculateOrchestrationContractHash(snapshot);
  return snapshot;
}

function readRequired(cwd: string, path: string): string {
  const abs = join(cwd, path);
  if (!existsSync(abs)) throw new Error(`orchestration contract source missing: ${path}`);
  return readFileSync(abs, "utf8");
}

function requireText(content: string, pattern: RegExp, sourcePath: string, reason: string) {
  if (!pattern.test(content)) throw new Error(`orchestration contract drift in ${sourcePath}: ${reason}`);
}
```

Update `src/orchestration-contract/index.ts`:

```ts
export { compileOrchestrationContract } from "./compile.js";
```

- [ ] **Step 4: Wire generator to write the contract snapshot**

Modify `src/generator.ts` imports:

```ts
import { compileOrchestrationContract, writeOrchestrationContractSnapshot } from "./orchestration-contract/index.js";
```

In `generateAll`, after `writeToolContractSnapshot(...)`:

```ts
  const orchestrationSnapshot = compileOrchestrationContract({
    cwd: projectRoot,
    officialPackage: contractSnapshot.officialPackage,
    officialVersion: contractSnapshot.officialVersion,
  });
  writeOrchestrationContractSnapshot(orchestrationSnapshot, { cwd: projectRoot });
```

Update `package.json` `files`:

```json
"generated/orchestration-contract.json"
```

- [ ] **Step 5: Run generate and verify the snapshot exists**

Run:

```powershell
npm run build
npm run generate
Test-Path generated\orchestration-contract.json
```

Expected: `True`.

- [ ] **Step 6: Run tests and commit**

```powershell
npx vitest run tests/orchestration-contract.test.ts
git add src/orchestration-contract src/generator.ts package.json generated/orchestration-contract.json
git commit -m "feat: generate orchestration contract snapshot"
```

---

### Task 3: Add Contract Validation To Doctor And Runtime Gates

**Files:**
- Create: `src/orchestration-contract/validate.ts`
- Modify: `src/orchestration-contract/index.ts`
- Modify: existing doctor module that validates tool contracts
- Test: `tests/orchestration-contract.test.ts`
- Test: `tests/doctor.test.ts`

- [ ] **Step 1: Write failing validation test**

Append:

```ts
import { verifyOrchestrationContractSnapshot } from "../src/orchestration-contract/index.js";

it("fails validation when orchestration contract hash is tampered", () => {
  const root = fixtureRoot();
  writeGeneratedWorkflowFixture(root);
  const snapshot = compileOrchestrationContract({ cwd: root });
  writeOrchestrationContractSnapshot({ ...snapshot, contractHash: "bad-hash" }, { cwd: root });

  const result = verifyOrchestrationContractSnapshot({ cwd: root });

  expect(result.ok).toBe(false);
  expect(result.failures[0]).toMatchObject({ failedField: "contractHash" });
});
```

- [ ] **Step 2: Implement validation**

Create `src/orchestration-contract/validate.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateOrchestrationContractHash } from "./snapshot.js";
import type { OrchestrationContractFailure, OrchestrationContractSnapshot, OrchestrationContractWarning } from "./types.js";

export function readOrchestrationContractSnapshot(cwd: string): OrchestrationContractSnapshot | undefined {
  const path = join(cwd, "generated", "orchestration-contract.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as OrchestrationContractSnapshot;
  } catch {
    return undefined;
  }
}

export function verifyOrchestrationContractSnapshot(options: { cwd: string; snapshot?: OrchestrationContractSnapshot }): { ok: boolean; failures: OrchestrationContractFailure[]; warnings: OrchestrationContractWarning[]; snapshotPresent: boolean } {
  const snapshot = options.snapshot ?? readOrchestrationContractSnapshot(options.cwd);
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

  return { ok: failures.length === 0, failures, warnings: [], snapshotPresent: true };
}
```

Update `src/orchestration-contract/index.ts`:

```ts
export { readOrchestrationContractSnapshot, verifyOrchestrationContractSnapshot } from "./validate.js";
```

- [ ] **Step 3: Add doctor integration**

Find the existing doctor check that calls `verifyToolContractSnapshot`. Add:

```ts
const orchestration = verifyOrchestrationContractSnapshot({ cwd });
if (!orchestration.ok) {
  failures.push(...orchestration.failures.map((failure) => ({
    kind: "orchestration-contract",
    message: `${failure.failedField}: expected ${failure.expected ?? "(unknown)"}, got ${failure.actual ?? "(missing)"}`,
    sourcePaths: failure.sourcePaths ?? ["generated/orchestration-contract.json"],
  })));
}
```

Keep warning-only behavior for `snapshotPresent: false` in temporary fixtures that do not generate prompts.

- [ ] **Step 4: Run targeted tests**

```powershell
npx vitest run tests/orchestration-contract.test.ts tests/doctor.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration-contract tests/orchestration-contract.test.ts tests/doctor.test.ts
git commit -m "feat: validate orchestration contract drift"
```

---

### Task 4: Drive Native Queue From Contract

**Files:**
- Modify: `src/orchestrator/settings.ts`
- Modify: `src/orchestrator/types.ts`
- Test: `tests/orchestrator-settings.test.ts`
- Test: `tests/e2e/orchestrator-chain.test.ts`

- [ ] **Step 1: Update failing tests to upstream-aligned queue**

Change default chain expectations from:

```ts
["discuss", "research", "plan", "plan-check", "execute", "code-review", "verify", "closeout"]
```

to:

```ts
["discuss", "plan", "execute"]
```

Add explicit standalone tests:

```ts
it("allows explicit startAt verify as standalone UAT workflow", () => {
  const result = buildUnitQueue({ mode: "chain", phase: "09", startAt: "verify" });
  expect(result.units.map((unit) => unit.type)).toEqual(["verify"]);
});

it("allows explicit startAt closeout as standalone ship workflow", () => {
  const result = buildUnitQueue({ mode: "chain", phase: "09", startAt: "closeout" });
  expect(result.units.map((unit) => unit.type)).toEqual(["closeout"]);
});
```

- [ ] **Step 2: Run tests and verify red**

```powershell
npx vitest run tests/orchestrator-settings.test.ts tests/e2e/orchestrator-chain.test.ts
```

Expected: fail because runtime still enqueues local hardcoded units.

- [ ] **Step 3: Implement contract-backed queue builder**

In `src/orchestrator/settings.ts`, import:

```ts
import { readOrchestrationContractSnapshot } from "../orchestration-contract/index.js";
import type { ChainUnitContract } from "../orchestration-contract/index.js";
```

In `buildUnitQueue`, load snapshot:

```ts
  const orchestrationContract = readOrchestrationContractSnapshot(input.cwd ?? process.cwd());
  const queueContract = orchestrationContract?.chain.defaultQueue ?? fallbackDefaultQueue();
```

Replace local hardcoded default chain with:

```ts
  const units = queueContract
    .filter((entry) => entry.unitType !== "discuss" || !settings.workflow.skip_discuss)
    .map((entry) => unit(phase, entry.unitType, settings, {
      required: entry.required,
      source: "default",
      metadata: {
        args: entry.argsByMode[input.mode],
        contractSource: entry.sourcePaths.join(","),
      },
    }));
```

Add fallback:

```ts
function fallbackDefaultQueue(): ChainUnitContract[] {
  return [
    { unitType: "discuss", argsByMode: { chain: "--chain", auto: "--auto" }, required: false, sourcePaths: ["fallback"] },
    { unitType: "plan", argsByMode: { chain: "--auto", auto: "--auto" }, required: true, sourcePaths: ["fallback"] },
    { unitType: "execute", argsByMode: { chain: "--auto --no-transition", auto: "--auto --no-transition" }, required: true, sourcePaths: ["fallback"] },
  ];
}
```

Implement standalone start behavior:

```ts
function standaloneUnitEnabled(type: UnitType, settings: ResolvedWorkflowSettings): boolean {
  if (type === "verify") return settings.workflow.verifier;
  if (type === "closeout") return true;
  if (type === "code-review") return settings.workflow.code_review;
  if (type === "research") return settings.workflow.research;
  if (type === "plan-check") return Boolean(settings.workflow.plan_review_convergence);
  return true;
}
```

When `input.startAt` exists and is not in the default queue, return `[unit(phase, input.startAt, ...)]` only if `standaloneUnitEnabled(...)` is true.

- [ ] **Step 4: Run targeted tests**

```powershell
npx vitest run tests/orchestrator-settings.test.ts tests/e2e/orchestrator-chain.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/orchestrator/settings.ts src/orchestrator/types.ts tests/orchestrator-settings.test.ts tests/e2e/orchestrator-chain.test.ts
git commit -m "feat: build native chain from orchestration contract"
```

---

### Task 5: Drive Execute Outcome Gate From Contract

**Files:**
- Modify: `src/orchestrator/outcomes.ts`
- Modify: `src/orchestrator/gates.ts`
- Modify: `src/orchestrator/dispatch.ts`
- Test: `tests/orchestrator.test.ts`
- Test: `tests/e2e/orchestrator-chain.test.ts`

- [ ] **Step 1: Write failing execute gap tests**

Add tests covering:

```ts
it("does not complete execute when only SUMMARY.md is written", () => {
  // Dispatch writes SUMMARY.md but not VERIFICATION.md and no recognized outcome.
  // Expected: paused/failed at execute with "recognized completion outcome" evidence.
});

it("pauses at execute when VERIFICATION.md reports gaps_found", () => {
  // Dispatch writes SUMMARY.md and VERIFICATION.md with frontmatter status: gaps_found.
  // Expected: currentUnit.type === "execute"; no verify or closeout unit dispatched.
});

it("accepts upstream plain text PHASE COMPLETE with Verification Passed", () => {
  // Dispatch stdout includes:
  // ## PHASE COMPLETE
  // Verification: Passed
  // Expected: execute accepted.
});
```

- [ ] **Step 2: Run tests and verify red**

```powershell
npx vitest run tests/orchestrator.test.ts tests/e2e/orchestrator-chain.test.ts
```

Expected: fail because execute still only requires `SUMMARY.md`.

- [ ] **Step 3: Support multiple artifact paths in outcomes**

Change `OutcomePolicyInput`:

```ts
artifactPaths?: string[];
```

In `collectSignals`, parse all artifact paths:

```ts
for (const artifactPath of input.artifactPaths ?? []) {
  evidence.push(`artifact:${artifactPath}`);
  const parsed = splitFrontmatter(readFileSync(artifactPath, "utf8"));
  for (const [key, value] of Object.entries(parsed.data)) addField(key, value);
  for (const [key, value] of knownFields(parsed.body)) addField(key, value);
  for (const marker of knownMarkers(parsed.body)) addMarker(marker);
}
```

Add field parsing:

```ts
function knownFields(text: string): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(Verification|Status|Outcome|Verdict):\s*(.+?)\s*$/i);
    if (match) fields.push([match[1], match[2]]);
  }
  return fields;
}
```

Map `verification`, `verdict`, `outcome`, and `status` to statuses.

- [ ] **Step 4: Make execute require contract-recognized verification**

Either generate `POST_DISPATCH_POLICIES.execute` from the contract, or update static fallback to match the contract:

```ts
execute: {
  artifactSuffixes: ["SUMMARY.md", "VERIFICATION.md"],
  requiredArtifacts: ["SUMMARY.md", "VERIFICATION.md"],
  passStatuses: ["passed", "pass"],
  pauseStatuses: {
    gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
    human_needed: "Execution verification requires human verification before phase completion.",
  },
  passMarkers: ["phase_complete"],
  pauseMarkers: {
    gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
    human_needed: "Execution verification requires human verification before phase completion.",
    verification_failed: "Execution verification failed; inspect VERIFICATION.md before continuing.",
  },
  requireRecognizedOutcome: true,
}
```

- [ ] **Step 5: Make gate pass all required artifacts**

In `runPostDispatchGate`, for policies with multiple suffixes:

```ts
const artifactPaths = policy.artifactSuffixes?.map((suffix) =>
  findMatchingArtifact(cwd, phaseDir, unit.phase, suffix, exists, options.written)
);
if (policy.requiredArtifacts?.length && artifactPaths?.some((path) => !path)) {
  return fail(`${unit.label} Unit did not produce required verification artifacts.`, policy.requiredArtifacts.map((suffix) => `missing:${unit.phase}-*-${suffix}`));
}
```

- [ ] **Step 6: Parse upstream plain text dispatch output**

In `src/orchestrator/dispatch.ts`, after JSON parse fallback:

```ts
function parsePlainTextOutcome(output: string): OrchestrationOutcome | undefined {
  const markers: string[] = [];
  if (/##\s*PHASE COMPLETE/i.test(output)) markers.push("phase_complete");
  if (/GAPS FOUND/i.test(output)) return { status: "gaps_found", marker: markers[0] };
  if (/HUMAN NEEDED/i.test(output)) return { status: "human_needed", marker: markers[0] };
  const verification = output.match(/^\s*Verification:\s*(Passed|Gaps Found)\s*$/im);
  if (verification?.[1]?.toLowerCase() === "passed") return { status: "passed", marker: markers[0] };
  if (verification?.[1]?.toLowerCase() === "gaps found") return { status: "gaps_found", marker: markers[0] };
  return markers[0] ? { marker: markers[0] } : undefined;
}
```

- [ ] **Step 7: Run tests and commit**

```powershell
npx vitest run tests/orchestrator.test.ts tests/e2e/orchestrator-chain.test.ts
git add src/orchestrator/outcomes.ts src/orchestrator/gates.ts src/orchestrator/dispatch.ts tests/orchestrator.test.ts tests/e2e/orchestrator-chain.test.ts
git commit -m "feat: gate execute on upstream verification outcome"
```

---

### Task 6: Replace Hardcoded Phase Regex With Contract Policy

**Files:**
- Modify: `src/orchestrator/phase.ts`
- Modify: `src/orchestrator/trigger.ts`
- Test: `tests/orchestrator.test.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write failing phase tests**

Add:

```ts
expect(detectNativeAutoTrigger("/gsd-discuss-phase 2.1 --chain")).toEqual(expect.objectContaining({
  command: "gsd-discuss-phase",
  phase: "2.1",
  mode: "chain",
}));
```

Add CLI invalid path traversal case:

```ts
expect(runCli(["orchestrate", "--chain", "--phase", "../../x"])).toFailWith("Invalid phase");
```

- [ ] **Step 2: Run tests and verify red**

```powershell
npx vitest run tests/orchestrator.test.ts tests/cli.test.ts
```

Expected: `2.1` fails while traversal remains rejected.

- [ ] **Step 3: Implement lexical safety based on contract policy**

In `src/orchestrator/phase.ts`:

```ts
import { readOrchestrationContractSnapshot } from "../orchestration-contract/index.js";

const FALLBACK_PHASE_ID_PATTERN = /^\d+(?:\.\d+)*$/;

export function isValidPhaseId(phase: string, options: { cwd?: string } = {}): boolean {
  const snapshot = options.cwd ? readOrchestrationContractSnapshot(options.cwd) : undefined;
  const pattern = snapshot?.phaseIdPolicy.lexicalPattern
    ? new RegExp(snapshot.phaseIdPolicy.lexicalPattern)
    : FALLBACK_PHASE_ID_PATTERN;
  return pattern.test(phase);
}
```

Keep this lexical-only. Do not call upstream `gsd-tools.cjs` from trigger detection; existence validation remains inside actual workflow init.

- [ ] **Step 4: Update trigger error text**

In `src/orchestrator/trigger.ts`:

```ts
if (!isValidPhaseId(trigger.phase, { cwd: options.cwd })) {
  return { ok: false, messages: ["Invalid phase; expected integer or decimal phase id such as 9 or 2.1"], status: { status: "idle", remainingUnits: [], attempt: 0 } };
}
```

- [ ] **Step 5: Run tests and commit**

```powershell
npx vitest run tests/orchestrator.test.ts tests/cli.test.ts
git add src/orchestrator/phase.ts src/orchestrator/trigger.ts tests/orchestrator.test.ts tests/cli.test.ts
git commit -m "feat: align native phase ids with upstream policy"
```

---

### Task 7: Add Native Owner Boundary To Generated Workflow Dispatch

**Files:**
- Modify: `src/prompt-transform.ts`
- Test: `tests/prompt-transform.test.ts`
- Test: `tests/e2e/workflow-fidelity.test.ts`

- [ ] **Step 1: Write failing prompt ownership test**

Assert transformed `Skill(skill="gsd-execute-phase", args="${PHASE} --auto --no-transition")` contains:

```text
If PI_GSD_NATIVE_CHAIN_OWNER is set, return control to the native orchestrator
```

and still contains the manual fallback:

```text
otherwise Invoke /gsd-execute-phase
```

- [ ] **Step 2: Run tests and verify red**

```powershell
npx vitest run tests/prompt-transform.test.ts tests/e2e/workflow-fidelity.test.ts
```

- [ ] **Step 3: Implement transform guard**

In the workflow Skill transform branch:

```ts
return `If PI_GSD_NATIVE_CHAIN_OWNER is set, return control to the native orchestrator for ${slashCommand}; otherwise Invoke ${slashCommand} in Pi${argsText}.`;
```

Keep non-workflow command prompt transform behavior unchanged.

- [ ] **Step 4: Run tests and commit**

```powershell
npx vitest run tests/prompt-transform.test.ts tests/e2e/workflow-fidelity.test.ts
git add src/prompt-transform.ts tests/prompt-transform.test.ts tests/e2e/workflow-fidelity.test.ts
git commit -m "feat: guard native chain workflow ownership"
```

---

### Task 8: Full Regeneration And Regression Verification

**Files:**
- Generated: `generated/orchestration-contract.json`
- Generated: changed `generated/prompts/**`, `generated/workflows/**`, and `generated/tool-contracts.json` only if actual content changes
- Generated: `dist/**`

- [ ] **Step 1: Run full generation pipeline**

```powershell
npm run typecheck
npm test
npm run build
npm run generate
```

Expected:
- typecheck passes
- tests pass
- build passes
- generated orchestration contract exists

- [ ] **Step 2: Run doctor**

```powershell
node dist/cli.js doctor --prompts generated/prompts --workflows generated/workflows --cwd .
```

Expected:
- tool contract OK
- orchestration contract OK
- no chain drift warnings

- [ ] **Step 3: Run final check**

```powershell
npm run check
```

Expected: pass.

- [ ] **Step 4: Inspect git diff**

```powershell
git diff --name-only
git status --short
```

Expected:
- no unexpected generated mass churn
- only source/tests/generated contract/dist files required by this plan

- [ ] **Step 5: Commit**

```powershell
git add src tests generated package.json dist
git commit -m "feat: sync native orchestration with upstream contract"
```

---

## Self-Review

**Spec coverage:** Covers queue, Unit mapping, gate/outcome contract, phase regex, prompt ownership, generated/doctor drift detection, and tests that currently encode drift.

**Placeholder scan:** No implementation task is left as "TBD" or "write tests" without exact target tests and command evidence.

**Type consistency:** Use `OrchestrationContractSnapshot`, `ChainUnitContract`, `OutcomeUnitContract`, `PhaseIdPolicy`, `calculateOrchestrationContractHash`, `compileOrchestrationContract`, `verifyOrchestrationContractSnapshot`, and `readOrchestrationContractSnapshot` consistently across tasks.

**Risk note:** Do not let runtime parse upstream Markdown dynamically. Markdown parsing belongs only in `compileOrchestrationContract`; runtime consumes a stable JSON snapshot and fails closed when it is stale.
