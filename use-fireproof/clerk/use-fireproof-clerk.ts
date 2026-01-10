import { useCallback, useEffect, useState, useRef } from "react";
import { useFireproof, type Database } from "use-fireproof";
import { toCloud } from "@fireproof/core-gateways-cloud";
import { ClerkTokenStrategy } from "./clerk-token-strategy.js";
import { useClerkFireproofContext } from "./clerk-provider.js";
import type { AttachState, UseFireproofClerkResult } from "./types.js";

/**
 * React hook that combines useFireproof with automatic Clerk-authenticated cloud sync.
 *
 * @param name - Database name
 * @returns UseFireproofClerkResult with database, hooks, and attach state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { database, useLiveQuery, attachState, isSyncing } = useFireproofClerk("my-db");
 *   const docs = useLiveQuery("_id");
 *
 *   return (
 *     <div>
 *       <p>Status: {isSyncing ? "Syncing" : "Offline"}</p>
 *       {docs.docs.map(doc => <div key={doc._id}>{doc._id}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFireproofClerk(name: string | Database): UseFireproofClerkResult {
  const { config, isSessionReady, dashApi } = useClerkFireproofContext();
  const [attachState, setAttachState] = useState<AttachState>({ status: "detached" });
  const attachingRef = useRef(false);

  // Use the base useFireproof hook
  const fpResult = useFireproof(name);
  const { database } = fpResult;

  const doAttach = useCallback(async () => {
    if (!dashApi || attachingRef.current || attachState.status === "attached") {
      return;
    }

    attachingRef.current = true;
    setAttachState({ status: "attaching" });

    try {
      const strategy = new ClerkTokenStrategy(dashApi, config.apiUrl);
      const appId = config.appIdPrefix
        ? `${config.appIdPrefix}-${typeof name === "string" ? name : name.name}`
        : `clerk-${typeof window !== "undefined" ? window.location.host : "app"}-${typeof name === "string" ? name : name.name}`;

      // Set appId in database context for the strategy to use
      database.ledger.ctx.set("appId", appId);

      const cloud = toCloud({
        strategy,
        dashboardURI: config.apiUrl,
        urls: { base: config.cloudUrl },
      });

      const attached = await database.attach(cloud);
      setAttachState({ status: "attached", attached });
    } catch (err) {
      setAttachState({
        status: "error",
        error: err instanceof Error ? err : new Error(String(err))
      });
    } finally {
      attachingRef.current = false;
    }
  }, [dashApi, database, config, name, attachState.status]);

  const doDetach = useCallback(async () => {
    if (attachState.status !== "attached" || !attachState.attached) {
      return;
    }
    try {
      await attachState.attached.detach();
      setAttachState({ status: "detached" });
    } catch (err) {
      setAttachState({
        status: "error",
        error: err instanceof Error ? err : new Error(String(err))
      });
    }
  }, [attachState]);

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

  return {
    ...fpResult,
    attachState,
    doAttach,
    doDetach,
    isSyncing: attachState.status === "attached",
  };
}
