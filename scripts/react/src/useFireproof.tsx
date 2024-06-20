import type { ConfigOpts, Database, DbResponse, Doc, DocRecord, IndexRow, MapFn, QueryOpts } from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface LiveQueryResult<T extends DocTypes> {
  readonly docs: Doc<T>[];
  readonly rows: IndexRow<T>[];
}

export type UseLiveQuery = <T extends DocTypes>(
  mapFn: string | MapFn,
  query?: QueryOpts,
  initialRows?: IndexRow<T>[]
) => LiveQueryResult<T>;

interface UpdateDocFnOptions {
  readonly replace?: boolean;
  readonly reset?: boolean;
}

type UpdateDocFn<T extends DocTypes> = (newDoc?: Partial<Doc<T>>, options?: UpdateDocFnOptions) => void;

type StoreDocFn<T extends DocTypes> = (existingDoc?: Doc<T>) => Promise<DbResponse>;

export type UseDocumentResult<T extends DocTypes> = [Doc<T>, UpdateDocFn<T>, StoreDocFn<T>];

export type UseDocument = <T extends DocTypes>(initialDocFn: () => Doc<T>) => UseDocumentResult<T>;

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
   * const [todo, setTodo, saveTodo] = useDocument<Todo>({
   *   text: '',
   *   date: Date.now(),
   *   completed: false
   * })
   *
   * const [doc, setDoc, saveDoc] = useDocument<Customer>({
   *   _id: `${props.customerId}-profile`, // you can imagine `customerId` as a prop passed in
   *   name: "",
   *   company: "",
   *   startedAt: Date.now()
   * })
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
}

/**
 * @deprecated Use the `useFireproof` hook instead
 */
export const FireproofCtx = {} as UseFireproof;

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

  function useDocument<T extends DocTypes>(initialDocFn: () => Doc<T>): UseDocumentResult<T> {
    // We purposely refetch the docId everytime to check if it has changed
    const docId = initialDocFn()._id ?? "";

    // We do not want to force consumers to memoize their initial document so we do it for them.
    // We use the stringified generator function to ensure that the memoization is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialDoc = useMemo(initialDocFn, [initialDocFn.toString()]);
    const [doc, setDoc] = useState(initialDoc);

    const refreshDoc = useCallback(async () => {
      // todo add option for mvcc checks
      setDoc(await database.get<T>(docId).catch(() => initialDocFn()));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docId]);

    const saveDoc: StoreDocFn<T> = useCallback(
      async (existingDoc) => {
        const res = await database.put(existingDoc ?? doc);

        // If the document was created, then we need to update the local state with the new `_id`
        if (!existingDoc && !doc._id) setDoc((d) => ({ ...d, _id: res.id }));

        return res;
      },
      [doc]
    );

    const updateDoc: UpdateDocFn<T> = useCallback(
      (newDoc, opts = { replace: false, reset: false }) => {
        if (!newDoc) return void (opts.reset ? setDoc(initialDoc) : refreshDoc());
        setDoc((d) => (opts.replace ? (newDoc as Doc<T>) : { ...d, ...newDoc }));
      },
      [refreshDoc, initialDoc]
    );

    useEffect(() => {
      if (!docId) return;
      const unsubscribe = database.subscribe((changes) => {
        if (changes.find((c) => c._id === docId)) {
          void refreshDoc(); // todo use change.value
        }
      });

      return () => {
        unsubscribe();
      };
    }, [docId, refreshDoc]);

    useEffect(() => {
      void refreshDoc();
    }, [refreshDoc]);

    return [doc, updateDoc, saveDoc];
  }

  function useLiveQuery<T extends DocTypes>(
    mapFn: MapFn | string,
    query = {},
    initialRows: IndexRow<T>[] = []
  ): LiveQueryResult<T> {
    const [result, setResult] = useState({
      rows: initialRows,
      docs: initialRows.map((r) => r.doc as Doc<T>),
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);
    const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

    const refreshRows = useCallback(async () => {
      const res = await database.query<T>(mapFn, query);
      setResult({ ...res, docs: res.rows.map((r) => r.doc as Doc<T>) });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapFnString, queryString]);

    useEffect(() => {
      const unsubscribe = database.subscribe(refreshRows);

      return () => {
        unsubscribe();
      };
    }, [refreshRows]);

    useEffect(() => {
      refreshRows();
    }, [refreshRows]);

    return result;
  }

  return { database, useLiveQuery, useDocument };
}
