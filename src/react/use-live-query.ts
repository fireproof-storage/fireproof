import { useCallback, useEffect, useMemo, useState } from "react";
import type { DocFragment, DocTypes, DocWithId, IndexKeyType, IndexRow, MapFn, Database } from "@fireproof/core";
import type { ArrayLikeQueryResult } from "./types.js";

/**
 * Implementation of the useLiveQuery hook
 */
export function createUseLiveQuery(database: Database) {
  return function useLiveQuery<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
    mapFn: MapFn<T> | string,
    query = {},
    initialRows: IndexRow<K, T, R>[] = [],
  ): ArrayLikeQueryResult<T, K, R> {
    const [result, setResult] = useState<ArrayLikeQueryResult<T, K, R>>(() => {
      const docs = initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r);
      return Object.assign(
        {
          docs,
          rows: initialRows,
          length: docs.length,
          [Symbol.iterator]: () => docs[Symbol.iterator](),
          map: <U>(fn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => U) => docs.map(fn),
          filter: (fn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => boolean) => docs.filter(fn),
          forEach: (fn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => void) => docs.forEach(fn),
        },
        docs,
      );
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);
    const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

    const refreshRows = useCallback(async () => {
      const res = await database.query<K, T, R>(mapFn, query);
      const docs = res.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r);
      setResult(
        Object.assign(
          {
            docs,
            rows: res.rows,
            length: docs.length,
            [Symbol.iterator]: () => docs[Symbol.iterator](),
            map: <U>(fn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => U) => docs.map(fn),
            filter: (fn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => boolean) => docs.filter(fn),
            forEach: (fn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => void) => docs.forEach(fn),
          },
          docs,
        ),
      );
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
