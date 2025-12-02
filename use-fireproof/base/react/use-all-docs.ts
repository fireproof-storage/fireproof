import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AllDocsQueryOpts, DocTypes, DocWithId, Database } from "@fireproof/core-types-base";
import type { AllDocsResult } from "./types.js";

/**
 * Implementation of the useAllDocs hook
 */
export function createUseAllDocs(database: Database) {
  return function useAllDocs<T extends DocTypes>(query: Partial<AllDocsQueryOpts> = {}): AllDocsResult<T> {
    const [hydrated, setHydrated] = useState(false);
    const [result, setResult] = useState<Omit<AllDocsResult<T>, "hydrated">>({
      docs: [],
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);

    // Track request ID to prevent stale results from overwriting newer queries
    const requestIdRef = useRef(0);

    // Reset hydrated when query changes
    useEffect(() => {
      setHydrated(false);
      requestIdRef.current += 1;
    }, [queryString]);

    const refreshRows = useCallback(async () => {
      const myReq = ++requestIdRef.current;
      const res = await database.allDocs<T>(query);

      // Only update state if this is still the latest request
      if (myReq === requestIdRef.current) {
        setResult({
          ...res,
          docs: res.rows.map((r) => r.value as DocWithId<T>),
        });
        setHydrated(true);
      }
    }, [database, queryString]);

    useEffect(() => {
      refreshRows();
      const unsubscribe = database.subscribe(refreshRows);
      return () => {
        unsubscribe();
      };
    }, [database, refreshRows]);

    return { ...result, hydrated };
  };
}
