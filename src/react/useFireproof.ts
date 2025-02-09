import type {
  ConfigOpts,
  Database,
  DocFragment,
  DocResponse,
  DocSet,
  DocTypes,
  DocWithId,
  IndexKeyType,
  IndexRow,
  MapFn,
  QueryOpts,
} from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { AllDocsQueryOpts, ChangesOptions, ClockHead } from "@fireproof/core";

export interface LiveQueryResult<T extends DocTypes, K extends IndexKeyType, R extends DocFragment = T> {
  readonly docs: DocWithId<T>[];
  readonly rows: IndexRow<K, T, R>[];
  /** @internal */
  readonly length: number;
  /** @internal */
  map<U>(callbackfn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => U): U[];
  /** @internal */
  filter(predicate: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => boolean): DocWithId<T>[];
  /** @internal */
  forEach(callbackfn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => void): void;
  /** @internal */
  [Symbol.iterator](): Iterator<DocWithId<T>>;
}

export type UseLiveQuery = <T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
  mapFn: string | MapFn<T>,
  query?: QueryOpts<K>,
  initialRows?: IndexRow<K, T, R>[],
) => LiveQueryResult<T, K, R>;

export interface AllDocsResult<T extends DocTypes> {
  readonly docs: DocWithId<T>[];
}

export interface ChangesResult<T extends DocTypes> {
  readonly docs: DocWithId<T>[];
}

export type UseAllDocs = <T extends DocTypes>(query?: AllDocsQueryOpts) => AllDocsResult<T>;

export type UseChanges = <T extends DocTypes>(since: ClockHead, opts: ChangesOptions) => ChangesResult<T>;

interface UpdateDocFnOptions {
  readonly replace?: boolean;
  readonly reset?: boolean;
}

type UpdateDocFn<T extends DocTypes> = (newDoc?: DocSet<T>, options?: UpdateDocFnOptions) => void;

type StoreDocFn<T extends DocTypes> = (existingDoc?: DocWithId<T>) => Promise<DocResponse>;

type DeleteDocFn<T extends DocTypes> = (existingDoc?: DocWithId<T>) => Promise<DocResponse>;

type UseDocumentResultTuple<T extends DocTypes> = [DocWithId<T>, UpdateDocFn<T>, StoreDocFn<T>, DeleteDocFn<T>];

interface UseDocumentResultObject<T extends DocTypes> {
  doc: DocWithId<T>;
  merge: (newDoc: Partial<T>) => void;
  replace: (newDoc: T) => void;
  reset: () => void;
  refresh: () => void;
  save: StoreDocFn<T>;
  remove: DeleteDocFn<T>;
}

export type UseDocumentResult<T extends DocTypes> = UseDocumentResultObject<T> & UseDocumentResultTuple<T>;

export type UseDocumentInitialDocOrFn<T extends DocTypes> = DocSet<T> | (() => DocSet<T>);
export type UseDocument = <T extends DocTypes>(initialDocOrFn: UseDocumentInitialDocOrFn<T>) => UseDocumentResult<T>;

export interface UseFireproof {
  readonly database: Database;
  /**
   * ## Summary
   *
   * React hook that provides the ability to create/update/save new Fireproof documents into your custom Fireproof database.
   * The creation occurs when you do not pass in an `_id` as part of your initial document -- the database will assign a new
   * one when you call the provided `save` handler. The hook also provides generics support so you can inline your custom type into
   * the invocation to receive type-safety and auto-complete support in your IDE.
   *
   * ## Usage
   *
   * ```tsx
   * const todo = useDocument<Todo>({
   *   text: '',
   *   date: Date.now(),
   *   completed: false
   * })
   * // Access via object properties
   * todo.doc // The current document
   * todo.merge({ completed: true }) // Update specific fields
   * todo.replace({ text: 'new', date: Date.now(), completed: false }) // Replace entire doc
   * todo.save() // Save changes
   * todo.remove() // Delete document
   * todo.reset() // Reset to initial state
   * todo.refresh() // Refresh from database
   *
   * // Or use tuple destructuring for legacy compatibility
   * const [doc, updateDoc, saveDoc, removeDoc] = todo
   * ```
   *
   * ## Overview
   *
   * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
   * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
   * local storage.
   */
  readonly useDocument: UseDocument;
  /**
   * ## Summary
   * React hook that provides access to live query results, enabling real-time updates in your app.
   *
   * ## Usage
   * ```tsx
   * const result = useLiveQuery("date"); // using string key
   * const result = useLiveQuery('date', { limit: 10, descending: true }) // key + options
   * const result = useLiveQuery<CustomType>("date"); // using generics
   * const result = useLiveQuery((doc) => doc.date)); // using map function
   * ```
   *
   * ## Overview
   * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
   * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
   * local storage.
   */
  readonly useLiveQuery: UseLiveQuery;
  /**
   * ## Summary
   * React hook that provides access to all documents in the database, sorted by `_id`.
   *
   * ## Usage
   * ```tsx
   * const result = useAllDocs({ limit: 10, descending: true }); // with options
   * const result = useAllDocs(); // without options
   * ```
   *
   * ## Overview
   * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
   * when you use the `useAllDocs` and `useDocument` APIs. By default, Fireproof stores data in the browser's
   * local storage.
   */
  readonly useAllDocs: UseAllDocs;
  /**
   * ## Summary
   * React hook that provides access to all new documents in the database added since the last time the changes was called
   *
   * ## Usage
   * ```tsx
   * const result = useChanges(prevresult.clock,{limit:10}); // with options
   * const result = useChanges(); // without options
   * ```
   *
   * ## Overview
   * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
   * when you use the `useAllDocs`, `useChanges` and `useDocument` APIs. By default, Fireproof stores data in the browser's
   * local storage.
   */
  readonly useChanges: UseChanges;
}

