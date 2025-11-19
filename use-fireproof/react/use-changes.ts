import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangesOptions, ClockHead, DocTypes, DocWithId, Database } from "@fireproof/core-types-base";
import type { ChangesResult } from "./types.js";

/**
 * Implementation of the useChanges hook
 */
export function createUseChanges(database: Database) {
  return function useChanges<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): ChangesResult<T> {
    const [hydrated, setHydrated] = useState(false);
    const [result, setResult] = useState<Omit<ChangesResult<T>, "hydrated">>({
      docs: [],
    });

    const queryString = useMemo(() => JSON.stringify(opts), [opts]);
    const sinceString = useMemo(() => JSON.stringify(since), [since]);

    // Track request ID to prevent stale results from overwriting newer queries
    const requestIdRef = useRef(0);

    // Reset hydrated when dependencies change
    useEffect(() => {
      setHydrated(false);
      requestIdRef.current += 1;
    }, [sinceString, queryString]);

    const refreshRows = useCallback(async () => {
      const myReq = ++requestIdRef.current;
      const res = await database.changes<T>(since, opts);

      // Only update state if this is still the latest request
      if (myReq === requestIdRef.current) {
        setResult({ ...res, docs: res.rows.map((r) => r.value as DocWithId<T>) });
        setHydrated(true);
      }
    }, [database, since, opts, sinceString, queryString]);

    useEffect(() => {
      refreshRows(); // Initial data fetch
      return database.subscribe(refreshRows);
    }, [refreshRows]);

    return { ...result, hydrated };
  };
}
