# Phase 09: Auto Orchestration Native Module - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 17
**Analogs found:** 17 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/orchestrator/index.ts` | service facade | request-response | `src/doctor.ts` | role-match |
| `src/orchestrator/types.ts` | model/types | transform | `src/doctor.ts` | role-match |
| `src/orchestrator/state-machine.ts` | service | event-driven | `src/prompt-transform.ts` | partial (pure function style) |
| `src/orchestrator/settings.ts` | service/config | request-response | `src/official.ts` | partial (resolver/validation) |
| `src/orchestrator/journal.ts` | service | file-I/O + event-driven | `src/agent-sync.ts` | role-match |
| `src/orchestrator/gates.ts` | service/utility | request-response | `src/doctor.ts` | role-match |
| `src/orchestrator/dispatch.ts` | service/adapter | request-response | `src/cli.ts` | role-match |
| `src/cli.ts` | entry/config | request-response | `src/cli.ts` | exact |
| `src/index.ts` | config/barrel | transform | `src/index.ts` | exact |
| `src/prompt-transform.ts` | pure transform | transform | `src/prompt-transform.ts` | exact |
| `tests/orchestrator.test.ts` | test | event-driven | `tests/agent-sync.test.ts` | role-match |
| `tests/orchestrator-settings.test.ts` | test | request-response | `tests/cli.test.ts` | role-match |
| `tests/orchestrator-journal.test.ts` | test | file-I/O | `tests/agent-sync.test.ts` | exact |
| `tests/e2e/orchestrator-chain.test.ts` | test | request-response | `tests/cli.test.ts` | role-match |
| `tests/prompt-transform.test.ts` | test | transform | `tests/prompt-transform.test.ts` | exact |
| `src/orchestrator/state-digest.ts` | service/adapter | file-I/O + request-response | `src/cli.ts` | partial (gsd-tools passthrough) |
| `src/orchestrator/reconciliation.ts` | service/utility | request-response | `src/doctor.ts` | partial (check result seam) |

## Pattern Assignments

### `src/orchestrator/index.ts` (service facade, request-response)

**Analog:** `src/doctor.ts`

**Imports pattern** (lines 1-9):
```typescript
import { accessSync, constants as fsConstants, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { generateAgents } from "./agent-generator.js";
import { syncAgents, type AgentSyncScope } from "./agent-sync.js";
import { buildPiSubagentsTempRoot, TEMP_DIR_SUBDIRS } from "./extension.js";
import { generatePrompts, generateWorkflows } from "./generator.js";
import { resolveOfficialPackage } from "./official.js";
import { resolvePiSubagentsPackage } from "./pi-subagents.js";
```
Copy the `.js` local import suffix and type-only import style.

**Service result pattern** (lines 24-39):
```typescript
export type DoctorOptions = {
  startDir?: string;
  generatedPromptsDir: string;
  generatedAgentsDir?: string;
  generatedWorkflowsDir?: string;
  agentSyncScope?: AgentSyncScope;
  piSubagentsResolver?: typeof resolvePiSubagentsPackage;
  /** Override ACL checker (for testing) — defaults to checkPiSubagentsTempAcl */
  aclChecker?: () => AclCheckResult;
  /** Override rpiv resolver (for testing) — defaults to resolveRpivPackage */
  rpivResolver?: typeof resolveRpivPackage;
};

export type DoctorResult = {
  ok: boolean;
  messages: string[];
};
```
Use dependency injection in orchestrator options for settings, dispatch, journal, gates, clock, and filesystem checks.

**Core service pattern** (lines 96-103, 177-180):
```typescript
export function runDoctor(options: DoctorOptions): DoctorResult {
  const officialPackage = resolveOfficialPackage({ startDir: options.startDir });
  const messages = [
    `official package: ${officialPackage.packageName}@${officialPackage.version}`,
    `official root: ${officialPackage.packageRoot}`,
  ];
  let ok = true;
  try {
    // ...
    messages.push("tip: set GSD_AUDIT=1 to enable dispatch trace at .planning/.gsd-trace.jsonl");
    return { ok, messages };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
```
Return structured results; do not print in service code.

---

### `src/orchestrator/types.ts` (model/types, transform)

**Analog:** `src/doctor.ts`

**Type export pattern** (lines 12-21, 37-40):
```typescript
export type AclCheckResult = {
  ok: boolean;
  messages: string[];
};

export type DoctorResult = {
  ok: boolean;
  messages: string[];
};
```
Use simple exported object types and discriminated unions for Unit, event, snapshot, gate result, pause reason, and status.

**Gate result shape to copy from checks** (lines 48-58, 93):
```typescript
export function checkPiSubagentsTempAcl(options?: AclCheckOptions): AclCheckResult {
  const messages: string[] = [];
  let ok = true;
  try {
    const fsImpl = options?.fs ?? { accessSync };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();

    for (const subdir of TEMP_DIR_SUBDIRS) {
      const dirPath = join(tempRoot, subdir);
      try {
        fsImpl.accessSync(dirPath, fsConstants.R_OK | fsConstants.W_OK);
      } catch (accessError: unknown) {
        // ...
      }
    }
  }
  return { ok, messages };
}
```
For gates, prefer `{ ok: true; evidence: string[] } | { ok: false; reason: string; retryable: boolean; resumeHint: string }` over thrown errors.

---

### `src/orchestrator/state-machine.ts` (service, event-driven)

**Analog:** `src/prompt-transform.ts`

**Pure function pattern** (lines 89-105):
```typescript
export function splitCodeFences(text: string): { segment: string; isCode: boolean }[] {
  const parts: { segment: string; isCode: boolean }[] = [];
  const regex = /(`{3}[\s\S]*?`{3})/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ segment: text.slice(lastIdx, match.index), isCode: false });
    }
    parts.push({ segment: match[1], isCode: true });
    lastIdx = regex.lastIndex;
  }
  // ...
  return parts;
}
```
State transitions should be pure where possible: input snapshot + event/result → next snapshot + events.

**Idempotent transform/result pattern** (lines 792-809, 840-842):
```typescript
export function transformWorkflowCodeFences(input: string): string {
  const KNOWN_PATTERNS = [
    /Skill\(skill=["']/,
    /Skill\(skill=\\"/,
    /AskUserQuestion\s*\(/,
    /\bAgent\(subagent_type=/,
    /subagent_type="general-purpose"/,
  ];

  const segments = splitCodeFences(input);
  let changed = false;

  const result = segments.map(({ segment, isCode }) => {
    if (!isCode) return segment;
    const hasKnownPattern = KNOWN_PATTERNS.some((p) => p.test(segment));
    if (!hasKnownPattern) return segment;
    // ...
  }).join("");

  return changed ? result : input;
}
```
For queue construction and advance, only emit changes/events when transition conditions match; otherwise return the existing snapshot/status.

---

### `src/orchestrator/settings.ts` (service/config, request-response)

**Analog:** `src/official.ts`

**Resolver imports and error class pattern** (lines 1-23):
```typescript
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const OFFICIAL_PACKAGE_NAME = "@opengsd/gsd-core";

export class OfficialPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialPackageError";
  }
}
```
Define a specific `OrchestratorSettingsError` for invalid config/default resolution.

**Validation pattern** (lines 31-63):
```typescript
export function resolveOfficialPackage(options: { startDir?: string; packageName?: string } = {}): OfficialPackage {
  const startDir = options.startDir ?? process.cwd();
  const packageName = options.packageName ?? OFFICIAL_PACKAGE_NAME;

  if (!existsSync(startDir)) {
    throw missingOfficialPackageError(startDir, packageName);
  }

  const require = createRequire(import.meta.url);
  let packageJsonPath: string;

  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [startDir] });
  } catch {
    try {
      packageJsonPath = require.resolve(`${packageName}/package.json`);
    } catch {
      throw missingOfficialPackageError(startDir, packageName);
    }
  }
  // ... validate paths, return typed result
}
```
Settings resolver should normalize `.planning/config.json` plus upstream defaults into a typed `ResolvedWorkflowSettings` and throw/return invalid-setting details early.

---

### `src/orchestrator/journal.ts` (service, file-I/O + event-driven)

**Analog:** `src/agent-sync.ts`

**File I/O imports and result pattern** (lines 1-21):
```typescript
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type SyncAgentsResult = {
  ok: boolean;
  messages: string[];
  written: string[];
};
```
Journal writes should return `{ ok, messages, written }` or a typed snapshot result.

**Safe write/check/dry-run pattern** (lines 25-35, 61-64, 82):
```typescript
export function syncAgents(options: SyncAgentsOptions): SyncAgentsResult {
  const generatedAgentsDir = resolve(options.generatedAgentsDir);
  const targetDir = resolveAgentTargetDir(options.cwd, options.scope);
  const messages: string[] = [];
  const written: string[] = [];
  let ok = true;

  const fileNames = readGeneratedAgentFileNames(generatedAgentsDir);
  const generatedFileNames = new Set(fileNames);
  if (!options.check && !options.dryRun) {
    mkdirSync(targetDir, { recursive: true });
  }

  // ...
  if (!options.dryRun) {
    writeFileSync(targetPath, expected, "utf8");
    written.push(targetPath);
  }

  return { ok, messages, written };
}
```
For journal persistence: resolve the `.planning` path, create parent directory, write snapshot atomically where practical, append event history, and record written paths.

**Ownership/safety pattern** (lines 44-47):
```typescript
if (existing !== undefined && !isGeneratedSyncedAgent(existing)) {
  ok = false;
  messages.push(`refusing to overwrite unowned agent: ${targetPath}`);
  continue;
}
```
Adapt this mindset to refuse journal writes outside `.planning/` or with invalid phase IDs.

---

### `src/orchestrator/gates.ts` (service/utility, request-response)

**Analog:** `src/doctor.ts`

**Never-throw check pattern** (lines 48-93):
```typescript
export function checkPiSubagentsTempAcl(options?: AclCheckOptions): AclCheckResult {
  const messages: string[] = [];
  let ok = true;
  try {
    const fsImpl = options?.fs ?? { accessSync };
    const tempRoot = options?.tempRoot ?? buildPiSubagentsTempRoot();
    // nested per-item try/catch
  } catch (error: unknown) {
    ok = false;
    messages.push(
      `pi-subagents temp ACL: check failed (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  return { ok, messages };
}
```
Artifact gates and Phase 10/11/12 seams should convert filesystem/adapter exceptions into gate failures with resume hints.

**Generated artifact comparison pattern** (lines 184-223):
```typescript
function compareGeneratedFiles(options: { expectedPaths: string[]; expectedDir?: string; actualDir: string; label: string; messages: string[] }) {
  const expectedFileNames = new Set(options.expectedPaths.map((expectedPath) => expectedResourceName(expectedPath, options.expectedDir)));
  let ok = true;

  for (const expectedPath of options.expectedPaths) {
    const fileName = expectedResourceName(expectedPath, options.expectedDir);
    const actualPath = join(options.actualDir, fileName);
    let actual: string;

    try {
      actual = readFileSync(actualPath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        ok = false;
        options.messages.push(`missing generated ${options.label}: ${fileName}`);
        continue;
      }
      throw error;
    }
    // ...
  }
}
```
Use the same missing-file detection style for CONTEXT/PLAN/SUMMARY/verification artifacts.

---

### `src/orchestrator/dispatch.ts` (service/adapter, request-response)

**Analog:** `src/cli.ts`

**Child process adapter pattern** (lines 104-132):
```typescript
if (command === "official") {
  const parsed = parseOfficialArgs(args);
  const cwd = resolve(parsed.cwd ?? process.cwd());
  const officialPackage = resolveOfficialPackage({ startDir: cwd });
  const child =
    io === defaultIO
      ? spawnSync(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
          cwd,
          stdio: "inherit",
        })
      : spawnSync(process.execPath, [officialPackage.paths.gsdTools, ...parsed.passthrough], {
          cwd,
          encoding: "utf8",
          stdio: "pipe",
        });

  if (child.stdout) {
    io.stdout(child.stdout.toString());
  }

  if (child.stderr) {
    io.stderr(child.stderr.toString());
  }

  if (child.error) {
    throw child.error;
  }

  return child.status ?? 1;
}
```
Production dispatch should be behind an interface. For gsd-tools-backed state/config calls, use `resolveOfficialPackage().paths.gsdTools`. For `GSD_AUDIT=1`, set it only in the child environment for orchestrator-owned dispatch.

**Argument parsing pattern** (lines 222-248):
```typescript
function parseOfficialArgs(args: string[]) {
  const markerIndex = args.indexOf("--");
  const optionArgs = markerIndex === -1 ? args : args.slice(0, markerIndex);
  const passthrough = markerIndex === -1 ? [] : args.slice(markerIndex + 1);
  let cwd: string | undefined;
  // ... validate --cwd and marker use
  return { cwd, passthrough };
}
```
Use explicit parsing for any new `orchestrate`/`auto` CLI command rather than reading `process.env.ARGUMENTS`.

---

### `src/cli.ts` (entry/config, request-response)

**Analog:** `src/cli.ts`

**Command branch pattern** (lines 34-44, 78-82, 146-150):
```typescript
export async function runCli(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    const [command, ...args] = argv;

    if (command === "generate") {
      const options = parseOptions(args, { out: true, prompts: true, agents: true, cwd: true });
      const cwd = resolve(options.cwd ?? process.cwd());
      const officialPackage = resolveOfficialPackage({ startDir: cwd });
      if (options.out) {
        const result = generatePrompts({ officialRoot: officialPackage.packageRoot, outDir: resolve(cwd, options.out), safeRoot: cwd });
        io.stdout(`generated ${result.written.length} prompt(s)\n`);
        return 0;
      }
    }
    // ...
    io.stderr(usage);
    return 2;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
```
Add any orchestrator command as a thin entry branch: parse options, call service, print messages/status, map `ok` to exit code.

---

### `src/index.ts` (config/barrel, transform)

**Analog:** `src/index.ts`

**Barrel export pattern** (lines 1-11):
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
export * from "./postinstall.js";
```
If orchestrator is public API, add `export * from "./orchestrator/index.js";`.

---

### `src/prompt-transform.ts` (pure transform, transform)

**Analog:** `src/prompt-transform.ts`

**Current no-op removal target** (lines 856-895):
```typescript
const AUTO_MODE_CHECKLIST_TAG_START = "<pi_auto_mode_fidelity>";
const AUTO_MODE_CHECKLIST_TAG_END = "</pi_auto_mode_fidelity>";
const AUTO_MODE_CHECKLIST_MARKER = AUTO_MODE_CHECKLIST_TAG_START;

const AUTO_MODE_CHECKLIST = `
// ... checklist body ...
`;

export function injectAutoModeChecklist(input: string, _fileName: string): string {
  // REMOVED: injectAutoModeChecklist was adding behavioral content
  // to upstream workflow files, which exceeds the scope of a Pi adapter/wrapper.
  // The adapter should only transform syntax for Pi runtime compatibility,
  // not modify workflow behavioral logic.
  // See: https://github.com/open-gsd/gsd-core/issues/507
  return input;
}
```
Phase 9 should delete the dead constants/function if no imports remain, and update tests to assert no `<pi_auto_mode_fidelity>` appears in generated output.

**Transform convention** (lines 46-49, 125-134):
```typescript
export function addPiSubagentGuidance(input: string): string {
  if (input.includes("<pi_subagents_runtime_note>")) return input;
  if (!mentionsSubagentDelegation(input)) return input;
  return `${piSubagentGuidance}${input}`;
}

export function transformAskUserQuestionForPi(input: string): string {
  const segments = splitCodeFences(input);
  let changed = false;
  const result = segments.map(({ segment, isCode }) => {
    if (isCode) return segment;
    const transformed = rewriteAskUserQuestionInSegment(segment);
    if (transformed !== segment) changed = true;
    return transformed;
  }).join("");

  return changed ? result : input;
}
```
Pure transforms remain side-effect free; do not add `fs/path/os` here.

---

### `tests/orchestrator.test.ts` (test, event-driven)

**Analog:** `tests/agent-sync.test.ts`

**Vitest globals + temp fixture style** (lines 1-17):
```typescript
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncAgents } from "../src/agent-sync.js";

describe("syncAgents", () => {
  it("writes materialized generated agents into project .pi/agents", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
    const generatedDir = join(root, "generated", "agents");
    mkdirSync(generatedDir, { recursive: true });
```
Use globals (`describe`, `it`, `expect`) without importing from `vitest`. Inject fake dependencies to test queue building, gate order, pause/retry, resume, and status without real subagents.

**Assertions pattern** (lines 18-24):
```typescript
const result = syncAgents({
  generatedAgentsDir: generatedDir,
  cwd: root,
  officialRoot: "C:\\repo\\node_modules\\@opengsd\\gsd-core",
  scope: "project",
});

const target = join(root, ".pi", "agents", "gsd-planner.md");
expect(result.ok).toBe(true);
expect(result.written).toEqual([target]);
```
Assert exact event sequences and status snapshots.

---

### `tests/orchestrator-settings.test.ts` (test, request-response)

**Analog:** `tests/cli.test.ts`

**Fixture + command invocation pattern** (lines 9-22):
```typescript
describe("runCli", () => {
  it("generates prompts into the requested directory", async () => {
    const fixture = createOfficialFixture();
    writePlanCommand(fixture.packageRoot);
    const outDir = join(fixture.root, "out-prompts");
    const stdout: string[] = [];

    const code = await runCli(["generate", "--out", outDir, "--cwd", fixture.root], {
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
```
Create config fixtures with `.planning/config.json` and assert `ResolvedWorkflowSettings`/Unit queue for toggles such as `workflow.research`, `plan_check`, `verifier`, `ui_phase`, `code_review`, `node_repair`.

---

### `tests/orchestrator-journal.test.ts` (test, file-I/O)

**Analog:** `tests/agent-sync.test.ts`

**File write/read verification pattern** (lines 40-54):
```typescript
const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
const generatedDir = join(root, "generated", "agents");
mkdirSync(generatedDir, { recursive: true });
writeFileSync(join(generatedDir, "gsd-planner.md"), "---\nname: gsd-planner\ndescription: Plans\n---\nBody\n", "utf8");

const result = syncAgents({ generatedAgentsDir: generatedDir, cwd: root, officialRoot: root, scope: "project" });

const targetContent = readFileSync(join(root, ".pi", "agents", "gsd-planner.md"), "utf8");
expect(result.ok).toBe(true);
expect(targetContent.startsWith("---\n")).toBe(true);
```
Journal tests should write a snapshot + events, read them back, and assert resume chooses latest unfinished Unit.

---

### `tests/e2e/orchestrator-chain.test.ts` (test, request-response)

**Analog:** `tests/cli.test.ts`

**Built CLI/e2e pattern** (lines 260-274):
```typescript
it("executes the built cli entrypoint directly", async () => {
  const fixture = createOfficialFixture();
  writePlanCommand(fixture.packageRoot);
  const output = join(fixture.root, "direct-output");
  mkdirSync(output, { recursive: true });

  ensureBuiltCli();
  const child = spawnSync(process.execPath, ["dist/cli.js", "generate", "--out", output, "--cwd", fixture.root], {
    encoding: "utf8",
  });

  expect(child.status).toBe(0);
  expect(readFileSync(join(output, "gsd-plan-phase.md"), "utf8")).toContain("description: Plan");
});
```
Use an e2e fixture only for CLI/packaged integration; unit tests should cover the state machine.

---

### `tests/prompt-transform.test.ts` (test, transform)

**Analog:** `tests/prompt-transform.test.ts`

**Transform assertion pattern** (lines 54-62):
```typescript
it("normalizes official slash command references to Pi hyphen commands", () => {
  const input = "Run /gsd-plan-phase 1, then /gsd-new-project. Do not change http://x/y.";

  expect(normalizeGsdSlashReferences(input)).toBe("Run /gsd-plan-phase 1, then /gsd-new-project. Do not change http://x/y.");
});
```
Add RUNTIME-03 assertions that the checklist symbol is not exported/used and generated workflows/prompts lack `<pi_auto_mode_fidelity>`.

**Existing checklist test marker** (lines 754-759):
```typescript
// injectAutoModeChecklist tests removed — this function was a wrapper overreach
// that modified workflow behavioral logic, not just syntax transformation.
// See discussion: we are a WRAPPER not a fork. Adding behavioral content
// to upstream workflows exceeds our scope.
```
Replace the stale comment with positive tests for removal.

---

### `src/orchestrator/state-digest.ts` (service/adapter, file-I/O + request-response)

**Analog:** `src/cli.ts`

**gsd-tools passthrough pattern** (lines 104-132): use the `official` command branch excerpt above. The state digest writer should call `gsd-tools.cjs query state.*` through `resolveOfficialPackage().paths.gsdTools`, not edit `STATE.md` directly. Keep this behind an injected adapter for tests.

---

### `src/orchestrator/reconciliation.ts` (service/utility, request-response)

**Analog:** `src/doctor.ts`

**Check-result seam pattern** (lines 48-93): use the `checkPiSubagentsTempAcl` excerpt above. Implement Phase 9 as minimal pre-dispatch checks/stubbed seam returning structured pass/deferred/blocker results, not full Phase 10 drift repair.

## Shared Patterns

### Application services return records, not prints
**Source:** `src/doctor.ts` lines 96-178; `src/agent-sync.ts` lines 25-82  
**Apply to:** all `src/orchestrator/*` services
```typescript
const messages: string[] = [];
const written: string[] = [];
let ok = true;
// ... collect status
return { ok, messages, written };
```

### CLI is the print/exit-code boundary
**Source:** `src/cli.ts` lines 34-150  
**Apply to:** `src/cli.ts` orchestrator command integration
```typescript
for (const message of result.messages) {
  io.stdout(`${message}\n`);
}
return result.ok ? 0 : 1;
```

### `.js` local imports under NodeNext
**Source:** `src/generator.ts` lines 3-18; `src/index.ts` lines 1-11  
**Apply to:** every new TypeScript file
```typescript
import { splitFrontmatter, writeFrontmatter } from "./frontmatter.js";
import { assertSafeOutDir } from "./safe-output.js";
export * from "./doctor.js";
```

### Safe file I/O under explicit directories
**Source:** `src/generator.ts` lines 70-90 and 115-166; `src/agent-sync.ts` lines 25-35, 61-64  
**Apply to:** `journal.ts`, artifact gates, state digest adapter
```typescript
const outDir = resolve(options.outDir);
assertSafeOutDir({ officialRoot, outDir, safeRoot: options.safeRoot });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(targetPath, transformed, "utf8");
```
For journal code, do not use `rmSync`; copy the resolve/create/write pattern and constrain writes to `.planning/`.

### Missing-file and validation handling
**Source:** `src/doctor.ts` lines 193-223 and 235-247  
**Apply to:** gates and journal reads
```typescript
try {
  actual = readFileSync(actualPath, "utf8");
} catch (error) {
  if (isMissingFileError(error)) {
    ok = false;
    options.messages.push(`missing generated ${options.label}: ${fileName}`);
    continue;
  }
  throw error;
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
```

### Official package resolution
**Source:** `src/official.ts` lines 31-63  
**Apply to:** settings/state/dispatch adapters that need `@opengsd/gsd-core`
```typescript
const officialPackage = resolveOfficialPackage({ startDir: cwd });
// use officialPackage.paths.gsdTools, workflowsDir, referencesDir, templatesDir
```

### Test fixtures and Vitest globals
**Source:** `tests/agent-sync.test.ts` lines 1-24; `tests/cli.test.ts` lines 9-22  
**Apply to:** all new orchestrator tests
```typescript
const root = mkdtempSync(join(tmpdir(), "pi-gsd-sync-"));
const stdout: string[] = [];
const code = await runCli([...], {
  stdout: (text) => stdout.push(text),
  stderr: () => undefined,
});
expect(code).toBe(0);
```

## No Analog Found

All expected Phase 9 files have at least a partial analog. The weakest analog is native Pi subagent dispatch: `src/pi-subagents.ts` currently resolves package metadata only, so `src/orchestrator/dispatch.ts` should keep programmatic dispatch behind an interface until the runtime API is verified.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | No fully unmatched files. |

## Metadata

**Analog search scope:** `src/*.ts`, `tests/*.test.ts`, `CLAUDE.md`, Phase 9 CONTEXT/RESEARCH  
**Files scanned:** 29 source/test files listed; 10 analog files read  
**Pattern extraction date:** 2026-06-01
