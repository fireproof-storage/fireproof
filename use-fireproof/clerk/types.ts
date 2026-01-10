import type { Attached, Database } from "@fireproof/core-types-base";
import type { UseFireproof } from "use-fireproof";

export interface ClerkCloudConfig {
  /** Dashboard API URL */
  apiUrl: string;
  /** Cloud WebSocket URL (fpcloud://...) */
  cloudUrl: string;
  /** Optional app ID prefix, defaults to window.location.host */
  appIdPrefix?: string;
}

export type AttachStatus = "detached" | "attaching" | "attached" | "error";

export interface AttachState {
  status: AttachStatus;
  attached?: Attached;
  error?: Error;
}

export interface UseFireproofClerkResult extends UseFireproof {
  /** Current attachment state */
  attachState: AttachState;
  /** Manually trigger attach to cloud */
  doAttach: () => Promise<void>;
  /** Manually trigger detach from cloud */
  doDetach: () => Promise<void>;
  /** Whether currently syncing with cloud */
  isSyncing: boolean;
}

export interface ClerkContextValue {
  config: ClerkCloudConfig;
  isSessionReady: boolean;
}
