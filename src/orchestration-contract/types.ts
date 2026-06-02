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
