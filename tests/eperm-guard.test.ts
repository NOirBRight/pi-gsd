import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import {
	guardPiSubagentsTempDirs,
	buildPiSubagentsTempRoot,
	TEMP_DIR_SUBDIRS,
} from "../src/extension.js";
import { checkPiSubagentsTempAcl } from "../src/doctor.js";

describe("buildPiSubagentsTempRoot", () => {
	it("returns a path containing 'pi-subagents-user-'", () => {
		const result = buildPiSubagentsTempRoot();
		expect(result).toContain("pi-subagents-user-");
	});

	it("includes the sanitized username", () => {
		const username = os.userInfo().username;
		const sanitized = username.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
		const result = buildPiSubagentsTempRoot();
		expect(result).toContain(sanitized);
	});
});

describe("TEMP_DIR_SUBDIRS", () => {
	it("contains the expected subdirectory names", () => {
		expect(TEMP_DIR_SUBDIRS).toContain("async-subagent-results");
		expect(TEMP_DIR_SUBDIRS).toContain("async-subagent-runs");
		expect(TEMP_DIR_SUBDIRS).toHaveLength(2);
	});
});

describe("guardPiSubagentsTempDirs", () => {
	afterEach(() => {
		delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;
	});

	it("returns without error when temp dirs are accessible", () => {
		const mockFs = {
			accessSync: () => {},
			rmSync: () => {},
			mkdirSync: () => undefined as string | undefined,
		};
		const result = guardPiSubagentsTempDirs({ tempRoot: "/tmp/test", fs: mockFs });
		expect(result).toBeUndefined();
	});

	it("attempts rmSync+mkdirSync when accessSync fails with EACCES", () => {
		const rmCalls: string[] = [];
		const mkdirCalls: string[] = [];
		const mockFs = {
			accessSync: () => {
				const err = new Error("EACCES: permission denied") as Error & { code: string };
				err.code = "EACCES";
				throw err;
			},
			rmSync: (...args: any[]) => { rmCalls.push(args[0]); },
			mkdirSync: (...args: any[]) => { mkdirCalls.push(args[0]); return undefined as string | undefined; },
		};

		guardPiSubagentsTempDirs({ tempRoot: "/tmp/test", fs: mockFs });

		expect(rmCalls.length).toBeGreaterThan(0);
		expect(mkdirCalls.length).toBeGreaterThan(0);
	});

	it("sets globalThis.__piSubagentsTempAclBroken when repair also fails", () => {
		delete (globalThis as Record<string, unknown>).__piSubagentsTempAclBroken;

		const mockFs = {
			accessSync: () => {
				const err = new Error("EACCES: permission denied") as Error & { code: string };
				err.code = "EACCES";
				throw err;
			},
			rmSync: () => {
				throw new Error("EACCES: cannot delete") as Error & { code: string };
			},
			mkdirSync: () => {
				throw new Error("EACCES: cannot create") as Error & { code: string };
			},
		};

		guardPiSubagentsTempDirs({ tempRoot: "/tmp/test", fs: mockFs });

		expect((globalThis as Record<string, unknown>).__piSubagentsTempAclBroken).toBe(true);
	});

	it("does not throw when ACL repair fails (best-effort, never crashes Pi)", () => {
		const mockFs = {
			accessSync: () => {
				throw new Error("EACCES: permission denied") as Error & { code: string };
			},
			rmSync: () => {
				throw new Error("EACCES: cannot delete") as Error & { code: string };
			},
			mkdirSync: () => {
				throw new Error("EACCES: cannot create") as Error & { code: string };
			},
		};

		expect(() => guardPiSubagentsTempDirs({ tempRoot: "/tmp/test", fs: mockFs })).not.toThrow();
	});
});

describe("checkPiSubagentsTempAcl", () => {
	it("reports ok when dirs are accessible", () => {
		const mockFs = {
			accessSync: () => {},
		};
		const result = checkPiSubagentsTempAcl({ tempRoot: "/tmp/test", fs: mockFs });
		expect(result.ok).toBe(true);
		expect(result.messages.join("\n")).toContain("ok");
	});

	it("reports CORRUPTED when accessSync throws EACCES", () => {
		const mockFs = {
			accessSync: () => {
				const err = new Error("EACCES: permission denied") as Error & { code: string };
				err.code = "EACCES";
				throw err;
			},
		};
		const result = checkPiSubagentsTempAcl({ tempRoot: "/tmp/test", fs: mockFs });
		expect(result.ok).toBe(false);
		expect(result.messages.join("\n")).toContain("CORRUPTED");
	});

	it("continues checking even when ACL check fails (non-blocking)", () => {
		const mockFs = {
			accessSync: () => {
				const err = new Error("EACCES: permission denied") as Error & { code: string };
				err.code = "EACCES";
				throw err;
			},
		};
		const result = checkPiSubagentsTempAcl({ tempRoot: "/tmp/test", fs: mockFs });
		expect(result).toBeDefined();
		expect(result.ok).toBe(false);
		expect(result.messages.length).toBeGreaterThan(0);
	});
});