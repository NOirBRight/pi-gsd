# Codebase Concerns

**Analysis Date:** 2026-05-29

## Tech Debt

**Generated artifacts committed and duplicated:**
- Issue: The package commits generated prompt/agent outputs in `generated/prompts/` and `generated/agents/` plus built outputs in `dist/`. Source-of-truth code in `src/generator.ts` and `src/agent-generator.ts` rewrites those directories wholesale, while `package.json` publishes generated and built artifacts.
- Files: `generated/prompts/`, `generated/agents/`, `dist/`, `src/generator.ts`, `src/agent-generator.ts`, `package.json`
- Impact: Generated drift is easy to introduce when `@opengsd/get-shit-done-redux` changes. Diffs can be large and reviewers must distinguish source changes from generated changes.
- Fix approach: Keep `npm run check` mandatory before release, and use `node dist/cli.js doctor --prompts generated/prompts --agents --cwd .` to detect stale generated files. Prefer changing `src/*` transforms first, then regenerate in a separate commit or clearly separated diff section.

**Official package version floats:**
- Issue: `package.json` uses `"@opengsd/get-shit-done-redux": "latest"`.
- Files: `package.json`, `package-lock.json`, `src/official.ts`, `tests/smoke-real-official.test.ts`
- Impact: Fresh installs can resolve a newer official GSD release than the one used to author `generated/prompts/` and `generated/agents/`, causing doctor failures or behavior changes without a source diff.
- Fix approach: Pin an explicit compatible official version in `package.json`, or keep `latest` only if every release pipeline regenerates artifacts and runs `npm run check` after dependency resolution.

**Hand-rolled frontmatter parser:**
- Issue: `src/frontmatter.ts` parses only simple scalar and list frontmatter, ignores malformed lines, and emits only `description` and `argument-hint` for prompts. Agent frontmatter emission in `src/agent-transform.ts` writes unquoted `name`, `description`, and comma-separated `tools` manually.
- Files: `src/frontmatter.ts`, `src/agent-transform.ts`, `src/generator.ts`, `src/agent-generator.ts`
- Impact: New YAML features or keys in official prompts/agents can be silently dropped or misserialized. Descriptions containing YAML-sensitive characters can break generated agent files because `writeAgentFrontmatter()` does not quote values.
- Fix approach: Add tests for every supported official frontmatter shape before changing transforms. Consider a small YAML library or reuse `formatScalar()` for agent frontmatter.

**CLI parsing is minimal:**
- Issue: `src/cli.ts` supports only `--flag value` arguments and optional boolean handling for `--agents`; it does not support `--flag=value`, short flags, or command-specific help.
- Files: `src/cli.ts`, `tests/cli.test.ts`
- Impact: Users accustomed to common CLI formats may get `Unknown option` or `Missing value` failures. More commands/options increase parser complexity.
- Fix approach: Preserve current explicit parser for small scope, but add tests before adding option forms. If option surface grows, replace `parseOptions()` and `parseOfficialArgs()` with a maintained parser.

## Known Bugs

**User-level agent sync can write outside the current project:**
- Symptoms: `sync-agents --scope user` writes into the home directory rather than the project tree.
- Files: `src/agent-sync.ts`, `src/cli.ts`, `README.md`
- Trigger: Run `npx pi-gsd-redux sync-agents --scope user`.
- Workaround: Prefer `sync-agents --scope project` unless global Pi agents are explicitly desired. Use `--dry-run` to preview writes.

**Malformed generated agents can result from unquoted frontmatter:**
- Symptoms: A generated `generated/agents/*.md` file may have invalid YAML frontmatter if official `name` or `description` contains characters requiring quoting.
- Files: `src/agent-transform.ts`, `src/frontmatter.ts`, `generated/agents/`
- Trigger: Official agent frontmatter includes characters such as `:`, `#`, quotes, brackets, or leading/trailing whitespace in fields emitted by `writeAgentFrontmatter()`.
- Workaround: Run `npm test` and inspect generated agent frontmatter after official package updates; add a targeted regression test before accepting a new official frontmatter shape.

