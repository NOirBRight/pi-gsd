export type {
  GsdConfigSource,
  GsdConfigSourceKind,
  GsdSettingsJson,
  ResolvedSettings,
  SettingsBridge,
  SettingsBridgeNotification,
  SettingsBridgeOptions,
  NotificationKind,
} from "./types.js";

export { resolveGsdConfigSource, inferGsdConfigWritePath } from "./source.js";
export { SettingsBridgeCache } from "./cache.js";
export { formatSettingsContext } from "./format.js";

import { SettingsBridgeCache } from "./cache.js";
import type { SettingsBridge, SettingsBridgeOptions } from "./types.js";

/**
 * Factory matching the plan's `createSettingsBridge` API. Wraps the cache
 * with a thin facade so callers don't import the class directly.
 */
export function createSettingsBridge(options: SettingsBridgeOptions): SettingsBridge {
  return new SettingsBridgeCache(options);
}
