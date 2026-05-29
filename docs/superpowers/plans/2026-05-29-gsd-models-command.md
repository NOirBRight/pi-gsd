# GSD Models Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/gsd-models` Pi slash command that lets users interactively configure GSD model routing for project or user scope using currently available Pi models.

**Architecture:** Implement this in the Pi adapter extension, not upstream GSD. The command reads available Pi models from `ctx.modelRegistry.getAvailable()`, asks the user for scope and mapping mode, then writes upstream-compatible GSD config (`model_profile` and `model_overrides`) to either `.planning/config.json` or the user-level GSD defaults file. Keep the generated config compatible with upstream GSD so future upstream changes remain easy to absorb.

**Tech Stack:** TypeScript, Pi extension API (`registerCommand`, `ctx.ui.select`, `ctx.modelRegistry`), Node fs/path/os APIs, Vitest.

---

## Design Summary

Command name: `/gsd-models`

Modes:

1. **Inherit current Pi model**
   - Writes `{ "model_profile": "inherit" }`.
   - Lowest risk and best default for non-Anthropic Pi providers.

2. **Map balanced tiers**
   - User chooses one Pi model for each upstream tier: `haiku`, `sonnet`, `opus`.
   - Adapter expands that into upstream `model_overrides` for known GSD agents, based on the upstream balanced profile.
   - Writes `model_profile: "balanced"` plus explicit `model_overrides` so upstream resolver receives Pi model IDs.

3. **Per-agent overrides**
   - User chooses models for a curated list of key GSD agents.
   - Writes `model_profile: "balanced"` plus explicit `model_overrides` only for selected agents.

Scope:

- `project`: `.planning/config.json` in current repo. Default.
- `user`: user-level GSD defaults file. Resolve as `%USERPROFILE%/.gsd/defaults.json` on Windows or `$HOME/.gsd/defaults.json` cross-platform via `os.homedir()`.

---

## File Structure

- Modify: `src/extension.ts`
  - Register `/gsd-models` command.
  - Delegate command logic to a focused module.

- Create: `src/gsd-models.ts`
  - Pure helpers for config path resolution, JSON merge/write, GSD agent tier maps, and UI orchestration functions.
  - Export small functions for tests.

- Create: `tests/gsd-models.test.ts`
  - Unit tests for config path resolution, config merge behavior, balanced-tier override generation, and model option formatting.

- Modify: `tests/extension.test.ts`
  - Assert extension registers `gsd-models` command without disturbing existing runtime rewrite behavior.

- Modify generated dist files after build:
  - `dist/extension.js`
  - associated `dist/chunk-*.js`
  - `dist/*.d.ts`

---

### Task 1: Add pure GSD model config helpers

**Files:**
- Create: `src/gsd-models.ts`
- Create: `tests/gsd-models.test.ts`

- [ ] **Step 1: Write failing tests for scope path resolution and config merging**

Create `tests/gsd-models.test.ts` with:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildBalancedModelOverrides,
  formatModelChoiceLabel,
  mergeGsdModelConfig,
  resolveGsdConfigPath,
} from "../src/gsd-models.js";

