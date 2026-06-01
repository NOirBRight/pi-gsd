import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReconciliationBlocker } from "./types.js";

export type RoadmapPhaseRow = {
  phase: string;
  title: string;
  milestone: string;
  plansComplete: number;
  totalPlans: number;
  status: string;
  completed?: string;
  path: string;
  line: number;
};

export type RoadmapState = {
  path: string;
  phases: RoadmapPhaseRow[];
  blockers: ReconciliationBlocker[];
};

export function readRoadmapState(basePath: string): RoadmapState {
  const path = join(basePath, ".planning", "ROADMAP.md");
  if (!existsSync(path)) {
    return {
      path,
      phases: [],
      blockers: [metadataBlocker("roadmap", path, "Missing ROADMAP.md metadata file.")],
    };
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const phases: RoadmapPhaseRow[] = [];

  for (const [index, line] of lines.entries()) {
    const cells = parseTableRow(line);
    if (!cells) continue;

    const phase = /^(?<phase>\d+)\.\s*(?<title>.+)$/.exec(cells[0]);
    const plans = /^(?<complete>\d+)\/(?<total>\d+)$/.exec(cells[2]);
    if (!phase?.groups || !plans?.groups) continue;

    phases.push({
      phase: phase.groups.phase.padStart(2, "0"),
      title: phase.groups.title.trim(),
      milestone: cells[1],
      plansComplete: Number(plans.groups.complete),
      totalPlans: Number(plans.groups.total),
      status: cells[3],
      completed: isBlankCompleted(cells[4]) ? undefined : cells[4],
      path,
      line: index + 1,
    });
  }

  return { path, phases, blockers: [] };
}

function parseTableRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  if (/^\|\s*-+/.test(trimmed)) return undefined;

  const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.length >= 5 ? cells : undefined;
}

function isBlankCompleted(value: string): boolean {
  return value === "" || value === "-" || value === "\u2014";
}

function metadataBlocker(artifact: "roadmap", path: string, message: string): ReconciliationBlocker {
  return {
    reasonCode: "unknown-drift",
    artifact,
    message: `${message} (${path})`,
    evidence: [{
      reasonCode: "unknown-drift",
      path,
      message,
    }],
    suggestedNextAction: "manual-review",
  };
}
