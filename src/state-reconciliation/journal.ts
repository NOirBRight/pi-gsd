import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReconciliationBlocker } from "./types.js";

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
