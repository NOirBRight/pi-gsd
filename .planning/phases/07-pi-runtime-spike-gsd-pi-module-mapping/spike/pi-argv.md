# Pi Argv-Passing Mechanism — Verified Contract

**Phase:** 7
**Source:** `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js`
**Date:** 2026-05-31

## Contract Summary

Pi performs literal string substitution on workflow prompt template content **before the LLM sees it**. `$ARGUMENTS`, `$@`, `$1`, `$2`, `${@:N}`, and `${@:N:L}` are template placeholders resolved at substitution time — they are not runtime variables, environment variables, or tool inputs. The LLM never sees raw placeholders; it receives fully substituted prompt text.

## Verified Flow

The complete pipeline is implemented in `prompt-templates.js` (251 lines) with three stages:

### Stage 1: `parseCommandArgs(argsString)` → `string[]` (line 11)

Bash-style argument parser. Handles:

- Whitespace-delimited tokens
- Quoted strings (single `'` and double `"`)
- Escaped characters within quotes

```text
Input:  "07 --chain"
Output: ["07", "--chain"]

Input:  "my-phase --auto 'some value'"
Output: ["my-phase", "--auto", "some value"]
```

### Stage 2: `expandPromptTemplate(text, templates)` → `string` (line 237)

Orchestrator. Regex `^\/([^\s]+)(?:\s+([\s\S]*))?$` extracts:

- `templateName` — the slash command name (e.g., "gsd-plan-phase")
- `argsString` — everything after the template name

If a matching template is found in the template registry, calls `substituteArgs(template.content, parseCommandArgs(argsString))`. Otherwise returns text unchanged.

### Stage 3: `substituteArgs(content, args)` → `string` (line 54)

Applies 6 substitution patterns **in order**, each operating on the result of the previous:

1. `$N` positional args (processed first to prevent re-substitution from wildcards)
2. `${@:N:L}` bash-style slicing with length
3. `${@:N}` bash-style slicing from position
4. `$ARGUMENTS` — all args joined with space (newer syntax)
5. `$@` — all args joined with space (legacy syntax)

**Critical detail:** Argument values containing patterns like `$1` or `$@` are NOT recursively substituted. `$N` patterns run first and only match against the template content, not against substituted argument values.

## Substitution Patterns Table

| Pattern | Input Example | Output Example | Notes |
|---------|---------------|----------------|-------|
| `$1` | `/gsd-plan-phase 07 --chain` | `07` | First positional arg (0-based, returns `""` if missing) |
| `$2` | `/gsd-plan-phase 07 --chain` | `--chain` | Second positional arg |
| `${@:N}` | `/gsd-execute-phase 07 --chain --auto` | `07 --chain --auto` (N=1) / `--chain --auto` (N=2) | Args from Nth onwards |
| `${@:N:L}` | `/gsd-execute-phase 07 --chain --auto` | `07 --chain` (N=1, L=2) | L args starting from Nth |
| `$ARGUMENTS` | `/gsd-plan-phase 07 --chain` | `07 --chain` | All args joined (newer, preferred) |
| `$@` | `/gsd-plan-phase 07 --chain` | `07 --chain` | All args joined (legacy) |

## Reproducer

**Canonical example:** `/gsd-plan-phase 07 --chain`

### Step 1: Locate the source

```bash
# In any pi-gsd-redux development environment
ls node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js
```

### Step 2: Identify the template

Pi loads prompt templates from `.pi/prompts/` and user/agent prompt directories. The template for `/gsd-plan-phase` is loaded from `pi-gsd-redux`'s package.json `pi.prompts` configuration, which points to `generated/prompts/gsd-plan-phase.md`.

A typical template body contains:

```markdown
Phase number: $1 (required)

<context>
Phase number: $1
Flags: $ARGUMENTS
</context>
```

### Step 3: Trace parseCommandArgs

```
parseCommandArgs("07 --chain")
  → ['07', '--chain']
```

### Step 4: Trace substituteArgs

```javascript
substituteArgs(templateContent, ['07', '--chain'])

// $1 → "07"
// $2 → "--chain"
// $@ → "07 --chain"
// $ARGUMENTS → "07 --chain"
```

### Step 5: Confirm the LLM receives

```markdown
Phase number: 07 (required)

<context>
Phase number: 07
Flags: 07 --chain
</context>
```

All `$ARGUMENTS` / `$1` / `$2` placeholders are replaced with literal string values. The LLM sees `07 --chain` as plain text in the prompt content.

## v2.0 Implications

Per D-05 (Pi side only — no gsd-tools content):

- **`--chain` and `--auto` flags arrive as literal strings** in substituted prompt content. Pi's Auto Orchestration (Phase 9) must detect these flags within the prompt text to trigger native orchestration.
- **The substitution contract is Pi-owned** — pi-gsd-redux cannot change it. If `$ARGUMENTS` / `$@` substitution behavior changes in a future pi-coding-agent release, pi-gsd-redux must adapt.
- **`AUTO_MODE_CHECKLIST` (src/prompt-transform.ts:917)** is injected into template content **before** Pi substitution happens. In v2.0, native orchestration replaces this checklist; the injection point can be removed.
- **Cross-reference D-06:** gsd-tools CLI calling conventions are documented in `upstream-1.2.0-impact.md`, NOT in this artifact.

## Source References

| Function | File | Lines |
|----------|------|-------|
| `parseCommandArgs` | `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js` | 11-53 |
| `substituteArgs` | `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js` | 54-82 |
| `expandPromptTemplate` | `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js` | 237-251 |
| `loadPromptTemplates` | `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js` | 169-236 |
