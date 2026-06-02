import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const requiredDirectories = [
  "commands/gsd",
  "get-shit-done/workflows",
  "get-shit-done/references",
  "get-shit-done/templates",
  "get-shit-done/bin/shared",
  "agents",
  "hooks",
];

export function createOfficialFixture(options: { omit?: string[]; packageName?: string } = {}) {
  const root = mkdtempRoot();
  const packageName = options.packageName ?? "@opengsd/gsd-core";
  const packageRoot = join(root, "node_modules", ...packageName.split("/"));
  const omitted = new Set(options.omit ?? []);

  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version: "1.2.3",
      },
      null,
      2,
    ),
  );

  for (const requiredDirectory of requiredDirectories) {
    if (!omitted.has(requiredDirectory)) {
      mkdirSync(join(packageRoot, requiredDirectory), { recursive: true });
    }
  }

  if (!omitted.has("commands/gsd")) {
    writeFileSync(join(packageRoot, "commands", "gsd", "plan-phase.md"), "# Plan Phase\n");
  }

  if (!omitted.has("get-shit-done/bin/gsd-tools.cjs")) {
    mkdirSync(join(packageRoot, "get-shit-done", "bin"), { recursive: true });
    writeFileSync(join(packageRoot, "get-shit-done", "bin", "gsd-tools.cjs"), "module.exports = {};\n");
  }

  if (!omitted.has("get-shit-done/bin/shared/config-defaults.manifest.json")) {
    mkdirSync(join(packageRoot, "get-shit-done", "bin", "shared"), { recursive: true });
    writeFileSync(
      join(packageRoot, "get-shit-done", "bin", "shared", "config-defaults.manifest.json"),
      JSON.stringify({
        workflow: {
          _auto_chain_active: false,
          auto_advance: false,
          research: true,
          plan_check: true,
          verifier: true,
          ui_phase: true,
          ui_safety_gate: true,
          ui_review: true,
          code_review: true,
          code_review_depth: "standard",
          code_review_command: null,
          plan_review_convergence: false,
          max_discuss_passes: 3,
          plan_bounce: false,
          plan_bounce_passes: 2,
          post_planning_gaps: true,
          security_enforcement: true,
          nyquist_validation: true,
          ai_integration_phase: true,
          auto_prune_state: false,
          research_before_questions: false,
          skip_discuss: false,
          use_worktrees: true,
          node_repair: true,
          node_repair_budget: 2,
          subagent_timeout: 300000,
          inline_plan_threshold: 1,
        },
      }),
    );
  }

  if (!omitted.has("get-shit-done/bin/shared/config-schema.manifest.json")) {
    mkdirSync(join(packageRoot, "get-shit-done", "bin", "shared"), { recursive: true });
    writeFileSync(
      join(packageRoot, "get-shit-done", "bin", "shared", "config-schema.manifest.json"),
      JSON.stringify({
        validKeys: [
          "workflow._auto_chain_active",
          "workflow.auto_advance",
          "workflow.research",
          "workflow.plan_check",
          "workflow.verifier",
          "workflow.nyquist_validation",
          "workflow.ai_integration_phase",
          "workflow.ui_phase",
          "workflow.ui_safety_gate",
          "workflow.ui_review",
          "workflow.auto_advance",
          "workflow.node_repair",
          "workflow.node_repair_budget",
          "workflow.research_before_questions",
          "workflow.skip_discuss",
          "workflow.auto_prune_state",
          "workflow.use_worktrees",
          "workflow.code_review",
          "workflow.code_review_depth",
          "workflow.code_review_command",
          "workflow.plan_bounce",
          "workflow.plan_bounce_passes",
          "workflow.plan_review_convergence",
          "workflow.post_planning_gaps",
          "workflow.security_enforcement",
          "workflow.subagent_timeout",
          "workflow.inline_plan_threshold",
        ],
      }),
    );
  }

  return { root, packageRoot };
}

function mkdtempRoot() {
  return mkdtempSync(join(tmpdir(), "pi-gsd-official-"));
}