## Security Considerations

**Recursive deletion of output directories:**
- Risk: `generatePrompts()` and `generateAgents()` call `rmSync(outDir, { recursive: true, force: true })` after `assertSafeOutDir()` approves the directory.
- Files: `src/generator.ts`, `src/agent-generator.ts`, `src/safe-output.ts`, `tests/generator.test.ts`, `tests/agent-generator.test.ts`
- Current mitigation: `assertSafeOutDir()` blocks filesystem roots, the current working directory, `safeRoot`, official package directories, and non-empty directories without a `generated` path segment.
- Recommendations: Treat `--out`, `--prompts`, and `--agents` as destructive inputs. Keep safety tests extensive for symlinks, case-insensitive paths, nested official roots, and non-empty directories named `generated` outside the repo.

**Generated-marker ownership check is substring-based:**
- Risk: `syncAgents()` considers any existing target containing `<!-- pi-gsd generated agent -->` to be owned and safe to overwrite.
- Files: `src/agent-sync.ts`, `.pi/agents/`, `generated/agents/`
- Current mitigation: Files without the marker are refused with `refusing to overwrite unowned agent`.
- Recommendations: Require the marker in a specific location, such as immediately after frontmatter, before overwriting. Consider adding a checksum or managed block header.

**Runtime context rewrite processes assistant/user text:**
- Risk: `src/extension.ts` rewrites all string and text-block message content during `context` and assistant `message_end` events.
- Files: `src/extension.ts`, `src/runtime-rewrites.ts`, `src/prompt-transform.ts`
- Current mitigation: Rewrites are limited to GSD slash references and official Claude path patterns, and failures return `undefined` instead of interrupting runtime flow.
- Recommendations: Keep regexes narrow. Add tests before broadening rewrites to avoid altering code snippets, user data, or unrelated paths.

## Performance Bottlenecks

**Doctor regenerates and compares all resources synchronously:**
- Problem: `runDoctor()` creates a temporary tree, regenerates prompts and optionally agents, reads every expected and actual markdown file, and compares full file contents.
- Files: `src/doctor.ts`, `src/generator.ts`, `src/agent-generator.ts`
- Cause: All filesystem work uses synchronous APIs and full-file reads.
- Improvement path: Current size is small enough for CLI use. If official resources grow, compare hashes or stream content, and report progress for large resource sets.

**Extension resolves official package repeatedly:**
- Problem: `resolveOfficialPackage()` is called on `session_start`, every `context` event, and every assistant `message_end` event.
- Files: `src/extension.ts`, `src/official.ts`
- Cause: No per-`ctx.cwd` cache is maintained, so package resolution and required path validation repeat.
- Improvement path: Cache successful resolutions by `ctx.cwd` with invalidation only if package locations need to change during a session.

## Fragile Areas

**Regex-based prompt and runtime transformations:**
- Files: `src/prompt-transform.ts`, `src/runtime-rewrites.ts`, `src/agent-transform.ts`, `tests/prompt-transform.test.ts`, `tests/runtime-rewrites.test.ts`, `tests/agent-transform.test.ts`
- Why fragile: Slash command rewrites, Claude path rewrites, and subagent-guidance injection depend on regular expressions and sentence splitting. Small wording changes in official GSD prompts can change whether Pi guidance is injected.
- Safe modification: Add representative fixture tests for official text before changing regexes. Validate generated output with `npm run generate` and `npm run check`.
- Test coverage: Unit tests exist for transform modules, and `tests/smoke-real-official.test.ts` checks representative official resources. Coverage is not threshold-enforced.

**Silent missing generated agent directory:**
- Files: `src/agent-sync.ts`, `src/doctor.ts`, `src/cli.ts`
- Why fragile: `readGeneratedAgentFileNames()` catches all errors and returns `[]`, so unreadable or missing generated agent directories can look like an empty successful input for non-check sync paths.
- Safe modification: Narrow the catch to `ENOENT` and surface permission or parse errors. Add tests for missing and unreadable directories.
- Test coverage: Existing sync behavior is tested, but broad catch behavior is a risk area.

