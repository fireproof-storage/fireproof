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
  ClockHead,
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
  ChangesResult,
} from "./types.js";

/**
 * Base hook that returns a Fireproof database instance
 * This is a drop-in replacement for the standard useFireproof hook
 */
export function useFireproofDatabase(name: string | Database = "useFireproof", config: UseFPConfig = {}): Database {
  return useMemo(() => {
    return typeof name === "string" ? fireproof(name, config) : name;
  }, [name, JSON.stringify(config)]); // Stringify config to compare by value
}

/**
 * Document hook implementation - independent of useFireproof
 * This follows the exact signature and behavior of the original useDocument hook
 */
export function useFireproofDocument<T extends DocTypes>(
  database: Database,
  initialDocOrFn?: UseDocumentInitialDocOrFn<T>,
): UseDocumentResult<T> {
  const updateHappenedRef = useRef(false);

  // Process initial document exactly as in original implementation
  let initialDoc: DocSet<T>;
  if (typeof initialDocOrFn === "function") {
    initialDoc = initialDocOrFn();
  } else {
    initialDoc = initialDocOrFn ?? ({} as T);
  }

  // Keep a stable reference to original doc - use an empty array to ensure it's only computed once
  const originalInitialDoc = useMemo(() => deepClone({ ...initialDoc }), []);

  // Document state
  const [doc, setDoc] = useState<DocSet<T> & { _id?: string }>(initialDoc);

  // Refresh document from database with stable dependencies
  const refresh = useCallback(async () => {
    if (doc._id) {
      try {
        const gotDoc = await database.get<T>(doc._id);
        setDoc(gotDoc);
      } catch {
        setDoc(initialDoc);
      }
    } else {
      setDoc(initialDoc);
    }
  }, [doc._id, database, initialDoc]);

  // Save document implementation with stable dependencies
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

  // Delete document implementation with stable dependencies
  const remove: DeleteDocFn<T> = useCallback(
    async (existingDoc) => {
      const id = existingDoc?._id ?? doc._id;
      if (!id) throw database.logger.Error().Msg(`Document must have an _id to be removed`).AsError();
      const gotDoc = await database.get<T>(id).catch(() => undefined);
      if (!gotDoc) throw database.logger.Error().Str("id", id).Msg(`Document not found`).AsError();
      const res = await database.del(id);
      setDoc(initialDoc);
      return res;
    },
    [doc, initialDoc, database],
  );

  // Granular update methods with stable dependencies
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

  // Legacy-compatible updateDoc with stable dependencies
  const updateDoc = useCallback(
    (newDoc?: DocSet<T>, opts = { replace: false, reset: false }) => {
      if (!newDoc) {
        return opts.reset ? reset() : refresh();
      }
      return opts.replace ? replace(newDoc) : merge(newDoc);
    },
    [refresh, reset, replace, merge],
  );

  // Subscribe to database changes
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

  // Initial document load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Ensure all references are stable even with undefined inputs

  // Form submit handler
  const submit = useCallback(
    async (e?: Event) => {
      if (e?.preventDefault) e.preventDefault();
      await save();
      reset();
    },
    [save, reset],
  );

  // Create the API object with the exact same structure as original
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

  // Make the object properly iterable as in original implementation
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
 * This follows the exact signature and behavior of the original useLiveQuery hook
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

  // Memoize query parameters to detect changes
  const queryString = useMemo(() => JSON.stringify(query), [query]);
  const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

  // Callback to refresh query results from database
  const refreshRows = useCallback(async () => {
    const res = await database.query<K, T, R>(mapFn, query);
    setResult({
      docs: res.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
      rows: res.rows,
    });
  }, [database, mapFnString, queryString]);

  // Subscribe to database changes to keep results in sync
  useEffect(() => {
    refreshRows();
    const unsubscribe = database.subscribe(refreshRows);
    return () => {
      unsubscribe();
    };
  }, [refreshRows]);

  return result;
}

/**
 * AllDocs hook implementation - independent of useFireproof
 * This follows the exact signature and behavior of the original useAllDocs hook
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
 * This follows the exact signature and behavior of the original useChanges hook
 */
export function useFireproofChanges<T extends DocTypes>(
  database: Database,
  since: ClockHead = [],
  opts: ChangesOptions = {},
): ChangesResult<T> {
  const [result, setResult] = useState<ChangesResult<T>>({
    docs: [],
  });

  // Memoize parameters
  const queryString = useMemo(() => JSON.stringify(opts), [opts]);
  const sinceString = useMemo(() => JSON.stringify(since), [since]);

  // Refresh changes from database
  const refreshRows = useCallback(async () => {
    try {
      const res = await database.changes<T>(since, opts);
      setResult({
        ...res,
        docs: res.rows.map((r) => r.value as DocWithId<T>),
      });
    } catch {
      // Silently handle errors to match original behavior
    }
  }, [database, sinceString, queryString]);

  // Subscribe to changes
  useEffect(() => {
    refreshRows(); // Initial data fetch
    return database.subscribe(refreshRows);
  }, [refreshRows]);

  return result;
}

/**
 * Factory function that creates hooks bound to a specific database
 * This is NOT a hook - hooks rules don't apply
 */
export function createFireproofHooks(database: Database): Omit<UseFireproof, "database" | "attach"> {
  return {
    useDocument: <T extends DocTypes>(initialDocOrFn?: UseDocumentInitialDocOrFn<T>): UseDocumentResult<T> => {
      return useFireproofDocument<T>(database, initialDocOrFn);
    },

    useLiveQuery: <T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
      mapFn: MapFn<T> | string,
      query = {},
      initialRows: IndexRow<K, T, R>[] = [],
    ): LiveQueryResult<T, K, R> => {
      return useFireproofQuery<T, K, R>(database, mapFn, query, initialRows);
    },

    useAllDocs: <T extends DocTypes>(query = {}, initialRows: IndexRow<string, T, T>[] = []) => {
      return useFireproofAllDocs<T>(database, query, initialRows);
    },

    useChanges: <T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}) => {
      return useFireproofChanges<T>(database, since, opts);
    },
  };
}
