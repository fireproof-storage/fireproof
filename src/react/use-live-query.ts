import { useCallback, useEffect, useMemo, useState } from "react";
import type { DocFragment, DocTypes, DocWithId, IndexKeyType, IndexRow, MapFn, Database } from "@fireproof/core";
import type { LiveQueryResult } from "./types.js";

// Internal shadow type for array-like behavior (implementation detail)
type EnhancedQueryResult<T extends DocTypes, K extends IndexKeyType, R extends DocFragment = T> = LiveQueryResult<T, K, R> &
  DocWithId<T>[];

/**
 * Implementation of the useLiveQuery hook
 */
export function createUseLiveQuery(database: Database) {
  return function useLiveQuery<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
    mapFn: MapFn<T> | string,
    query = {},
    initialRows: IndexRow<K, T, R>[] = [],
  ): LiveQueryResult<T, K, R> {
    const [result, setResult] = useState<EnhancedQueryResult<T, K, R>>(() => {
      const docs = initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r);
      return Object.assign(docs, {
        docs,
        rows: initialRows,
      });
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);
    const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

    const refreshRows = useCallback(async () => {
      const res = await database.query<K, T, R>(mapFn, query);
      const docs = res.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r);
      setResult(Object.assign(docs, {
        docs,
        rows: res.rows,
      }));
    }, [database, mapFnString, queryString]);

    useEffect(() => {
      refreshRows();
      const unsubscribe = database.subscribe(refreshRows);
      return () => {
        unsubscribe();
      };
    }, [database, refreshRows]);

    return result;
  };
}
