import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, relative } from "node:path";
import type { JournalAdapter, OrchestrationEvent, OrchestrationSnapshot, OrchestratorResult } from "./types.js";

export const DEFAULT_JOURNAL_PATH = ".planning/orchestration-state.json";

export type JournalEvent = Partial<OrchestrationEvent> & Record<string, unknown>;

export type OrchestrationJournal = {
  version: 1;
  snapshot: OrchestrationSnapshot;
  events: JournalEvent[];
};

export type JournalReadResult = {
  ok: boolean;
  messages: string[];
  journal?: OrchestrationJournal;
};

export type JournalWriteResult = OrchestratorResult & {
  written: string[];
};

export type JournalOptions = {
  cwd: string;
  journalPath?: string;
};

export type JournalSnapshotOptions = JournalOptions & {
  snapshot: OrchestrationSnapshot;
};

export type JournalEventOptions = JournalSnapshotOptions & {
  event: JournalEvent;
};

const allowedEventKeys = new Set(["type", "event", "ts", "phase", "unitId", "status", "attempt", "reason", "resumeHint", "evidence", "recoveryDecision", "exitReason", "action", "recoveryClass", "reasonCode", "root", "branch", "paths", "written", "message", "host", "pid"]);
const unsafeEventKeys = new Set(["prompt", "userText", "env", "token", "secret", "password", "apiKey", "api_key", "authorization", "bearer", "args", "arguments", "rawArgs"]);
const safeMetadataKeys = new Set(["setting", "source", "label", "safe"]);
const secretPattern = /(?:password|secret|token|api[_-]?key|authorization|bearer)/i;
const maxStringLength = 240;
const maxEvidenceItems = 20;

export function createJournalAdapter(options: JournalOptions): JournalAdapter {
  return {
    append(event, snapshot) {
      return appendJournalEvent({ ...options, event, snapshot });
    },
    read() {
      const result = readJournal(options);
      if (!result.journal) return result as ReturnType<NonNullable<JournalAdapter["read"]>>;
      return {
        ...result,
        journal: {
          snapshot: result.journal.snapshot,
          events: result.journal.events as OrchestrationEvent[],
        },
      };
    },
  };
}

export function readJournal(options: JournalOptions): JournalReadResult {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages };

  if (!existsSync(resolved.path)) {
    return { ok: true, messages: ["orchestration journal not found"] };
  }

  try {
    const parsed = JSON.parse(readFileSync(resolved.path, "utf8")) as unknown;
    const journal = normalizeJournal(parsed);
    if (!journal) {
      return { ok: false, messages: ["orchestration journal is invalid"] };
    }
    return { ok: true, messages: ["orchestration journal read"], journal };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal read failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export function writeJournalSnapshot(options: JournalSnapshotOptions): JournalWriteResult {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages, written: [] };

  const existing = readJournal(options);
  if (!existing.ok) return { ok: false, messages: existing.messages, written: [] };
  const events = existing.journal ? existing.journal.events : [];
  return writeJournal(resolved.path, { version: 1, snapshot: redactSnapshot(options.snapshot), events });
}

export function appendJournalEvent(options: JournalEventOptions): JournalWriteResult {
  const resolved = resolveJournalPath(options);
  if (!resolved.ok) return { ok: false, messages: resolved.messages, written: [] };

  const existing = readJournal(options);
  if (!existing.ok) return { ok: false, messages: existing.messages, written: [] };
  const events = existing.journal ? existing.journal.events : [];
  const journal: OrchestrationJournal = {
    version: 1,
    snapshot: redactSnapshot(options.snapshot),
    events: [...events, redactJournalEvent(options.event)],
  };
  return writeJournal(resolved.path, journal);
}

export function redactSnapshot(snapshot: OrchestrationSnapshot): OrchestrationSnapshot {
  return {
    ...snapshot,
    currentUnit: snapshot.currentUnit ? redactUnit(snapshot.currentUnit) : undefined,
    remainingUnits: snapshot.remainingUnits.map(redactUnit),
    lastEvent: snapshot.lastEvent ? redactJournalEvent(snapshot.lastEvent) as OrchestrationEvent : undefined,
    resumeHint: snapshot.resumeHint ? safeString(snapshot.resumeHint) : undefined,
  };
}

