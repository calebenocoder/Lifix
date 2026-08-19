import { isTauri } from "@tauri-apps/api/core";

export type RuntimeKind = "web" | "tauri";
export type PlatformStatus = "ready";

export interface RuntimeProbe {
  isTauri(): boolean;
}

export interface PlatformRuntime {
  readonly kind: RuntimeKind;
  readonly status: PlatformStatus;
}

const tauriProbe: RuntimeProbe = { isTauri };

/**
 * Centralized environment detection. UI and core receive this neutral result,
 * never direct Tauri globals or APIs.
 */
export function createPlatformRuntime(probe: RuntimeProbe = tauriProbe): PlatformRuntime {
  return {
    kind: probe.isTauri() ? "tauri" : "web",
    status: "ready",
  };
}