/**
 * @deprecated Use the `useFireproof` hook instead
 */
export const FireproofCtx = {} as UseFireproof;

function deepClone<T>(value: T): T {
  if (typeof structuredClone !== "undefined") {
    return structuredClone(value);
  } else {
    // Fallback if structuredClone is not available (older browsers, older Node versions, etc.)
    return JSON.parse(JSON.stringify(value));
  }
}

/**
 *
 * ## Summary
 *
 * React hook to create a custom-named Fireproof database and provides the utility hooks to query against it.
 *
 * ## Usage
 * ```tsx
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname");
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname", { ...options });
 * ```
 *
 * ## Overview
 *
 * TL;DR: Only use this hook if you need to configure a database name other than the default `useFireproof`.
 *
 * For most applications, using the `useLiveQuery` or `useDocument` hooks exported from `use-fireproof` should
 * suffice for the majority of use-cases. Under the hood, they act against a database named `useFireproof` instantiated with
 * default configurations. However, if you need to do a custom database setup or configure a database name more to your liking
 * than the default `useFireproof`, then use `useFireproof` as it exists for that purpose. It will provide you with the
 * custom database accessor and *lexically scoped* versions of `useLiveQuery` and `useDocument` that act against said
 * custom database.
 *
 */
export function useFireproof(name: string | Database = "useFireproof", config: ConfigOpts = {}): UseFireproof {
  const database = typeof name === "string" ? fireproof(name, config) : name;

  const updateHappenedRef = useRef(false);

  function useDocument<T extends DocTypes>(initialDocOrFn?: UseDocumentInitialDocOrFn<T>): UseDocumentResult<T> {
    let initialDoc: DocSet<T>;
    if (typeof initialDocOrFn === "function") {
      initialDoc = initialDocOrFn();
    } else {
      initialDoc = initialDocOrFn ?? ({} as T);
    }

    const originalInitialDoc = useMemo(() => deepClone({ ...initialDoc }), []);

    const [doc, setDoc] = useState(initialDoc);

    const refreshDoc = useCallback(async () => {
      const gotDoc = doc._id ? await database.get<T>(doc._id).catch(() => initialDoc) : initialDoc;
      setDoc(gotDoc);
    }, [doc._id]);

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
      [doc],
    );

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
      [doc, initialDoc],
    );

    // New granular update methods
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
          return opts.reset ? reset() : refreshDoc();
        }
        return opts.replace ? replace(newDoc as T) : merge(newDoc);
      },
      [refreshDoc, reset, replace, merge],
    );

    useEffect(() => {
      if (!doc._id) return;
      return database.subscribe((changes) => {
        if (updateHappenedRef.current) {
          return;
        }
        if (changes.find((c) => c._id === doc._id)) {
          void refreshDoc();
        }
      }, true);
    }, [doc._id, refreshDoc]);

    useEffect(() => {
      void refreshDoc();
    }, [refreshDoc]);

    const refresh = useCallback(() => void refreshDoc(), [refreshDoc]);

    // Primary Object API with both new and legacy methods
    const apiObject = {
      doc: { ...doc } as DocWithId<T>,
      merge,
      replace,
      reset,
      refresh,
      save,
      remove,
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

  function useLiveQuery<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
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
  }

  function useAllDocs<T extends DocTypes>(query: AllDocsQueryOpts = {}): AllDocsResult<T> {
    const [result, setResult] = useState<AllDocsResult<T>>({
      docs: [],
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);

    const refreshRows = useCallback(async () => {
      const res = await database.allDocs<T>(query);
      setResult({ ...res, docs: res.rows.map((r) => r.value as DocWithId<T>) });
    }, [queryString]);

    useEffect(() => {
      refreshRows(); // Initial data fetch
      return database.subscribe(refreshRows);
    }, [refreshRows]);

    return result;
  }

  function useChanges<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): ChangesResult<T> {
    const [result, setResult] = useState<ChangesResult<T>>({
      docs: [],
    });

    const queryString = useMemo(() => JSON.stringify(opts), [opts]);

    const refreshRows = useCallback(async () => {
      const res = await database.changes<T>(since, opts);
      setResult({ ...res, docs: res.rows.map((r) => r.value as DocWithId<T>) });
    }, [since, queryString]);

    useEffect(() => {
      refreshRows(); // Initial data fetch
      return database.subscribe(refreshRows);
    }, [refreshRows]);

    return result;
  }

  return { database, useLiveQuery, useDocument, useAllDocs, useChanges };
}
