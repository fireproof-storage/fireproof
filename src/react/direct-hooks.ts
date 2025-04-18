// This file implements React hooks that directly interact with Fireproof
// without violating React's Rules of Hooks
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { fireproof } from "@fireproof/core";
import type {
  Database,
  DocTypes,
  DocWithId,
  IndexKeyType,
  IndexRow,
  MapFn,
  DocFragment,
  ChangesOptions,
  ClockHead,
} from "@fireproof/core";
import { deepClone } from "./utils.js";
import type {
  UseDocumentResult,
  UseDocumentInitialDocOrFn,
  LiveQueryResult,
  StoreDocFn,
  DeleteDocFn,
  UseFPConfig,
  ChangesResult,
} from "./types.js";

/**
 * Base hook that returns a Fireproof database instance
 */
export function useFireproofDB(name: string | Database, config: UseFPConfig = {}): Database {
  // Compute stable dependencies
  const dbName = typeof name === "string" ? name : name.name;
  const configString = JSON.stringify(config || {});

  return useMemo(() => {
    return typeof name === "string" ? fireproof(name, config) : name;
  }, [dbName, configString]);
}

/**
 * Document hook that manages a document state
 */
export function useDocumentState<T extends DocTypes>(
  database: Database,
  initialDocOrFn?: UseDocumentInitialDocOrFn<T>,
): UseDocumentResult<T> {
  // Process initial document value - this only happens once on mount
  // Using empty array for deps that should never change (mount-only)
  const initialDoc = useMemo(() => {
    if (typeof initialDocOrFn === "function") {
      return initialDocOrFn();
    }
    return initialDocOrFn ?? ({} as T);
  }, []);

  // Keep a stable reference to the original initial doc (mount-only)
  const originalInitialDoc = useMemo(() => deepClone({ ...initialDoc }), []);

  // Track when we're performing updates manually vs. from subscription
  const updateHappenedRef = useRef(false);

  // Document state
  const [doc, setDoc] = useState<T & { _id?: string }>(initialDoc);

  // Refresh document from database
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

  // Save document with proper dependency array (no emptyDeps)
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
    [doc, database], // Removed emptyDeps
  );

  // Delete document
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

  // Update methods with stable dependency array (no emptyDeps)
  const merge = useCallback((newDoc: Partial<T>) => {
    updateHappenedRef.current = true;
    setDoc((prev) => ({ ...prev, ...newDoc }));
  }, []); // No deps needed since it only uses setDoc which is stable

  const replace = useCallback((newDoc: T) => {
    updateHappenedRef.current = true;
    setDoc(newDoc);
  }, []); // No deps needed since it only uses setDoc which is stable

  const reset = useCallback(() => {
    updateHappenedRef.current = true;
    setDoc({ ...originalInitialDoc });
  }, [originalInitialDoc]); // Removed emptyDeps

  // Legacy updateDoc function
  const updateDoc = useCallback(
    (newDoc?: T, opts = { replace: false, reset: false }) => {
      if (!newDoc) {
        return opts.reset ? reset() : refresh();
      }
      return opts.replace ? replace(newDoc) : merge(newDoc);
    },
    [refresh, reset, replace, merge],
  );

  // Subscribe to database changes - ensure hook isn't conditionally called
  useEffect(() => {
    // Use a no-op function that won't trigger lint errors
    const noop = (): void => {
      /* no-op */
    };
    let unsubscribe = noop;

    if (doc._id) {
      unsubscribe =
        database.subscribe((changes) => {
          if (updateHappenedRef.current) {
            return;
          }
          if (changes.find((c) => c._id === doc._id)) {
            void refresh();
          }
        }, true) || noop;
    }

    return () => {
      unsubscribe();
    };
  }, [doc._id, refresh, database]);

  // Initial document load
  useEffect(() => {
    void refresh();
  }, [refresh]);

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
 * Live query hook that provides real-time query results
 */
export function useLiveQueryState<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
  database: Database,
  mapFn: MapFn<T> | string,
  query = {},
  initialRows: IndexRow<K, T, R>[] = [],
): LiveQueryResult<T, K, R> {
  const [result, setResult] = useState<LiveQueryResult<T, K, R>>({
    docs: initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
    rows: initialRows,
  });

  // Stringify query to detect changes
  const queryString = useMemo(() => JSON.stringify(query), [query]);

  // Function to refresh query results
  const refreshRows = useCallback(async () => {
    const res = await database.query<K, T, R>(mapFn, query);
    setResult({
      docs: res.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
      rows: res.rows,
    });
  }, [database, mapFn, queryString]);

  // Subscribe to changes
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
 * Hook for all documents
 */
export function useAllDocsState<T extends DocTypes>(database: Database, query = {}, initialRows: IndexRow<string, T, T>[] = []) {
  return useLiveQueryState<T, string, T>(database, "_id", query, initialRows);
}

/**
 * Hook for database changes
 */
export function useChangesState<T extends DocTypes>(
  database: Database,
  since: ClockHead = [],
  opts: ChangesOptions = {},
): ChangesResult<T> {
  const [result, setResult] = useState<ChangesResult<T>>({
    docs: [],
  });

  // Memoize parameters
  const optsString = useMemo(() => JSON.stringify(opts), [opts]);
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
  }, [database, sinceString, optsString]);

  // Subscribe to changes
  useEffect(() => {
    refreshRows();
    return database.subscribe(refreshRows);
  }, [refreshRows]);

  return result;
}
