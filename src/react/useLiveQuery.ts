import { useCallback, useEffect, useMemo, useState } from "react";
import type { DocFragment, DocTypes, DocWithId, IndexKeyType, IndexRow, MapFn } from "@fireproof/core";
import type { Database } from "@fireproof/core";
import type { LiveQueryResult } from "./types.js";

/**
 * Implementation of the useLiveQuery hook
 */
export function createUseLiveQuery(database: Database) {
  return function useLiveQuery<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
    mapFn: MapFn<T> | string,
    query = {},
    initialRows: IndexRow<K, T, R>[] = [],
  ): LiveQueryResult<T, K, R> {
    const [result, setResult] = useState<LiveQueryResult<T, K, R>>(() => {
      const docs = initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r);
      return {
        rows: initialRows,
        docs,
        length: docs.length,
        map: (fn) => docs.map(fn),
        filter: (fn) => docs.filter(fn),
        forEach: (fn) => docs.forEach(fn),
        [Symbol.iterator]: () => docs[Symbol.iterator](),
      };
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);
    const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

    const refreshRows = useCallback(async () => {
      const res = await database.query<K, T, R>(mapFn, query);
      const docs = res.rows.map((r) => r.doc as DocWithId<T>).filter((r): r is DocWithId<T> => !!r);
      setResult({
        ...res,
        docs,
        length: docs.length,
        map: (fn) => docs.map(fn),
        filter: (fn) => docs.filter(fn),
        forEach: (fn) => docs.forEach(fn),
        [Symbol.iterator]: () => docs[Symbol.iterator](),
      });
    }, [mapFnString, queryString]);

    useEffect(() => {
      refreshRows(); // Initial data fetch
      return database.subscribe(refreshRows);
    }, [refreshRows]);

    return result;
  };
}