**Best-effort extension failures are intentionally swallowed:**
- Files: `src/extension.ts`, `src/official.ts`, `src/runtime-rewrites.ts`
- Why fragile: `context` and `message_end` handlers return `undefined` on any failure, which keeps Pi running but hides broken path resolution or rewrite errors from users after the initial warning path.
- Safe modification: Preserve non-blocking behavior, but add diagnostic logging or rate-limited warnings for repeated failures.
- Test coverage: `tests/extension.test.ts` covers runtime behavior; operational observability remains limited.

## Scaling Limits

**Synchronous filesystem CLI model:**
- Current capacity: The current repo has small `src/`, `tests/`, `generated/prompts/`, and `generated/agents/` trees; synchronous operations are acceptable.
- Limit: Large official packages or slow network filesystems can make `generate`, `doctor`, and `sync-agents` block for noticeable periods.
- Scaling path: Use async filesystem APIs or worker-friendly batching if generated resource counts grow significantly.

**Node 22 runtime requirement:**
- Current capacity: `package.json` declares `"node": ">=22.0.0"`.
- Limit: Users on Node 20 LTS or older cannot run the package even though much of the code uses standard Node APIs.
- Scaling path: Keep Node 22 if required by Pi or dependencies; otherwise test and lower `engines.node` only with CI coverage.

## Dependencies at Risk

**@opengsd/get-shit-done-redux:**
- Risk: Version is `latest`, and this adapter depends on exact official directory structure: `commands/gsd`, `get-shit-done/workflows`, `get-shit-done/references`, `get-shit-done/templates`, `agents`, `hooks`, and `get-shit-done/bin/gsd-tools.cjs`.
- Impact: Official package restructuring breaks `resolveOfficialPackage()` and all generation/doctor commands.
- Migration plan: Keep `src/official.ts` validation explicit, update path mapping with official releases, and run `tests/smoke-real-official.test.ts` against the real installed package before publishing.

**pi-subagents:**
- Risk: Runtime functionality depends on `pi-subagents` availability, but the extension only checks dependency resolution and generated prompts instruct users to install it.
- Impact: Subagent workflows fail at runtime if Pi cannot expose the `subagent` tool even when this package installs correctly.
- Migration plan: Keep `doctor --agents` checks and README install steps current. Add runtime diagnostics if Pi exposes tool availability to extensions.

## Missing Critical Features

**No automated release guard visible in repo:**
- Problem: The repo has `npm run check`, but no detected CI workflow files in the scanned top-level tree.
- Blocks: Generated drift, type errors, or smoke failures can reach a release if maintainers publish manually without running checks.

**No coverage threshold:**
- Problem: `vitest.config.ts` configures test discovery and timeout only.
- Blocks: Transform edge cases and safety checks can lose coverage without a failing quality gate.

## Test Coverage Gaps

**Output-directory safety edge cases:**
- What's not tested: Full cross-platform safety behavior for symlinks, case-insensitive paths outside Windows, and non-empty directories with a `generated` segment but unrelated ownership.
- Files: `src/safe-output.ts`, `src/generator.ts`, `src/agent-generator.ts`
- Risk: A bad output argument can delete unintended generated-looking directories.
- Priority: High

**Official frontmatter compatibility:**
- What's not tested: YAML quoting/escaping for generated agent frontmatter and unknown prompt/agent frontmatter keys across future official package releases.
- Files: `src/frontmatter.ts`, `src/agent-transform.ts`, `src/generator.ts`
- Risk: Generated markdown can become invalid or lose metadata silently.
- Priority: Medium

**Operational extension observability:**
- What's not tested: User-visible diagnostics when repeated context/message rewrites fail after session start.
- Files: `src/extension.ts`, `src/runtime-rewrites.ts`
- Risk: Runtime prompts continue without required GSD path rewrites and users see degraded behavior without clear cause.
- Priority: Medium

---

*Concerns audit: 2026-05-29*
