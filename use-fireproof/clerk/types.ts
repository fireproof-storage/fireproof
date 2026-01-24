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

/**
 * Sync status for the cloud connection.
 * - idle: Not connected to cloud
 * - connecting: Initial connection in progress
 * - synced: Connected and syncing
 * - reconnecting: Refreshing connection (token refresh or recovery)
 * - error: Connection error
 */
export type SyncStatus = "idle" | "connecting" | "synced" | "reconnecting" | "error";

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
  /** Current sync status (more granular than isSyncing) */
  syncStatus: SyncStatus;
  /** Last sync error if any */
  lastSyncError?: Error;
}

export interface ClerkContextValue {
  config: ClerkCloudConfig;
  isSessionReady: boolean;
}
