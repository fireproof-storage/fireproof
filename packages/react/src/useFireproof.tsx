import type { ConfigOpts, Database, DbResponse, Doc, MapFn } from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { useCallback, useEffect, useState } from "react";

type LiveQueryFnReturn = { docs: Doc[]; rows: any[] };
export type LiveQueryFn = (mapFn: string | MapFn, query?: object, initialRows?: any[]) => LiveQueryFnReturn;

type UseDocFnReturn = [Doc, (newDoc: Doc | false, replace?: boolean) => void, () => Promise<DbResponse>];
export type UseDocFn = (initialDoc: Doc) => UseDocFnReturn;

export type FireproofCtxValue = {
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
  readonly useDocument: UseDocFn;
  /**
   * ## Summary
   * React hook that provides access to live query results, enabling real-time updates in your app.
   *
   * ## Usage
   * ```tsx
   * const results = useLiveQuery("date"); // using string key
   * const results = useLiveQuery('date', { limit: 10, descending: true }) // key + options
   * const results = useLiveQuery<CustomType>("date"); // using generics
   * const results = useLiveQuery((doc) => doc.date)); // using map function
   * ```
   *
   * ## Overview
   * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
   * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
   * local storage.
   */
  readonly useLiveQuery: LiveQueryFn;
};

/**
 * @deprecated Use the `useFireproof` hook instead
 */
export const FireproofCtx = {} as FireproofCtxValue;

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
export function useFireproof(name: string | Database = "useFireproof", config: ConfigOpts = {}): FireproofCtxValue {
  const database = typeof name === "string" ? fireproof(name, config) : name;

  function useDocument(initialDoc: Doc): UseDocFnReturn {
    const id = initialDoc._id;
    const [doc, setDoc] = useState(initialDoc);

    const saveDoc = useCallback(async () => {
      const putDoc = id ? { ...doc, _id: id } : doc;
      return await database.put(putDoc as Doc);
    }, [id, doc]);

    const refreshDoc = useCallback(async () => {
      if (!id) return;

      // todo add option for mvcc checks
      setDoc(await database.get(id).catch(() => initialDoc));
    }, [id, initialDoc]);

    useEffect(() => {
      database.subscribe((changes) => {
        if (changes.find((c) => c.key === id)) {
          refreshDoc(); // todo use change.value
        }
      });
    }, [id, refreshDoc]);

    useEffect(() => {
      refreshDoc();
    }, []);

    return [
      doc,
      (newDoc, replace) => {
        if (newDoc) return replace ? setDoc(newDoc) : setDoc((d) => ({ ...d, ...newDoc }));
        else return setDoc(initialDoc);
      },
      saveDoc,
    ];
  }

  function useLiveQuery(mapFn: MapFn | string, query = {}, initialRows: any[] = []): LiveQueryFnReturn {
    const [result, setResult] = useState({
      rows: initialRows,
      docs: initialRows.map((r) => r.doc),
    });

    const refreshRows = useCallback(async () => {
      const res = await database.query(mapFn, query);
      setResult({ ...res, docs: res.rows.map((r) => r.doc) });
    }, [JSON.stringify(query)]);

    useEffect(() => {
      database.subscribe(() => {
        refreshRows();
      });
    }, [database, refreshRows]);

    useEffect(() => {
      refreshRows();
    }, [mapFn.toString(), JSON.stringify(query)]);

    return result;
  }

  return {
    database,
    useLiveQuery,
    useDocument,
  };
}
