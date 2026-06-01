import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReconciliationBlocker } from "./types.js";

export interface StateFrontmatter {
  [key: string]: string | number | StateFrontmatter;
}

export type StateCurrentPosition = {
  phase?: string;
  phaseName?: string;
  phaseStatus?: string;
  plan?: number;
  totalPlans?: number;
  percent?: number;
};

export type StateDigest = {
  path: string;
  frontmatter: StateFrontmatter;
  currentPosition: StateCurrentPosition;
  blockers: ReconciliationBlocker[];
};

export function readStateDigest(basePath: string): StateDigest {
  const path = join(basePath, ".planning", "STATE.md");
  if (!existsSync(path)) {
    return {
      path,
      frontmatter: {},
      currentPosition: {},
      blockers: [metadataBlocker(path, "Missing STATE.md metadata file.")],
    };
  }

  const content = readFileSync(path, "utf8");
  return {
    path,
    frontmatter: parseFrontmatter(content),
    currentPosition: parseCurrentPosition(content),
    blockers: [],
  };
}

function parseFrontmatter(content: string): StateFrontmatter {
  const match = /^---\r?\n(?<body>[\s\S]*?)\r?\n---/.exec(content);
  if (!match?.groups) return {};

  const root: StateFrontmatter = {};
  let currentObject: StateFrontmatter | undefined;

  for (const rawLine of match.groups.body.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const nested = /^ {2}(?<key>[^:]+):\s*(?<value>.*)$/.exec(rawLine);
    if (nested?.groups && currentObject) {
      currentObject[nested.groups.key.trim()] = scalar(nested.groups.value.trim());
      continue;
    }

    currentObject = undefined;
    const top = /^(?<key>[^:]+):\s*(?<value>.*)$/.exec(rawLine);
    if (!top?.groups) continue;
    const key = top.groups.key.trim();
    const value = top.groups.value.trim();
    if (value === "") {
      const child: StateFrontmatter = {};
      root[key] = child;
      currentObject = child;
      continue;
    }
    root[key] = scalar(value);
  }

  return root;
}

function parseCurrentPosition(content: string): StateCurrentPosition {
  const section = currentPositionSection(content);
  const digest: StateCurrentPosition = {};

  for (const line of section.split(/\r?\n/)) {
    const phase = /^Phase:\s*(?<phase>\d+)(?:\s*\((?<name>[^)]+)\))?\s*(?:[\u2014-]\s*(?<status>.+))?\s*$/.exec(line.trim());
    if (phase?.groups) {
      digest.phase = phase.groups.phase.padStart(2, "0");
      if (phase.groups.name) digest.phaseName = phase.groups.name.trim();
      if (phase.groups.status) digest.phaseStatus = phase.groups.status.trim();
      continue;
    }

    const plan = /^Plan:\s*(?<current>\d+)\s+of\s+(?<total>\d+)/.exec(line.trim());
    if (plan?.groups) {
      digest.plan = Number(plan.groups.current);
      digest.totalPlans = Number(plan.groups.total);
      continue;
    }

    const progress = /^Progress:.*?(?<percent>\d+)%/.exec(line.trim());
    if (progress?.groups) digest.percent = Number(progress.groups.percent);
  }

  return digest;
}

function currentPositionSection(content: string): string {
  const match = /## Current Position\r?\n(?<body>[\s\S]*?)(?:\r?\n## |\s*$)/.exec(content);
  return match?.groups?.body ?? "";
}

function scalar(value: string): string | number {
  const unquoted = value.replace(/^["']|["']$/g, "");
  return /^\d+$/.test(unquoted) ? Number(unquoted) : unquoted;
}

function metadataBlocker(path: string, message: string): ReconciliationBlocker {
  return {
    reasonCode: "unknown-drift",
    artifact: "state",
    message: `${message} (${path})`,
    evidence: [{
      reasonCode: "unknown-drift",
      path,
      message,
    }],
    suggestedNextAction: "manual-review",
  };
}
