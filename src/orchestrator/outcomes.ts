import { readFileSync } from "node:fs";
import { readOrchestrationContractSnapshot } from "../orchestration-contract/index.js";
import { splitFrontmatter } from "../frontmatter.js";
import type { OrchestrationOutcome, UnitType } from "./types.js";

export type PostDispatchPolicy = {
  artifactSuffix?: string;
  artifactSuffixes?: string[];
  requiredArtifacts?: string[];
  passStatuses?: string[];
  pauseStatuses?: Record<string, string>;
  passMarkers?: string[];
  pauseMarkers?: Record<string, string>;
  requireRecognizedOutcome?: boolean;
  custom?: "security" | "nyquist";
};

export type OutcomePolicyInput = {
  artifactPath?: string;
  artifactPaths?: string[];
  messages?: string[];
  outcome?: OrchestrationOutcome;
  phase: string;
  unitType: UnitType;
};

export type OutcomePolicyResult =
  | { ok: true; evidence: string[] }
  | { ok: false; resumeHint: string; evidence: string[] };

export const POST_DISPATCH_POLICIES: Partial<Record<UnitType, PostDispatchPolicy>> = {
  discuss: { artifactSuffix: "CONTEXT.md" },
  research: { artifactSuffix: "RESEARCH.md" },
  plan: { artifactSuffix: "PLAN.md" },
  "plan-check": {
    passMarkers: ["verification_passed"],
    pauseMarkers: {
      issues_found: "Plan checker found issues; revise the plan before execution.",
    },
    requireRecognizedOutcome: true,
  },
  execute: {
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
  },
  "code-review": {
    artifactSuffix: "REVIEW.md",
    passStatuses: ["clean", "skipped", "issues_found"],
    requireRecognizedOutcome: true,
  },
  verify: {
    artifactSuffix: "VERIFICATION.md",
    passStatuses: ["passed", "pass"],
    pauseStatuses: {
      gaps_found: "Verification found gaps; run /gsd-plan-phase {phase} --gaps, then /gsd-execute-phase {phase} --gaps-only.",
      human_needed: "Phase verification requires human verification before closeout.",
    },
    requireRecognizedOutcome: true,
  },
  "security-review": {
    artifactSuffix: "SECURITY.md",
    custom: "security",
    requireRecognizedOutcome: true,
  },
  "nyquist-validation": {
    artifactSuffix: "VALIDATION.md",
    custom: "nyquist",
    requireRecognizedOutcome: true,
  },
  "ai-integration": { artifactSuffix: "AI-SPEC.md" },
  "settings-gate": { artifactSuffix: "UI-SPEC.md" },
  "ui-safety-gate": {
    artifactSuffix: "UI-SPEC.md",
    passStatuses: ["approved"],
    pauseStatuses: {
      blocked: "UI-SPEC checker blocked this phase; fix UI-SPEC.md before planning.",
      draft: "UI-SPEC is still draft; checker approval is required before planning.",
    },
    passMarkers: ["ui_spec_verified", "approved"],
    pauseMarkers: {
      ui_spec_blocked: "UI-SPEC checker blocked this phase; fix UI-SPEC.md before planning.",
      issues_found: "UI-SPEC checker found blocking issues; fix UI-SPEC.md before planning.",
      blocked: "UI-SPEC checker blocked this phase; fix UI-SPEC.md before planning.",
    },
    requireRecognizedOutcome: true,
  },
  "ui-review": { artifactSuffix: "UI-REVIEW.md", passMarkers: ["ui_review_complete"] },
};

export function resolvePostDispatchPolicy(unitType: UnitType, cwd?: string): PostDispatchPolicy | undefined {
  const fallback = POST_DISPATCH_POLICIES[unitType];
  const contractPolicy = cwd ? readOrchestrationContractSnapshot(cwd)?.outcomes[unitType] : undefined;
  if (!contractPolicy) return fallback;
  return {
    ...fallback,
    ...contractPolicy,
  };
}

export function evaluatePostDispatchPolicy(policy: PostDispatchPolicy, input: OutcomePolicyInput): OutcomePolicyResult {
  const signals = collectSignals(input);

  if (policy.custom === "security") {
    return evaluateSecurityPolicy(input.phase, signals);
  }
  if (policy.custom === "nyquist") {
    return evaluateNyquistPolicy(signals);
  }

  for (const [status, hint] of Object.entries(policy.pauseStatuses ?? {})) {
    if (signals.statuses.has(normalizeSignal(status))) {
      return fail(hint, input.phase, signals.evidence);
    }
  }

  for (const [marker, hint] of Object.entries(policy.pauseMarkers ?? {})) {
    if (signals.markers.has(normalizeSignal(marker))) {
      return fail(hint, input.phase, signals.evidence);
    }
  }

  for (const status of policy.passStatuses ?? []) {
    if (signals.statuses.has(normalizeSignal(status))) {
      return { ok: true, evidence: signals.evidence };
    }
  }

  for (const marker of policy.passMarkers ?? []) {
    if (signals.markers.has(normalizeSignal(marker))) {
      return { ok: true, evidence: signals.evidence };
    }
  }

  if (policy.requireRecognizedOutcome) {
    return {
      ok: false,
      resumeHint: `${input.unitType} did not report a recognized completion outcome.`,
      evidence: signals.evidence.length ? signals.evidence : ["outcome:missing"],
    };
  }

  return { ok: true, evidence: signals.evidence };
}