describe("gsd model config helpers", () => {
  it("resolves project and user config paths", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gsd-models-"));
    const home = join(root, "home");

    expect(resolveGsdConfigPath({ scope: "project", cwd: root, homeDir: home })).toBe(
      join(root, ".planning", "config.json"),
    );
    expect(resolveGsdConfigPath({ scope: "user", cwd: root, homeDir: home })).toBe(
      join(home, ".gsd", "defaults.json"),
    );
  });

  it("merges model config without deleting unrelated settings", () => {
    const existing = {
      workflow: { plan_check: true },
      model_profile: "inherit",
      model_overrides: { "gsd-planner": "old/model" },
    };

    expect(
      mergeGsdModelConfig(existing, {
        model_profile: "balanced",
        model_overrides: { "gsd-planner": "openai-codex/gpt-5.5" },
      }),
    ).toEqual({
      workflow: { plan_check: true },
      model_profile: "balanced",
      model_overrides: { "gsd-planner": "openai-codex/gpt-5.5" },
    });
  });

  it("removes stale model overrides when switching to inherit", () => {
    expect(
      mergeGsdModelConfig(
        { model_profile: "balanced", model_overrides: { "gsd-planner": "old/model" } },
        { model_profile: "inherit" },
      ),
    ).toEqual({ model_profile: "inherit" });
  });

  it("expands balanced tier choices into upstream-compatible model_overrides", () => {
    expect(
      buildBalancedModelOverrides({
        haiku: "local/fast",
        sonnet: "local/standard",
        opus: "local/heavy",
      }),
    ).toMatchObject({
      "gsd-codebase-mapper": "local/fast",
      "gsd-plan-checker": "local/fast",
      "gsd-planner": "local/standard",
      "gsd-executor": "local/standard",
      "gsd-roadmapper": "local/heavy",
    });
  });

  it("formats model choices with provider and model id", () => {
    expect(formatModelChoiceLabel({ provider: "openai-codex", id: "gpt-5.5", name: "GPT 5.5" })).toBe(
      "openai-codex/gpt-5.5 — GPT 5.5",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/gsd-models.test.ts
```

Expected: FAIL because `src/gsd-models.ts` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `src/gsd-models.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type GsdModelScope = "project" | "user";
export type GsdTier = "haiku" | "sonnet" | "opus";
export type TierModelMap = Record<GsdTier, string>;
export type GsdModelConfigPatch = {
  model_profile: "inherit" | "balanced";
  model_overrides?: Record<string, string>;
};

export type ModelChoiceLike = {
  provider: string;
  id: string;
  name?: string;
};

const balancedTierAgents: Record<GsdTier, string[]> = {
  haiku: [
    "gsd-codebase-mapper",
    "gsd-pattern-mapper",
    "gsd-research-synthesizer",
    "gsd-plan-checker",
    "gsd-integration-checker",
    "gsd-nyquist-auditor",
    "gsd-ui-checker",
    "gsd-ui-auditor",
    "gsd-doc-verifier",
  ],
  sonnet: [
    "gsd-planner",
    "gsd-executor",
    "gsd-phase-researcher",
    "gsd-project-researcher",
    "gsd-debugger",
    "gsd-verifier",
    "gsd-ui-researcher",
    "gsd-doc-writer",
    "gsd-code-reviewer",
    "gsd-code-fixer",
    "gsd-security-auditor",
    "gsd-intel-updater",
  ],
  opus: [
    "gsd-roadmapper",
    "gsd-ai-researcher",
    "gsd-domain-researcher",
    "gsd-eval-planner",
    "gsd-eval-auditor",
    "gsd-framework-selector",
    "gsd-assumptions-analyzer",
    "gsd-advisor-researcher",
    "gsd-debug-session-manager",
    "gsd-doc-classifier",
    "gsd-doc-synthesizer",
    "gsd-user-profiler",
  ],
};

export const keyGsdAgents = [
  "gsd-codebase-mapper",
  "gsd-planner",
  "gsd-executor",
  "gsd-roadmapper",
  "gsd-phase-researcher",
  "gsd-project-researcher",
  "gsd-code-reviewer",
  "gsd-verifier",
  "gsd-plan-checker",
] as const;

export function resolveGsdConfigPath(options: { scope: GsdModelScope; cwd: string; homeDir?: string }): string {
  if (options.scope === "project") {
    return join(options.cwd, ".planning", "config.json");
  }
  return join(options.homeDir ?? homedir(), ".gsd", "defaults.json");
}

export function buildBalancedModelOverrides(tiers: TierModelMap): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const tier of ["haiku", "sonnet", "opus"] as const) {
    for (const agent of balancedTierAgents[tier]) {
      overrides[agent] = tiers[tier];
    }
  }
  return overrides;
}

export function mergeGsdModelConfig(existing: Record<string, unknown>, patch: GsdModelConfigPatch): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing, model_profile: patch.model_profile };
  if (patch.model_profile === "inherit") {
    delete next.model_overrides;
    return next;
  }
  next.model_overrides = { ...(patch.model_overrides ?? {}) };
  return next;
}

