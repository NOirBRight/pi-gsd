import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReconciliationBlocker, ReconciliationRepair } from "./types.js";

export type JournalState = {
  ok: boolean;
  path: string;
  journal?: {
    version: 1;
    snapshot: Record<string, unknown>;
    events: Array<Record<string, unknown>>;
  };
  blockers: ReconciliationBlocker[];
};

export function readJournalState(basePath: string): JournalState {
  const path = join(basePath, ".planning", "orchestration-state.json");
  if (!existsSync(path)) {
    return { ok: true, path, blockers: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isJournal(parsed)) {
      return blocked(path, "orchestration-state.json has an invalid journal shape.");
    }
    return { ok: true, path, journal: parsed, blockers: [] };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return blocked(path, `Failed to parse orchestration-state.json: ${detail}`);
  }
}

export function applyJournalMetadataRepair(content: string, repair: ReconciliationRepair): string {
  if (repair.action !== "update-journal-metadata") return content;
  if (!repair.before || !repair.after) throw new Error("Journal metadata repair requires before and after text.");
  const parsed = JSON.parse(content) as unknown;
  if (!isJournal(parsed)) throw new Error("Journal metadata repair target has an invalid journal shape.");
  if (!content.includes(repair.before)) return content;

  const next = content.replace(repair.before, repair.after);
  const reparsed = JSON.parse(next) as unknown;
  if (!isJournal(reparsed)) throw new Error("Journal metadata repair would create an invalid journal shape.");
  return next;
}

function isJournal(value: unknown): value is NonNullable<JournalState["journal"]> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { version?: unknown; snapshot?: unknown; events?: unknown };
  return candidate.version === 1
    && !!candidate.snapshot
    && typeof candidate.snapshot === "object"
    && Array.isArray(candidate.events);
}

function blocked(path: string, message: string): JournalState {
  return {
    ok: false,
    path,
    blockers: [{
      reasonCode: "unknown-drift",
      artifact: "journal",
      message: `${message} (${path})`,
      evidence: [{
        reasonCode: "unknown-drift",
        path,
        message,
      }],
      suggestedNextAction: "manual-review",
    }],
  };
}