export function collectSignals(input: OutcomePolicyInput) {
  const statuses = new Set<string>();
  const markers = new Set<string>();
  const fields = new Map<string, string>();
  const evidence: string[] = [];

  const addStatus = (value: unknown) => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return;
    const normalized = normalizeSignal(String(value));
    if (!normalized) return;
    statuses.add(normalized);
    evidence.push(`status:${normalized}`);
  };

  const addMarker = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = normalizeSignal(value);
    if (!normalized) return;
    markers.add(normalized);
    evidence.push(`marker:${normalized}`);
  };

  const addField = (key: string, value: unknown) => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return;
    const normalizedKey = normalizeSignal(key);
    const normalizedValue = normalizeScalar(String(value));
    fields.set(normalizedKey, normalizedValue);
    evidence.push(`field:${normalizedKey}:${normalizedValue}`);
    if (["status", "verification", "verdict", "outcome"].includes(normalizedKey)) addStatus(String(value));
  };

  const artifactPaths = unique([...(input.artifactPath ? [input.artifactPath] : []), ...(input.artifactPaths ?? [])]);
  for (const artifactPath of artifactPaths) {
    evidence.push(`artifact:${artifactPath}`);
    const parsed = splitFrontmatter(readFileSync(artifactPath, "utf8"));
    for (const [key, value] of Object.entries(parsed.data)) {
      if (Array.isArray(value)) continue;
      addField(key, value);
    }
    for (const [key, value] of knownFields(parsed.body)) addField(key, value);
    for (const marker of knownMarkers(parsed.body)) addMarker(marker);
  }

  if (input.outcome) {
    addStatus(input.outcome.status);
    addStatus(input.outcome.verdict);
    addMarker(input.outcome.marker);
    addMarker(input.outcome.verdict);
    for (const [key, value] of Object.entries(input.outcome.data ?? {})) addField(key, value);
  }

  for (const message of input.messages ?? []) {
    for (const [key, value] of knownFields(message)) addField(key, value);
    for (const marker of knownMarkers(message)) addMarker(marker);
  }

  return { statuses, markers, fields, evidence: unique(evidence) };
}

function evaluateSecurityPolicy(phase: string, signals: ReturnType<typeof collectSignals>): OutcomePolicyResult {
  const threatsOpen = numberField(signals.fields.get("threats_open"));
  if (threatsOpen !== undefined) {
    return threatsOpen === 0
      ? { ok: true, evidence: signals.evidence }
      : fail("Security review has open threats; resolve or accept risks before continuing.", phase, signals.evidence);
  }
  if (signals.markers.has("open_threats") || signals.markers.has("escalate")) {
    return fail("Security review reported open threats; resolve or accept risks before continuing.", phase, signals.evidence);
  }
  if (signals.markers.has("secured") || signals.statuses.has("verified") || signals.statuses.has("passed")) {
    return { ok: true, evidence: signals.evidence };
  }
  return { ok: false, resumeHint: "Security review did not report threats_open: 0 or SECURED.", evidence: signals.evidence.length ? signals.evidence : ["security-outcome:missing"] };
}

function evaluateNyquistPolicy(signals: ReturnType<typeof collectSignals>): OutcomePolicyResult {
  const compliant = signals.fields.get("nyquist_compliant");
  if (signals.markers.has("escalate")) {
    return { ok: false, resumeHint: "Nyquist validation escalated unresolved coverage gaps.", evidence: signals.evidence };
  }
  if (compliant === "true") return { ok: true, evidence: signals.evidence };
  if (compliant === "false") {
    return { ok: false, resumeHint: "Nyquist validation is not compliant yet.", evidence: signals.evidence };
  }
  if (signals.markers.has("gaps_filled") || signals.statuses.has("passed") || signals.statuses.has("verified")) {
    return { ok: true, evidence: signals.evidence };
  }
  return { ok: false, resumeHint: "Nyquist validation did not report compliant coverage.", evidence: signals.evidence.length ? signals.evidence : ["nyquist-outcome:missing"] };
}

function fail(template: string, phase: string, evidence: string[]): OutcomePolicyResult {
  return { ok: false, resumeHint: template.replaceAll("{phase}", phase), evidence };
}

function knownMarkers(text: string): string[] {
  const markers = [
    "PHASE COMPLETE",
    "VERIFICATION PASSED",
    "ISSUES FOUND",
    "UI-SPEC VERIFIED",
    "UI-SPEC BLOCKED",
    "GAPS FILLED",
    "OPEN_THREATS",
    "SECURED",
    "ESCALATE",
    "UI REVIEW COMPLETE",
    "APPROVED",
    "BLOCKED",
    "GAPS FOUND",
    "HUMAN NEEDED",
    "VERIFICATION FAILED",
  ];
  return markers.filter((marker) => new RegExp(`(?:^|\\n)\\s*(?:#{1,3}\\s*)?${escapeRegExp(marker)}\\b`, "i").test(text));
}

function knownFields(text: string): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(Verification|Status|Outcome|Verdict):\s*(.+?)\s*$/i);
    if (match) fields.push([match[1], match[2]]);
  }
  return fields;
}

function normalizeSignal(value: string): string {
  return normalizeScalar(value.replace(/^#+\s*/, ""));
}

function normalizeScalar(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function numberField(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
