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
  AllDocsQueryOpts,
} from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { deepClone } from "./utils.js";
import type {
  DeleteDocFn,
  StoreDocFn,
  UseDocumentInitialDocOrFn,
  UseDocumentResult,
  LiveQueryResult,
  ChangesResult,
  UseFireproof,
  UseFPConfig,
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
      return opts.replace ? replace(newDoc as T) : merge(newDoc);
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

  // Initial load effect
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
 * Query hook implementation - independent of useFireproof
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
  }, [refreshRows]);

  return result;
}

/**
 * AllDocs hook implementation - independent of useFireproof
 */
export function useFireproofAllDocs<T extends DocTypes>(
  database: Database,
  query: Partial<AllDocsQueryOpts> = {},
): LiveQueryResult<T, string, T> {
  const [result, setResult] = useState<LiveQueryResult<T, string, T>>({
    rows: [],
    docs: [],
  });

  const queryString = useMemo(() => JSON.stringify(query), [query]);

  const refreshRows = useCallback(async () => {
    const res = await database.allDocs<T>(query);
    setResult({
      docs: res.rows.map((r) => r.value).filter((r): r is DocWithId<T> => !!r),
      rows: res.rows as unknown as IndexRow<string, T, T>[],
    });
  }, [database, queryString]);

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
 * Changes hook implementation - independent of useFireproof
 */
export function useFireproofChanges<T extends DocTypes>(
  database: Database,
  since: ClockHead = [],
  opts: ChangesOptions = {},
): ChangesResult<T> {
  // Initialize with empty changes array
  const [docsList, setDocsList] = useState<DocWithId<T>[]>([]);

  // Ensure stable dependencies
  const optsString = useMemo(() => JSON.stringify(opts), [opts]);
  const sinceString = useMemo(() => JSON.stringify(since), [since]);

  // Create a refreshChanges callback that gets changes and updates state
  const refreshChanges = useCallback(async () => {
    try {
      const res = await database.changes<T>(since, opts);
      // Type casting needed due to difference between ChangesResponse and what the hook expects
      setDocsList(res as unknown as DocWithId<T>[]);
    } catch {
      // Log the error through the database logger if available, otherwise just set empty results
      if (database.logger) {
        database.logger.Error().Msg("Error fetching changes");
      }
      setDocsList([]);
    }
  }, [database, sinceString, optsString]);

  // Subscribe to database changes
  useEffect(() => {
    // Initial load
    refreshChanges();

    // Subscribe to changes - only use two arguments as per the API
    const unsubscribe = database.subscribe(refreshChanges, true);

    return () => {
      unsubscribe();
    };
  }, [refreshChanges]);

  // Return in the format the hook expects - with docs property per ChangesResult interface
  return { docs: docsList };
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

    useAllDocs: <T extends DocTypes>(query: Partial<AllDocsQueryOpts> = {}) => {
      return useFireproofAllDocs<T>(database, query);
    },

    useChanges: <T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}) => {
      return useFireproofChanges<T>(database, since, opts);
    },
  };
}
