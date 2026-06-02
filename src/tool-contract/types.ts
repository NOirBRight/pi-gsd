import type { UnitType } from "../orchestrator/types.js";

export type ToolContract = {
  unitType: UnitType;
  promptName: string;
  promptPath: string;
  promptHash: string;
  agent?: string;
  agentPath?: string;
  allowedTools: string[];
  schemaKeys: string[];
  validationRequirements: string[];
  closeoutRequirements: string[];
  sourcePaths: string[];
};

export type ToolContractSnapshot = {
  contractVersion: 1;
  contractHash: string;
  officialPackage?: string;
  officialVersion?: string;
  generatedRoot: string;
  contracts: ToolContract[];
};

export type ToolContractOverlay = Partial<Record<UnitType, Partial<Pick<ToolContract, "allowedTools" | "validationRequirements" | "closeoutRequirements">> & Record<string, unknown>>>;

export type ToolContractFailure = {
  unitId?: string;
  unitType: string;
  contractHash?: string;
  contractVersion?: number;
  failedField: string;
  expected?: string;
  actual?: string;
  sourcePaths?: string[];
};

export type ToolContractWarning = {
  unitType: string;
  field: string;
  expected?: string;
  actual?: string;
  sourcePaths?: string[];
};

export type VerifyToolContractResult = {
  ok: boolean;
  failures: ToolContractFailure[];
  warnings: ToolContractWarning[];
};

export type ValidateUnitToolContractResult =
  | { ok: true; contract: ToolContract }
  | { ok: false; failure: ToolContractFailure };