export function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export function writeJsonObject(filePath: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function formatModelId(model: ModelChoiceLike): string {
  return `${model.provider}/${model.id}`;
}

export function formatModelChoiceLabel(model: ModelChoiceLike): string {
  const id = formatModelId(model);
  return model.name && model.name !== model.id ? `${id} — ${model.name}` : id;
}
```

- [ ] **Step 4: Run tests to verify helper behavior**

Run:

```bash
npx vitest run tests/gsd-models.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper slice**

```bash
git add src/gsd-models.ts tests/gsd-models.test.ts
git commit -m "feat: add GSD model config helpers"
```

---

### Task 2: Register `/gsd-models` and implement interactive UI flow

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/gsd-models.ts`
- Modify: `tests/extension.test.ts`

- [ ] **Step 1: Write failing extension registration test**

Add to `tests/extension.test.ts`:

```ts
import piGsdExtension from "../src/extension.js";

it("registers the gsd-models command", () => {
  const commands: Record<string, unknown> = {};
  const pi = {
    on: vi.fn(),
    registerCommand: vi.fn((name: string, options: unknown) => {
      commands[name] = options;
    }),
  };

  piGsdExtension(pi as never);

  expect(pi.registerCommand).toHaveBeenCalledWith(
    "gsd-models",
    expect.objectContaining({ description: expect.stringContaining("Configure GSD model") }),
  );
  expect(commands["gsd-models"]).toBeTruthy();
});
```

If `vi` is not already imported, update the import line:

```ts
import { vi } from "vitest";
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/extension.test.ts
```

Expected: FAIL because the command is not registered.

- [ ] **Step 3: Implement command orchestration in `src/gsd-models.ts`**

Append this API to `src/gsd-models.ts`:

```ts
export type GsdModelsCommandContext = {
  cwd: string;
  model: ModelChoiceLike;
  modelRegistry: { getAvailable(): Promise<ModelChoiceLike[]> };
  ui: {
    select<T>(title: string, items: Array<{ value: T; label: string; description?: string }>): Promise<T | undefined>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
};

export async function runGsdModelsCommand(args: string | undefined, ctx: GsdModelsCommandContext): Promise<void> {
  const available = await ctx.modelRegistry.getAvailable();
  if (available.length === 0) {
    ctx.ui.notify("No Pi models with valid credentials are available.", "error");
    return;
  }

  const scope = await chooseScope(args, ctx);
  if (!scope) return;

  const mode = await ctx.ui.select("GSD model configuration", [
    { value: "inherit" as const, label: "Inherit current Pi model", description: `Use ${formatModelChoiceLabel(ctx.model)} for GSD subagents` },
    { value: "balanced" as const, label: "Map balanced tiers", description: "Choose local models for haiku, sonnet, and opus tiers" },
    { value: "agents" as const, label: "Per-agent overrides", description: "Choose local models for key GSD agents" },
  ]);
  if (!mode) return;

  let patch: GsdModelConfigPatch;
  if (mode === "inherit") {
    patch = { model_profile: "inherit" };
  } else if (mode === "balanced") {
    patch = { model_profile: "balanced", model_overrides: buildBalancedModelOverrides(await chooseTierModels(available, ctx)) };
  } else {
    patch = { model_profile: "balanced", model_overrides: await chooseAgentModels(available, ctx) };
  }

  const configPath = resolveGsdConfigPath({ scope, cwd: ctx.cwd });
  const merged = mergeGsdModelConfig(readJsonObject(configPath), patch);
  writeJsonObject(configPath, merged);
  ctx.ui.notify(`GSD model config updated: ${configPath}`, "info");
}

async function chooseScope(args: string | undefined, ctx: GsdModelsCommandContext): Promise<GsdModelScope | undefined> {
  const trimmed = args?.trim();
  if (trimmed === "--user" || trimmed === "user") return "user";
  if (trimmed === "--project" || trimmed === "project" || trimmed === "") return "project";
  return ctx.ui.select("GSD config scope", [
    { value: "project" as const, label: "Project", description: ".planning/config.json (recommended)" },
    { value: "user" as const, label: "User", description: "~/.gsd/defaults.json (applies across projects)" },
  ]);
}

async function chooseTierModels(available: ModelChoiceLike[], ctx: GsdModelsCommandContext): Promise<TierModelMap> {
  return {
    haiku: await chooseModel("Fast/light tier (haiku)", available, ctx),
    sonnet: await chooseModel("Standard tier (sonnet)", available, ctx),
    opus: await chooseModel("Heavy tier (opus)", available, ctx),
  };
}

async function chooseAgentModels(available: ModelChoiceLike[], ctx: GsdModelsCommandContext): Promise<Record<string, string>> {
  const overrides: Record<string, string> = {};
  for (const agent of keyGsdAgents) {
    const selected = await chooseModel(agent, available, ctx);
    overrides[agent] = selected;
  }
  return overrides;
}

async function chooseModel(title: string, available: ModelChoiceLike[], ctx: GsdModelsCommandContext): Promise<string> {
  const selected = await ctx.ui.select(title, available.map((model) => ({
    value: formatModelId(model),
    label: formatModelChoiceLabel(model),
  })));
  return selected ?? formatModelId(ctx.model);
}
```

- [ ] **Step 4: Register command in `src/extension.ts`**

Add import:

```ts
import { runGsdModelsCommand } from "./gsd-models.js";
```

Inside `piGsdExtension`, after `session_start` handler registration, add:

```ts
  pi.registerCommand("gsd-models", {
    description: "Configure GSD model routing for Pi subagents",
    handler: async (args, ctx) => {
      await runGsdModelsCommand(args, ctx);
    },
  });
```

- [ ] **Step 5: Run extension tests**

Run:

```bash
npx vitest run tests/extension.test.ts tests/gsd-models.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit command slice**

```bash
git add src/extension.ts src/gsd-models.ts tests/extension.test.ts tests/gsd-models.test.ts
git commit -m "feat: add interactive GSD models command"
```

---

### Task 3: Build, verify, and document usage

**Files:**
- Modify: `README.md`
- Modify generated dist files after `npm run build`

- [ ] **Step 1: Add README usage section**

Add under the existing usage/configuration area in `README.md`:

```md
### Configure GSD subagent models

Use `/gsd-models` inside Pi to configure how upstream GSD model profiles map to local Pi models.

Recommended default for non-Anthropic Pi setups:

```text
/gsd-models
# choose Project → Inherit current Pi model
```

For more control, choose "Map balanced tiers" and select local Pi models for upstream `haiku`, `sonnet`, and `opus` tiers. The command writes upstream-compatible GSD config to `.planning/config.json` by default, or `~/.gsd/defaults.json` when user scope is selected.
```

- [ ] **Step 2: Build dist files**

Run:

```bash
npm run build
```

Expected: build exits 0 and updates `dist/`.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run typecheck
npm test
node dist/cli.js doctor --agents generated/agents --scope user --cwd .
```

Expected:

- typecheck exits 0
- all tests pass
- doctor reports `generated agents: ok` and `user synced agents: ok`

- [ ] **Step 4: Manual smoke test in Pi**

In a new Pi session after `/reload`, run:

```text
/gsd-models
```

Expected:

- UI asks for scope.
- UI lists available Pi models.
- Choosing Project → Inherit writes `.planning/config.json` with:

```json
{
  "model_profile": "inherit"
}
```

Then run:

```bash
gsd-sdk query resolve-model gsd-codebase-mapper --raw
```

Expected: model resolution returns an empty model or inherit behavior, not `haiku`/Bedrock.

- [ ] **Step 5: Commit final slice**

```bash
git add README.md dist src tests docs/superpowers/plans/2026-05-29-gsd-models-command.md
git commit -m "docs: describe GSD model routing command"
```

---

## Open Implementation Notes

- Do not use `--no-verify` for commits.
- Preserve unrelated existing changes in `README.md`, `package.json`, and `docs/` unless the user explicitly says to include them.
- If `ctx.ui.select` returns the full item instead of `value` in this Pi version, adapt with a tiny `selectedValue()` helper and add a unit test around it.
- If TypeScript types for `ctx.modelRegistry.getAvailable()` differ, keep `ModelChoiceLike` as the local structural type and adapt only at the command boundary.
- Prefer upstream-compatible `.planning/config.json` fields over adapter-only config.
