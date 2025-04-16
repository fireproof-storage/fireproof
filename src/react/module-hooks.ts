import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { 
  DocSet, 
  DocTypes, 
  DocWithId, 
  IndexKeyType, 
  IndexRow, 
  MapFn, 
  Database, 
  DocFragment, 
  ChangesOptions, 
  ClockHead 
} from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { deepClone } from "./utils.js";
import type { 
  DeleteDocFn, 
  StoreDocFn, 
  UseDocumentInitialDocOrFn, 
  UseDocumentResult,
  LiveQueryResult, 
  UseFireproof,
  UseFPConfig,
  ChangesResult
} from "./types.js";

/**
 * Base hook that returns a Fireproof database instance
 */
export function useFireproofDatabase(name: string | Database = "useFireproof", config: UseFPConfig = {}): Database {
  return useMemo(() => {
    return typeof name === "string" ? fireproof(name, config) : name;
  }, [name, JSON.stringify(config)]); // Stringify config to compare by value
}

/**
 * Document hook implementation - independent of useFireproof
 */
export function useFireproofDocument<T extends DocTypes>(
  database: Database,
  initialDocOrFn?: UseDocumentInitialDocOrFn<T>
): UseDocumentResult<T> {
  const updateHappenedRef = useRef(false);
  
  // Handle initial document
  const resolvedInitialDoc = useMemo(() => {
    let initialDoc: DocSet<T>;
    if (typeof initialDocOrFn === "function") {
      initialDoc = initialDocOrFn();
    } else {
      initialDoc = initialDocOrFn ?? ({} as T);
    }
    return initialDoc;
  }, []);
  
  const originalInitialDoc = useMemo(() => deepClone({ ...resolvedInitialDoc }), [resolvedInitialDoc]);
  const [doc, setDoc] = useState(resolvedInitialDoc);

  const refresh = useCallback(async () => {
    if (doc._id) {
      try {
        const gotDoc = await database.get<T>(doc._id);
        setDoc(gotDoc);
      } catch {
        setDoc(resolvedInitialDoc);
      }
    } else {
      setDoc(resolvedInitialDoc);
    }
  }, [doc._id, database, resolvedInitialDoc]);

  const save: StoreDocFn<T> = useCallback(
    async (existingDoc) => {
      updateHappenedRef.current = false;
      const toSave = existingDoc ?? doc;
      const res = await database.put(toSave);

      if (!updateHappenedRef.current && !doc._id && !existingDoc) {
        setDoc((d) => ({ ...d, _id: res.id }));
      }

      return res;
    },
    [doc, database],
  );

  const remove: DeleteDocFn<T> = useCallback(
    async (existingDoc) => {
      const id = existingDoc?._id ?? doc._id;
      if (!id) throw database.logger.Error().Msg(`Document must have an _id to be removed`).AsError();
      const gotDoc = await database.get<T>(id).catch(() => undefined);
      if (!gotDoc) throw database.logger.Error().Str("id", id).Msg(`Document not found`).AsError();
      const res = await database.del(id);
      setDoc(resolvedInitialDoc);
      return res;
    },
    [doc, resolvedInitialDoc, database],
  );

  // Granular update methods
  const merge = useCallback((newDoc: Partial<T>) => {
    updateHappenedRef.current = true;
    setDoc((prev) => ({ ...prev, ...newDoc }));
  }, []);

  const replace = useCallback((newDoc: T) => {
    updateHappenedRef.current = true;
    setDoc(newDoc);
  }, []);

  const reset = useCallback(() => {
    updateHappenedRef.current = true;
    setDoc({ ...originalInitialDoc });
  }, [originalInitialDoc]);

  // Legacy-compatible updateDoc
  const updateDoc = useCallback(
    (newDoc?: DocSet<T>, opts = { replace: false, reset: false }) => {
      if (!newDoc) {
        return opts.reset ? reset() : refresh();
      }
      return opts.replace ? replace(newDoc as T) : merge(newDoc);
    },
    [refresh, reset, replace, merge],
  );

  useEffect(() => {
    if (!doc._id) return;
    return database.subscribe((changes) => {
      if (updateHappenedRef.current) {
        return;
      }
      if (changes.find((c) => c._id === doc._id)) {
        void refresh();
      }
    }, true);
  }, [doc._id, refresh, database]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = useCallback(
    async (e?: Event) => {
      if (e?.preventDefault) e.preventDefault();
      await save();
      reset();
    },
    [save, reset],
  );

  // Primary Object API with both new and legacy methods
  const apiObject = {
    doc: { ...doc } as DocWithId<T>,
    merge,
    replace,
    reset,
    refresh,
    save,
    remove,
    submit,
  };

  // Make the object properly iterable
  const tuple = [{ ...doc }, updateDoc, save, remove, reset, refresh];
  Object.assign(apiObject, tuple);
  Object.defineProperty(apiObject, Symbol.iterator, {
    enumerable: false,
    value: function* () {
      yield* tuple;
    },
  });

  return apiObject as UseDocumentResult<T>;
}

/**
 * Live query hook implementation - independent of useFireproof
 */
export function useFireproofQuery<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
  database: Database,
  mapFn: MapFn<T> | string,
  query = {},
  initialRows: IndexRow<K, T, R>[] = [],
): LiveQueryResult<T, K, R> {
  const [result, setResult] = useState<LiveQueryResult<T, K, R>>({
    docs: initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
    rows: initialRows,
  });

  const queryString = useMemo(() => JSON.stringify(query), [query]);
  const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

  const refreshRows = useCallback(async () => {
    const res = await database.query<K, T, R>(mapFn, query);
    setResult({
      docs: res.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
      rows: res.rows,
    });
  }, [database, mapFnString, queryString]);

  useEffect(() => {
    refreshRows();
    const unsubscribe = database.subscribe(refreshRows);
    return () => {
      unsubscribe();
    };
  }, [database, refreshRows]);

  return result;
}

