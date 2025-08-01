import { useCallback, useEffect, useMemo, useState } from "react";
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
    const [result, setResult] = useState<LiveQueryResult<T, K, R>>({
      docs: initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
      rows: initialRows,
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);
    const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

    const refreshRows = useCallback(async () => {
      const res = await database.query<T, K, R>(mapFn, query);
      setResult(res);
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
