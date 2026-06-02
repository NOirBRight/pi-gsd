/**
 * E2E tests for workflow generation fidelity — verifies that generated
 * workflow files have correct transformations applied.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWorkflows } from "../../src/generator.js";
import { resolveOfficialPackage } from "../../src/official.js";

describe("E2E: workflow generation fidelity", () => {
  const official = resolveOfficialPackage({ startDir: process.cwd() });
  let tempDir: string;
  let safeDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-gsd-e2e-wf-"));
    safeDir = mkdtempSync(join(tmpdir(), "pi-gsd-e2e-safe-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(safeDir, { recursive: true, force: true });
  });

  // generateWorkflows creates outDir/workflows/, outDir/references/, outDir/templates/
  function generateWorkflowsToTemp() {
    return generateWorkflows({
      officialRoot: official.packageRoot,
      outDir: tempDir,
      safeRoot: safeDir,
    });
  }

  describe("workflow $GSD_SDK and Skill() transformation", () => {
    it("produces zero residual $GSD_SDK command invocations", () => {
      generateWorkflowsToTemp();
      const wfDir = join(tempDir, "workflows");
      const files = readdirSync(wfDir, { recursive: true })
        .filter((f): f is string => typeof f === "string" && f.endsWith(".md"));

      let residualCount = 0;
      for (const file of files) {
        const content = readFileSync(join(wfDir, file), "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          if (line.includes("$GSD_SDK") && !line.trim().startsWith("GSD_SDK=")) {
            if (!line.includes("gsd_query")) {
              residualCount++;
            }
          }
        }
      }
      expect(residualCount).toBe(0);
    });

    it("produces zero residual dispatch-critical pseudo calls in generated workflows", () => {
      generateWorkflowsToTemp();
      const wfDir = join(tempDir, "workflows");
      const files = readdirSync(wfDir, { recursive: true })
        .filter((f): f is string => typeof f === "string" && f.endsWith(".md"));

      const residuals: string[] = [];
      const dispatchPatterns = [
        /Skill\(\s*(?:skill\s*=|["'][a-z0-9-]+["'])/g,
        /Workflow\(\s*workflow\s*=/g,
        /SlashCommand\(/g,
        /^\s*Agent\(\s*subagent_type\s*=\s*["']/g,
      ];

      for (const file of files) {
        const content = readFileSync(join(wfDir, file), "utf8");
        const lines = content.split("\n");
        for (const [index, line] of lines.entries()) {
          if (dispatchPatterns.some((pattern) => pattern.test(line))) {
            residuals.push(`${file}:${index + 1}:${line.trim()}`);
          }
          for (const pattern of dispatchPatterns) pattern.lastIndex = 0;
        }
      }

      expect(residuals).toEqual([]);
    });

    it("does not produce retired gsd_query calls in plan-phase workflow", () => {
      generateWorkflowsToTemp();
      const planPath = join(tempDir, "workflows", "plan-phase.md");
      const content = readFileSync(planPath, "utf8");
      expect(content).not.toContain("gsd_query");
      expect(content).toContain("gsd_run");
    });

    it("preserves code-review --fix --auto loop through Pi-safe workflow dispatch", () => {
      generateWorkflowsToTemp();

      const codeReview = readFileSync(join(tempDir, "workflows", "code-review.md"), "utf8");
      const codeReviewFix = readFileSync(join(tempDir, "workflows", "code-review-fix.md"), "utf8");

      expect(codeReview).toContain("Read and execute generated/workflows/workflows/code-review-fix.md");
      expect(codeReview).toContain("with arguments ${FIX_ARGS}");
      expect(codeReview).not.toContain("Workflow(");

      expect(codeReviewFix).toContain("MAX_ITERATIONS=3");
      expect(codeReviewFix).toContain("Use the Pi subagent tool: subagent");
      expect(codeReviewFix).not.toContain("Agent(subagent_type=");
      expect(codeReviewFix).not.toContain("Workflow(");
    });

    it("guards generated chain dispatch when native orchestrator owns the chain", () => {
      generateWorkflowsToTemp();

      const planPhase = readFileSync(join(tempDir, "workflows", "plan-phase.md"), "utf8");

      expect(planPhase).toContain("If PI_GSD_NATIVE_CHAIN_OWNER is set, return control to the native orchestrator");
      expect(planPhase).toContain("otherwise Invoke /gsd-execute-phase ${PHASE} --auto --no-transition ${GSD_WS} in Pi");
    });
  });
});