/**
 * AllDocs hook implementation - independent of useFireproof
 */
export function useFireproofAllDocs<T extends DocTypes>(
  database: Database,
  query = {},
  initialRows: IndexRow<string, T, T>[] = [],
) {
  return useFireproofQuery<T, string, T>(database, "_id", query, initialRows);
}

/**
 * Changes hook implementation - independent of useFireproof
 * Follows the same pattern as the original implementation
 */
export function useFireproofChanges<T extends DocTypes>(
  database: Database,
  since: ClockHead = [],
  opts: ChangesOptions = {}
): ChangesResult<T> {
  const [result, setResult] = useState<ChangesResult<T>>({
    docs: [],
  });

  const queryString = useMemo(() => JSON.stringify(opts), [opts]);
  const sinceString = useMemo(() => JSON.stringify(since), [since]);

  const refreshRows = useCallback(async () => {
    try {
      const res = await database.changes<T>(since, opts);
      setResult({ 
        ...res, 
        docs: res.rows.map((r) => r.value as DocWithId<T>) 
      });
    } catch {
      // Silently handle errors to match original behavior
    }
  }, [database, sinceString, queryString]);

  useEffect(() => {
    refreshRows(); // Initial data fetch
    return database.subscribe(refreshRows);
  }, [refreshRows]);

  return result;
}

// Non-hook factory function that creates hooks bound to a specific database
// This is NOT a hook - hooks rules don't apply
export function createFireproofHooks(database: Database): Omit<UseFireproof, 'database' | 'attach'> {
  return {
    // These are just functions that call the real hooks
    useDocument: <T extends DocTypes>(initialDocOrFn?: UseDocumentInitialDocOrFn<T>) => {
      return useFireproofDocument<T>(database, initialDocOrFn);
    },
    
    useLiveQuery: <T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
      mapFn: MapFn<T> | string,
      query = {},
      initialRows: IndexRow<K, T, R>[] = [],
    ) => {
      return useFireproofQuery<T, K, R>(database, mapFn, query, initialRows);
    },
    
    useAllDocs: <T extends DocTypes>(
      query = {},
      initialRows: IndexRow<string, T, T>[] = [],
    ) => {
      return useFireproofAllDocs<T>(database, query, initialRows);
    },
    
    // Match the original signature exactly
    useChanges: <T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}) => {
      return useFireproofChanges<T>(database, since, opts);
    }
  };
}
