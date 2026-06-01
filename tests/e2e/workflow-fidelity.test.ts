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

    it("produces zero residual Skill(skill= calls", () => {
      generateWorkflowsToTemp();
      const wfDir = join(tempDir, "workflows");
      const files = readdirSync(wfDir, { recursive: true })
        .filter((f): f is string => typeof f === "string" && f.endsWith(".md"));

      let residualCount = 0;
      for (const file of files) {
        const content = readFileSync(join(wfDir, file), "utf8");
        const matches = content.match(/Skill\(skill=["']/g);
        if (matches) {
          residualCount += matches.length;
        }
      }
      expect(residualCount).toBe(0);
    });

    it("does not produce retired gsd_query calls in plan-phase workflow", () => {
      generateWorkflowsToTemp();
      const planPath = join(tempDir, "workflows", "plan-phase.md");
      const content = readFileSync(planPath, "utf8");
      expect(content).not.toContain("gsd_query");
      expect(content).toContain("gsd_run");
    });
  });
});