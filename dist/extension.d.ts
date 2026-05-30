import { accessSync, rmSync, mkdirSync } from 'node:fs';
import { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Subdirectories under the pi-subagents temp root that may suffer ACL corruption.
 * Must mirror pi-subagents' async-subagent-results and async-subagent-runs.
 */
declare const TEMP_DIR_SUBDIRS: readonly ["async-subagent-results", "async-subagent-runs"];
/**
 * Builds the pi-subagents temp root path mirroring resolveTempScopeId logic.
 * Uses the same username sanitization regex as pi-subagents:
 * trim, replace non-alphanum/dot/dash/underscore with dash, strip leading/trailing dashes.
 * Falls back to "unknown" if sanitization produces an empty string.
 */
declare function buildPiSubagentsTempRoot(): string;
type GuardFs = {
    accessSync: typeof accessSync;
    rmSync: typeof rmSync;
    mkdirSync: typeof mkdirSync;
};
type GuardOptions = {
    /** Override the temp root path (defaults to buildPiSubagentsTempRoot()) */
    tempRoot?: string;
    /** Override filesystem operations (for testing ACL failure scenarios) */
    fs?: GuardFs;
};
/**
 * Best-effort guard that pre-cleans pi-subagents temp directories.
 * Checks accessibility of each temp subdir; if ACL-corrupted (EACCES/EPERM),
 * attempts rmSync + mkdirSync to repair. If repair also fails (ACL too severe
 * for non-elevated repair), sets a globalThis diagnostic flag.
 *
 * TIMING: This guard runs in the session_start handler, which fires AFTER
 * extensions are loaded. Pi's discoverAndLoadExtensions loads extensions in
 * filesystem-scanning order, not in a user-specified priority. This means
 * pi-subagents' own ensureAccessibleDir() has already run by the time this
 * guard executes.
 *
 * This is mitigated: pi-subagents (fork version) now catches EPERM/EACCES
 * in ensureAccessibleDir and falls back to pid-scoped paths. Our guard
 * serves as a cleanup step — repairing corrupted dirs for the current
 * session's file-watching, and preventing the corruption from blocking
 * the next session.
 *
 * Wraps all operations in try/catch so it never throws — a best-effort
 * guard that must not crash Pi.
 */
declare function guardPiSubagentsTempDirs(options?: GuardOptions): void;
declare function piGsdExtension(pi: ExtensionAPI): void;
declare function rewriteMessageForRuntime<T>(message: T, officialRoot: string): T;

export { type GuardFs, type GuardOptions, TEMP_DIR_SUBDIRS, buildPiSubagentsTempRoot, piGsdExtension as default, guardPiSubagentsTempDirs, rewriteMessageForRuntime };
