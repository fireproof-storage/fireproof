import { useCallback, useEffect, useState, useRef } from "react";
import { useFireproof, type Database, type UseFPConfig } from "use-fireproof";
import { toCloud } from "@fireproof/core-gateways-cloud";
import { ClerkTokenStrategy } from "./clerk-token-strategy.js";
import { useClerkFireproofContext } from "./clerk-provider.js";
import type { AttachState, SyncStatus, UseFireproofClerkResult } from "./types.js";

// Refresh token 5 minutes before expiry
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
// Minimum delay between refresh attempts (30 seconds)
const MIN_REFRESH_DELAY_MS = 30 * 1000;
// Base delay before retrying after error (2 seconds, doubles each retry)
const BASE_RETRY_DELAY_MS = 2 * 1000;
// Maximum delay between retries (30 seconds)
const MAX_RETRY_DELAY_MS = 30 * 1000;
// Maximum number of retries before giving up (resets on tab return)
const MAX_RETRY_COUNT = 8;
// Small cleanup delay after detach (100ms)
const DETACH_CLEANUP_DELAY_MS = 100;
// Interval for polling database after attach to kick CRDT processing (2 seconds)
const SYNC_POLL_INTERVAL_MS = 2000;
// Stop early once doc count is stable for this many consecutive polls
const SYNC_STABLE_THRESHOLD = 3;
// Hard ceiling — stop polling regardless (20 seconds)
const SYNC_POLL_MAX_MS = 20 * 1000;

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
export function useFireproofClerk(name: string | Database, fpConfig?: UseFPConfig): UseFireproofClerkResult {
  const { config, isSessionReady, dashApi } = useClerkFireproofContext();
  const [attachState, setAttachState] = useState<AttachState>({ status: "detached" });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncError, setLastSyncError] = useState<Error | undefined>(undefined);
  const [ledgerId, setLedgerId] = useState<string | null>(null);

  const attachingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strategyRef = useRef<ClerkTokenStrategy | null>(null);
  const retryCountRef = useRef(0);
  const attachStateRef = useRef<AttachState>(attachState);

  // Keep ref in sync with state
  useEffect(() => { attachStateRef.current = attachState; }, [attachState]);

  // Use the base useFireproof hook
  const fpResult = useFireproof(name, fpConfig);
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
    const currentState = attachStateRef.current;
    if (currentState.status !== "attached" || !currentState.attached || !dashApi) {
      return;
    }

    setSyncStatus("reconnecting");
    clearRefreshTimer();

    try {
      // Detach current connection
      await currentState.attached.detach();

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

      retryCountRef.current = 0;
      setLedgerId(strategy.getLedgerId());
      setAttachState({ status: "attached", attached });
      setSyncStatus("synced");
      setLastSyncError(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setSyncStatus("error");
      setLastSyncError(error);
      setAttachState({ status: "error", error });
    }
  }, [dashApi, config, name, database, clearRefreshTimer, scheduleTokenRefresh]);

  const doAttach = useCallback(async () => {
    if (!dashApi || attachingRef.current || attachStateRef.current.status === "attached") {
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

      retryCountRef.current = 0;
      setLedgerId(strategy.getLedgerId());
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
  }, [dashApi, database, config, name, scheduleTokenRefresh, performRefreshCycle]);

  const doDetach = useCallback(async () => {
    const currentState = attachStateRef.current;
    if (currentState.status !== "attached" || !currentState.attached) {
      return;
    }

    clearRefreshTimer();
    retryCountRef.current = 0;

    try {
      await currentState.attached.detach();
      setAttachState({ status: "detached" });
      setSyncStatus("idle");
    } catch (err) {
      setAttachState({
        status: "error",
        error: err instanceof Error ? err : new Error(String(err))
      });
      setSyncStatus("error");
    }
  }, [clearRefreshTimer]);

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

  // Handle page visibility changes - refresh if token may have expired while hidden,
  // or reset retry budget if returning from background while in error state
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const currentStatus = attachStateRef.current.status;

      if (currentStatus === "attached" && strategyRef.current) {
        const expiry = strategyRef.current.getLastTokenExpiry();
        if (expiry && Date.now() > expiry - REFRESH_BEFORE_EXPIRY_MS) {
          // Token is close to or past expiry, refresh now
          performRefreshCycle();
        }
      } else if (currentStatus === "error") {
        // User returned to tab while in error state — reset retry budget
        // and trigger a fresh attach cycle
        console.debug("[fireproof-clerk] Tab visible with error state, resetting retry budget");
        retryCountRef.current = 0;
        setAttachState({ status: "detached" });
        setSyncStatus("idle");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [performRefreshCycle]);

  // Reactive error recovery - auto-retry ALL errors with exponential backoff
  useEffect(() => {
    if (attachState.status !== "error" || !isSessionReady) return;

    if (retryCountRef.current >= MAX_RETRY_COUNT) {
      console.debug(
        `[fireproof-clerk] Max retries (${MAX_RETRY_COUNT}) reached, waiting for tab switch to reset`
      );
      return;
    }

    const delay = Math.min(
      BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current),
      MAX_RETRY_DELAY_MS
    );
    retryCountRef.current += 1;

    console.debug(
      `[fireproof-clerk] Retry ${retryCountRef.current}/${MAX_RETRY_COUNT} in ${delay}ms`,
      attachState.error?.message
    );

    const timer = setTimeout(() => {
      // Reset to detached to trigger auto-attach
      setAttachState({ status: "detached" });
      setSyncStatus("idle");
    }, delay);
    return () => clearTimeout(timer);
  }, [attachState, isSessionReady]);

  // Workaround: kick the CRDT to process sync data after initial attach.
  // database.attach() resolves when the WebSocket connects, but historical data
  // streams in asynchronously. The streamed metadata isn't processed until
  // something queries the database, so useLiveQuery (which only re-queries on
  // subscription events) never sees the data. A periodic allDocs() call forces
  // the CRDT to process pending metadata, advancing the clock and triggering
  // subscriptions. Once the document count stabilizes, sync has caught up and
  // real-time updates flow through the normal subscription path — no more
  // polling needed.
  useEffect(() => {
    if (attachState.status !== "attached") return;

    let stopped = false;
    let lastCount = -1;
    let stableRuns = 0;

    const poll = async () => {
      if (stopped) return;
      try {
        const { rows } = await database.allDocs();
        const count = rows.length;

        if (count === lastCount) {
          stableRuns++;
          if (stableRuns >= SYNC_STABLE_THRESHOLD) {
            console.debug("[fireproof-clerk] Initial sync settled, polling stopped");
            stopped = true;
            return;
          }
        } else {
          stableRuns = 0;
        }
        lastCount = count;
      } catch {
        // ignore polling errors
      }
      if (!stopped) {
        setTimeout(poll, SYNC_POLL_INTERVAL_MS);
      }
    };

    // Start after a brief delay to let the first metadata packet arrive
    const startTimer = setTimeout(poll, SYNC_POLL_INTERVAL_MS);

    // Hard ceiling — stop regardless
    const maxTimer = setTimeout(() => {
      if (!stopped) {
        console.debug("[fireproof-clerk] Sync poll hit max duration, stopping");
        stopped = true;
      }
    }, SYNC_POLL_MAX_MS);

    return () => {
      stopped = true;
      clearTimeout(startTimer);
      clearTimeout(maxTimer);
    };
  }, [attachState.status, database]);

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
    ledgerId,
  };
}
