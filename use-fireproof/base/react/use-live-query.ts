import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocFragment, DocTypes, DocWithId, IndexKeyType, FPIndexRow, MapFn, Database } from "@fireproof/core-types-base";
import type { LiveQueryResult } from "./types.js";

/**
 * Implementation of the useLiveQuery hook
 */
export function createUseLiveQuery(database: Database) {
  return function useLiveQuery<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
    mapFn: MapFn<T> | string,
    query = {},
    initialRows: FPIndexRow<K, T, R>[] = [],
  ): LiveQueryResult<T, K, R> {
    const [hydrated, setHydrated] = useState(false);
    const [result, setResult] = useState<Omit<LiveQueryResult<T, K, R>, "hydrated">>({
      docs: initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
      rows: initialRows,
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);
    const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

    // Track request ID to prevent stale results from overwriting newer queries
    const requestIdRef = useRef(0);

    // Reset hydrated when query dependencies change
    useEffect(() => {
      setHydrated(false);
      requestIdRef.current += 1;
    }, [mapFnString, queryString]);

    const refreshRows = useCallback(async () => {
      const myReq = ++requestIdRef.current;
      const res = await database.query<T, K, R>(mapFn, { ...query, includeDocs: true });

      // Only update state if this is still the latest request
      if (myReq === requestIdRef.current) {
        setResult(res);
        setHydrated(true);
      }
    }, [database, mapFn, query, mapFnString, queryString]);

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