export function redactJournalEvent(event: JournalEvent): JournalEvent {
  const redacted: JournalEvent = {};

  for (const [key, value] of Object.entries(event)) {
    if (unsafeEventKeys.has(key) || !allowedEventKeys.has(key)) {
      continue;
    }

    if (key === "evidence") {
      const evidence = Array.isArray(value) ? value : [];
      redacted.evidence = evidence.filter((item): item is string => typeof item === "string").slice(0, maxEvidenceItems).map(safeString);
      continue;
    }

    if (key === "recoveryDecision") {
      const recoveryDecision = sanitizeRecoveryDecision(value);
      if (recoveryDecision) redacted.recoveryDecision = recoveryDecision as JournalEvent["recoveryDecision"];
      continue;
    }

    if (key === "paths" || key === "written") {
      const values = Array.isArray(value) ? value : [];
      redacted[key] = values.filter((item): item is string => typeof item === "string").slice(0, maxEvidenceItems).map(safeString);
      continue;
    }

    if (typeof value === "string") {
      redacted[key] = safeString(value);
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      redacted[key] = value;
    }
  }

  return redacted;
}

function sanitizeRecoveryDecision(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of ["class", "action", "reasonCode", "message", "remediation"] as const) {
    const item = input[key];
    if (typeof item === "string") output[key] = safeString(item);
  }
  const evidence = input.evidence;
  if (evidence && typeof evidence === "object") {
    const source = evidence as Record<string, unknown>;
    const safeEvidence: Record<string, unknown> = {};
    for (const key of ["reasonCode", "unitId", "unitType", "phase", "branch", "expectedBranch", "root", "expectedProjectRoot", "actualCwd", "resolvedUnitRoot"] as const) {
      const item = source[key];
      if (typeof item === "string") safeEvidence[key] = safeString(item);
    }
    for (const key of ["paths", "messages"] as const) {
      const item = source[key];
      if (Array.isArray(item)) safeEvidence[key] = item.filter((entry): entry is string => typeof entry === "string").slice(0, maxEvidenceItems).map(safeString);
    }
    const written = source.written;
    if (Array.isArray(written)) safeEvidence.written = written.slice(0, maxEvidenceItems).map(sanitizeWrittenEvidence).filter((entry): entry is Record<string, string> => Boolean(entry));
    output.evidence = safeEvidence;
  }
  return output;
}

function sanitizeWrittenEvidence(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const key of ["path", "action", "reasonCode", "kind"] as const) {
    const item = input[key];
    if (typeof item === "string") output[key] = safeString(item);
  }
  return Object.keys(output).length ? output : undefined;
}

function redactUnit(unit: OrchestrationSnapshot["remainingUnits"][number]) {
  if (!unit.metadata) return unit;
  const metadata: NonNullable<typeof unit.metadata> = {};
  for (const [key, value] of Object.entries(unit.metadata)) {
    if (unsafeEventKeys.has(key) || !safeMetadataKeys.has(key)) continue;
    metadata[key] = typeof value === "string" ? safeString(value) : value;
  }
  return { ...unit, metadata };
}

function writeJournal(path: string, journal: OrchestrationJournal): JournalWriteResult {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
    return { ok: true, messages: ["orchestration journal written"], written: [path], snapshot: journal.snapshot, status: journal.snapshot ? undefined : undefined };
  } catch (error) {
    return { ok: false, messages: [`orchestration journal write failed: ${error instanceof Error ? error.message : String(error)}`], written: [] };
  }
}

function resolveJournalPath(options: JournalOptions): { ok: true; path: string } | { ok: false; messages: string[] } {
  const cwd = resolve(options.cwd);
  const planningDir = resolve(cwd, ".planning");
  const candidate = resolve(cwd, options.journalPath ?? DEFAULT_JOURNAL_PATH);

  if (!isInsideOrSame(planningDir, candidate)) {
    return { ok: false, messages: [`refusing orchestration journal path outside .planning: ${candidate}`] };
  }

  return { ok: true, path: candidate };
}

function isInsideOrSame(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeJournal(value: unknown): OrchestrationJournal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { version?: unknown; snapshot?: unknown; events?: unknown };
  if (candidate.version !== 1) return undefined;
  if (!candidate.snapshot || typeof candidate.snapshot !== "object") return undefined;
  if (!Array.isArray(candidate.events)) return undefined;
  return {
    version: 1,
    snapshot: redactSnapshot(candidate.snapshot as OrchestrationSnapshot),
    events: candidate.events.map((event) => redactJournalEvent(event && typeof event === "object" ? event as JournalEvent : {})),
  };
}

function safeString(value: string): string {
  return secretPattern.test(value) ? "[REDACTED]" : truncate(value);
}

function truncate(value: string): string {
  return value.length <= maxStringLength ? value : `${value.slice(0, maxStringLength)}…`;
}
