/**
 * Public types for the Settings Bridge.
 *
 * The Bridge reads the same effective GSD settings source as upstream
 * `gsd:settings` and exposes a lazy, mtime/hash-cached view for the Pi
 * extension and the native auto orchestrator.
 */

export type GsdConfigSourceKind = "explicit" | "active-workstream" | "planning-config" | "root-config" | "default" | "missing";

export type GsdConfigSource = {
  /** Absolute path on disk; undefined when no source is found. */
  path: string | undefined;
  /** Coarse-grained source classification (D-13). */
  kind: GsdConfigSourceKind;
  /** SHA-256 hash of the JSON content, lowercased hex. */
  hash: string | undefined;
  /** File mtime in milliseconds, or undefined for missing source. */
  mtimeMs: number | undefined;
  /** Resolved config object, or undefined for missing/unparseable source. */
  config: GsdSettingsJson | undefined;
  /** JSON parse/read error for an existing selected source. */
  parseError?: string;
};

export type GsdSettingsJson = {
  model_profile?: string;
  workflow?: Record<string, unknown>;
  model_overrides?: Record<string, string>;
  [key: string]: unknown;
};

export type ResolvedSettings = {
  source: GsdConfigSource;
  /** True when parsing failed and GSD callers must block. */
  parseError: string | undefined;
  /** Effective workflow settings derived from known safe scalar source keys. */
  workflow: Record<string, boolean | number | string | null>;
  /** Model profile and per-agent overrides from the source. */
  model: {
    profile: string | null;
    overrides: Record<string, string>;
  };
};

export type SettingsBridgeOptions = {
  cwd: string;
  configPath?: string;
  officialPackageName?: string;
  officialPackageVersion?: string;
};

export type NotificationKind = "info" | "warning" | "error";

export type SettingsBridgeNotification = {
  kind: NotificationKind;
  message: string;
  observedHash: string | undefined;
};

export type SettingsBridge = {
  refresh(): ResolvedSettings;
  current(): ResolvedSettings;
  isParseError(): boolean;
  ensureGsdSettingsReady(): ResolvedSettings;
  formatContext(): string;
  popNotifications(): SettingsBridgeNotification[];
  dispose(): void;
};
