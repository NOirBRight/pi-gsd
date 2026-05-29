# Testing Patterns

**Analysis Date:** 2026-05-29

## Test Framework

**Runner:**
- Vitest `^4.0.0`
- Config: `vitest.config.ts`
- Tests run in Node with globals enabled via `types: ["node", "vitest/globals"]` in `tsconfig.json`.

**Assertion Library:**
- Vitest `expect` globals: `expect(...).toBe(...)`, `toContain(...)`, `toThrow(...)`, `toEqual(...)`.

**Run Commands:**
```bash
npm test              # Run all tests with vitest run
npx vitest            # Watch mode (not scripted, supported by Vitest)
npm run check         # Typecheck, tests, build, and generated prompt doctor check
```

## Test File Organization

**Location:**
- Tests live in the top-level `tests/` directory, separate from `src/`.
- Shared fixtures live in `tests/fixtures.ts`.
- Generated/build output under `dist/` is not tested directly except through package/CLI behavior.

**Naming:**
- Use `<module>.test.ts` for test files: `tests/generator.test.ts`, `tests/cli.test.ts`, `tests/agent-transform.test.ts`.
- Mirror source module names where possible: `src/runtime-rewrites.ts` → `tests/runtime-rewrites.test.ts`.

**Structure:**
```text
tests/
├── fixtures.ts                  # Shared temporary official-package fixture builder
├── generator.test.ts            # Tests src/generator.ts
├── cli.test.ts                  # Tests src/cli.ts
└── runtime-rewrites.test.ts     # Tests src/runtime-rewrites.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { join } from "node:path";
import { createOfficialFixture } from "./fixtures.js";
import { generatePrompts } from "../src/generator.js";

describe("generatePrompts", () => {
  it("generates Pi prompt files from official command files", () => {
    const fixture = createOfficialFixture();
    const outDir = join(fixture.root, "generated", "prompts");

    const result = generatePrompts({ officialRoot: fixture.packageRoot, outDir });

    expect(result.written).toContain(join(outDir, "gsd-plan-phase.md"));
  });
});
```

**Patterns:**
- Use `describe("functionName", ...)` or a domain phrase matching the module behavior: `describe("generateAgents", ...)` in `tests/agent-generator.test.ts`, `describe("runtime rewrites", ...)` in `tests/runtime-rewrites.test.ts`.
- Use behavior-oriented `it("...")` names that state the expected outcome.
- Arrange/act/assert inside each test; avoid broad shared mutable setup except local helpers.
- Use real filesystem operations against temporary directories for generator, doctor, and CLI behavior.
- Assert both functional result objects and side effects on files when code writes output.

## Mocking

**Framework:** Vitest globals; no `vi.mock` patterns detected.

**Patterns:**
```typescript
const stdout: string[] = [];
const code = await runCli(["generate", "--cwd", fixture.root], {
  stdout: (text) => stdout.push(text),
  stderr: () => undefined,
});

expect(code).toBe(0);
expect(stdout.join("")).toContain("generated 1 prompt");
```

**What to Mock:**
- Prefer dependency injection over module mocks. `runCli` accepts `CliIO` in `src/cli.ts`; tests pass arrays as stdout/stderr collectors in `tests/cli.test.ts`.
- Use injected resolver functions for package-resolution failure paths, as supported by `DoctorOptions.piSubagentsResolver` in `src/doctor.ts`.

**What NOT to Mock:**
- Do not mock Node filesystem for generator/doctor/sync behavior. Existing tests use `mkdtempSync`, `mkdirSync`, `writeFileSync`, and `readFileSync` through `tests/fixtures.ts`.
- Do not mock core transform functions when testing higher-level generation; use fixture files to exercise real transformations.

## Fixtures and Factories

**Test Data:**
```typescript
const fixture = createOfficialFixture();
writeFileSync(
  join(fixture.packageRoot, "commands", "gsd", "plan-phase.md"),
  "---\ndescription: Plan\n---\n# Plan Phase\n",
  "utf8",
);
```

**Location:**
- Shared official-package fixture factory: `tests/fixtures.ts`.
- Test-specific helper writers belong at the bottom of the relevant test file, such as `writePlannerAgent` in `tests/agent-generator.test.ts` and helper writers in `tests/cli.test.ts`.
- Fixtures create temporary roots under `tmpdir()` using `mkdtempSync`; tests should not write permanent files outside the temporary fixture root.

## Coverage

**Requirements:** None enforced. No coverage thresholds are configured in `vitest.config.ts`, and no coverage script is configured in `package.json`.

**View Coverage:**
```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Pure transform and parsing behavior is tested directly: `tests/agent-transform.test.ts`, `tests/prompt-transform.test.ts`, `tests/frontmatter` behavior via `tests/generator.test.ts`.
- Error handling is tested with `toThrow` and regex/string checks: `tests/official-resolver.test.ts`, `tests/generator.test.ts`, `tests/agent-generator.test.ts`.

**Integration Tests:**
- CLI integration is tested by calling `runCli` directly with injected IO in `tests/cli.test.ts`.
- Filesystem generation and stale-output detection are tested through temporary official package fixtures in `tests/generator.test.ts`, `tests/doctor.test.ts`, and `tests/agent-sync.test.ts`.
- A smoke test for real official-package behavior exists in `tests/smoke-real-official.test.ts`.

**E2E Tests:**
- No browser or external E2E framework is used.
- The closest end-to-end verification is `npm run check`, which runs `typecheck`, `vitest run`, `tsup` build, and `node dist/cli.js doctor --prompts generated/prompts --cwd .`.

## Common Patterns

**Async Testing:**
```typescript
it("returns usage for unknown commands", async () => {
  const stderr: string[] = [];

  const code = await runCli(["wat"], {
    stdout: () => undefined,
    stderr: (text) => stderr.push(text),
  });

  expect(code).toBe(2);
  expect(stderr.join("")).toContain("Usage: pi-gsd-redux");
});
```

**Error Testing:**
```typescript
expect(() =>
  generatePrompts({ officialRoot: fixture.packageRoot, outDir: fixture.root }),
).toThrow(/unsafe output directory/i);
```

**Filesystem Testing:**
```typescript
const generated = join(outDir, "gsd-plan-phase.md");
expect(existsSync(generated)).toBe(true);
expect(readFileSync(generated, "utf8")).toContain("description: Plan");
```

---

*Testing analysis: 2026-05-29*
