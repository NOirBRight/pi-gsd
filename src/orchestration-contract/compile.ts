import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { OrchestrationContractSnapshot, OutcomeUnitContract } from "./types.js";
import { calculateOrchestrationContractHash } from "./snapshot.js";

export type CompileOrchestrationContractOptions = {
  cwd: string;
  officialPackage?: string;
  officialVersion?: string;
};

const DISCUSS_CHAIN_PATH = "generated/workflows/workflows/discuss-phase/modes/chain.md";
const PLAN_PATH = "generated/workflows/workflows/plan-phase.md";
const EXECUTE_PATH = "generated/workflows/workflows/execute-phase.md";

export function compileOrchestrationContract(options: CompileOrchestrationContractOptions): OrchestrationContractSnapshot {
  const generatedRoot = join(options.cwd, "generated");
  const discussChain = readRequired(options.cwd, DISCUSS_CHAIN_PATH);
  const plan = readRequired(options.cwd, PLAN_PATH);
  const execute = readRequired(options.cwd, EXECUTE_PATH);

  requireText(
    discussChain,
    /\bgsd-plan-phase\b[\s\S]{0,120}--auto\b/,
    DISCUSS_CHAIN_PATH,
    "discuss chain must launch plan --auto",
  );
  requireText(
    plan,
    /\bgsd-execute-phase\b[\s\S]{0,160}--auto\b[\s\S]{0,80}--no-transition\b/,
    PLAN_PATH,
    "plan auto must launch execute --auto --no-transition",
  );
  requireText(execute, /##\s*PHASE COMPLETE/i, EXECUTE_PATH, "execute must emit PHASE COMPLETE");
  requireText(execute, /Verification:\s*\{?\s*Passed\s*\|\s*Gaps Found\s*\}?/i, EXECUTE_PATH, "execute must report verification result");

  const executeOutcome: OutcomeUnitContract = {
    artifactSuffixes: ["SUMMARY.md", "VERIFICATION.md"],
    requiredArtifacts: ["SUMMARY.md", "VERIFICATION.md"],
    passStatuses: ["passed", "pass"],
    pauseStatuses: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion.",
    },
    pauseMarkers: {
      gaps_found: "Execution verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Execution verification requires human verification before phase completion.",
      verification_failed: "Execution verification failed; inspect VERIFICATION.md before continuing.",
    },
    requireRecognizedOutcome: true,
    sourcePaths: [EXECUTE_PATH],
  };

  const snapshot: OrchestrationContractSnapshot = {
    contractVersion: 1,
    contractHash: "",
    ...(options.officialPackage ? { officialPackage: options.officialPackage } : {}),
    ...(options.officialVersion ? { officialVersion: options.officialVersion } : {}),
    generatedRoot: relative(options.cwd, generatedRoot) || "generated",
    phaseIdPolicy: {
      lexicalPattern: "^\\d+(?:\\.\\d+)*$",
      examples: ["9", "09", "2.1", "02.1"],
      validationHint: "Use upstream roadmap.get-phase/find-phase for existence checks.",
    },
    chain: {
      defaultQueue: [
        { unitType: "discuss", argsByMode: { chain: "--chain", auto: "--auto" }, required: false, sourcePaths: [DISCUSS_CHAIN_PATH] },
        { unitType: "plan", argsByMode: { chain: "--auto", auto: "--auto" }, required: true, sourcePaths: [PLAN_PATH] },
        { unitType: "execute", argsByMode: { chain: "--auto --no-transition", auto: "--auto --no-transition" }, required: true, sourcePaths: [PLAN_PATH, EXECUTE_PATH] },
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
      discuss: { artifactSuffixes: ["CONTEXT.md"], sourcePaths: [DISCUSS_CHAIN_PATH] },
      plan: { artifactSuffixes: ["PLAN.md"], sourcePaths: [PLAN_PATH] },
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
  if (!pattern.test(content)) {
    throw new Error(`orchestration contract drift in ${sourcePath}: ${reason}`);
  }
}
