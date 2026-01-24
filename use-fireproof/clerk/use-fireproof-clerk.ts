import { useCallback, useEffect, useState, useRef } from "react";
import { useFireproof, type Database } from "use-fireproof";
import { toCloud } from "@fireproof/core-gateways-cloud";
import { ClerkTokenStrategy } from "./clerk-token-strategy.js";
import { useClerkFireproofContext } from "./clerk-provider.js";
import type { AttachState, SyncStatus, UseFireproofClerkResult } from "./types.js";

// Refresh token 5 minutes before expiry
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
// Minimum delay between refresh attempts (30 seconds)
const MIN_REFRESH_DELAY_MS = 30 * 1000;
// Delay before retrying after auth error (2 seconds)
const AUTH_ERROR_RETRY_DELAY_MS = 2 * 1000;
// Small cleanup delay after detach (100ms)
const DETACH_CLEANUP_DELAY_MS = 100;

/**
 * React hook that combines useFireproof with automatic Clerk-authenticated cloud sync.
 * Includes automatic token refresh to maintain persistent connections.
 *
 * @param name - Database name
 * @returns UseFireproofClerkResult with database, hooks, attach state, and sync status
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { database, useLiveQuery, attachState, syncStatus } = useFireproofClerk("my-db");
 *   const docs = useLiveQuery("_id");
 *
 *   return (
 *     <div>
 *       <p>Status: {syncStatus}</p>
 *       {docs.docs.map(doc => <div key={doc._id}>{doc._id}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFireproofClerk(name: string | Database): UseFireproofClerkResult {
  const { config, isSessionReady, dashApi } = useClerkFireproofContext();
  const [attachState, setAttachState] = useState<AttachState>({ status: "detached" });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncError, setLastSyncError] = useState<Error | undefined>(undefined);

  const attachingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strategyRef = useRef<ClerkTokenStrategy | null>(null);

  // Use the base useFireproof hook
  const fpResult = useFireproof(name);
  const { database } = fpResult;

  // Clear any pending refresh timer
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Schedule a token refresh based on expiry time
  const scheduleTokenRefresh = useCallback((expiryMs: number, doRefresh: () => void) => {
    clearRefreshTimer();

    const now = Date.now();
    const refreshAt = expiryMs - REFRESH_BEFORE_EXPIRY_MS;
    const delay = Math.max(refreshAt - now, MIN_REFRESH_DELAY_MS);

    refreshTimerRef.current = setTimeout(doRefresh, delay);
  }, [clearRefreshTimer]);

  // Perform a connection refresh cycle (detach, wait, reattach)
  const performRefreshCycle = useCallback(async () => {
    if (attachState.status !== "attached" || !attachState.attached || !dashApi) {
      return;
    }

    setSyncStatus("reconnecting");
    clearRefreshTimer();

    try {
      // Detach current connection
      await attachState.attached.detach();

      // Small delay for cleanup
      await new Promise(resolve => setTimeout(resolve, DETACH_CLEANUP_DELAY_MS));

      // Create fresh strategy and reconnect
      const strategy = new ClerkTokenStrategy(dashApi, config.apiUrl);
      strategyRef.current = strategy;

      const appId = config.appIdPrefix
        ? `${config.appIdPrefix}-${typeof name === "string" ? name : name.name}`
        : `clerk-${typeof window !== "undefined" ? window.location.host : "app"}-${typeof name === "string" ? name : name.name}`;

      database.ledger.ctx.set("appId", appId);

      const cloud = toCloud({
        strategy,
        urls: { base: config.cloudUrl },
      });

      const attached = await database.attach(cloud);

      // Schedule next refresh based on new token expiry
      const expiry = strategy.getLastTokenExpiry();
      if (expiry) {
        scheduleTokenRefresh(expiry, () => performRefreshCycle());
      }

      setAttachState({ status: "attached", attached });
      setSyncStatus("synced");
      setLastSyncError(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setSyncStatus("error");
      setLastSyncError(error);
      setAttachState({ status: "error", error });
    }
  }, [attachState, dashApi, config, name, database, clearRefreshTimer, scheduleTokenRefresh]);

  const doAttach = useCallback(async () => {
    if (!dashApi || attachingRef.current || attachState.status === "attached") {
      return;
    }

    attachingRef.current = true;
    setAttachState({ status: "attaching" });
    setSyncStatus("connecting");

    try {
      const strategy = new ClerkTokenStrategy(dashApi, config.apiUrl);
      strategyRef.current = strategy;

      const appId = config.appIdPrefix
        ? `${config.appIdPrefix}-${typeof name === "string" ? name : name.name}`
        : `clerk-${typeof window !== "undefined" ? window.location.host : "app"}-${typeof name === "string" ? name : name.name}`;

      // Set appId in database context for the strategy to use
      database.ledger.ctx.set("appId", appId);

      const cloud = toCloud({
        strategy,
        urls: { base: config.cloudUrl },
      });

      const attached = await database.attach(cloud);

      // Schedule proactive token refresh based on expiry
      const expiry = strategy.getLastTokenExpiry();
      if (expiry) {
        scheduleTokenRefresh(expiry, () => performRefreshCycle());
      }

      setAttachState({ status: "attached", attached });
      setSyncStatus("synced");
      setLastSyncError(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setSyncStatus("error");
      setLastSyncError(error);
      setAttachState({ status: "error", error });
    } finally {
      attachingRef.current = false;
    }
  }, [dashApi, database, config, name, attachState.status, scheduleTokenRefresh, performRefreshCycle]);

  const doDetach = useCallback(async () => {
    if (attachState.status !== "attached" || !attachState.attached) {
      return;
    }

    clearRefreshTimer();

    try {
      await attachState.attached.detach();
      setAttachState({ status: "detached" });
      setSyncStatus("idle");
    } catch (err) {
      setAttachState({
        status: "error",
        error: err instanceof Error ? err : new Error(String(err))
      });
      setSyncStatus("error");
    }
  }, [attachState, clearRefreshTimer]);

  // Auto-attach when session becomes ready
  useEffect(() => {
    if (isSessionReady && dashApi && attachState.status === "detached") {
      doAttach();
    }
  }, [isSessionReady, dashApi, attachState.status, doAttach]);

  // Auto-detach when session ends
  useEffect(() => {
    if (!isSessionReady && attachState.status === "attached") {
      doDetach();
    }
  }, [isSessionReady, attachState.status, doDetach]);

  // Handle page visibility changes - refresh if token may have expired while hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        attachState.status === "attached" &&
        strategyRef.current
      ) {
        const expiry = strategyRef.current.getLastTokenExpiry();
        if (expiry && Date.now() > expiry - REFRESH_BEFORE_EXPIRY_MS) {
          // Token is close to or past expiry, refresh now
          performRefreshCycle();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [attachState.status, performRefreshCycle]);

  // Reactive error recovery - auto-retry on auth-related errors
  useEffect(() => {
    if (attachState.status === "error" && attachState.error && isSessionReady) {
      const msg = attachState.error.message.toLowerCase();
      const isAuthError =
        msg.includes("timeout") ||
        msg.includes("auth") ||
        msg.includes("token") ||
        msg.includes("expired") ||
        msg.includes("unauthorized");

      if (isAuthError) {
        const timer = setTimeout(() => {
          // Reset to detached to trigger auto-attach
          setAttachState({ status: "detached" });
          setSyncStatus("idle");
        }, AUTH_ERROR_RETRY_DELAY_MS);
        return () => clearTimeout(timer);
      }
    }
  }, [attachState, isSessionReady]);

  // Cleanup refresh timer on unmount
  useEffect(() => {
    return () => {
      clearRefreshTimer();
    };
  }, [clearRefreshTimer]);

  return {
    ...fpResult,
    attachState,
    doAttach,
    doDetach,
    isSyncing: attachState.status === "attached",
    syncStatus,
    lastSyncError,
  };
}
