import type { ConfigOpts, DbResponse, Doc, DocRecord, IndexRow, MapFn, QueryOpts } from "@fireproof/core";
import { Database, fireproof } from "@fireproof/core";
import { deepmerge } from "deepmerge-ts";
import { Accessor, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

export interface LiveQueryResult<T extends DocTypes> {
  readonly docs: Doc<T>[];
  readonly rows: IndexRow<T>[];
}

export type CreateLiveQuery = <T extends DocTypes>(
  mapFn: string | MapFn,
  query?: QueryOpts,
  initialRows?: IndexRow<T>[]
) => Accessor<LiveQueryResult<T>>;

interface UpdateDocFnOptions {
  readonly replace?: boolean;
}

type UpdateDocFn<T extends DocTypes> = (newDoc?: Partial<Doc<T>>, options?: UpdateDocFnOptions) => void;

type StoreDocFn<T extends DocTypes> = (existingDoc?: Doc<T>) => Promise<DbResponse>;

export type CreateDocumentResult<T extends DocTypes> = [Accessor<Doc<T>>, UpdateDocFn<T>, StoreDocFn<T>];

export type CreateDocument = <T extends DocTypes>(initialDocFn: Accessor<Doc<T>>) => CreateDocumentResult<T>;

export interface CreateFireproof {
  /** The Fireproof database */
  readonly database: Accessor<Database>;
  /**
   * ## Summary
   *
   * Creates a new Fireproof document into your custom-named Fireproof database. The creation occurs when you do not
   * pass in an `_id` as part of your initial document -- the database will assign a new one when you call the provided
   * `save` handler. The hook also provides generics support so you can inline your custom type into the invocation to
   * receive type-safety and auto-complete support in your IDE.
   *
   * ## Usage
   *
   * ```tsx
   * const [todo, setTodo, saveTodo] = createDocument<Todo>(() => ({
   *   text: '',
   *   date: Date.now(),
   *   completed: false
   * }))
   *
   * const [doc, setDoc, saveDoc] = createDocument<Customer>(() => ({
   *   _id: `${props.customerId}-profile`, // you can imagine `customerId` as a prop passed in
   *   name: "",
   *   company: "",
   *   startedAt: Date.now()
   * }))
   * ```
   *
   * ## Overview
   * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
   * when you use the `createLiveQuery` and `createDocument` APIs. By default, Fireproof stores data in the browser's
   * local storage.
   */
  readonly createDocument: CreateDocument;
  /**
   * ## Summary
   * Access to live query results, enabling real-time updates in your app.
   *
   * ## Usage
   *
   * ```tsx
   * const result = createLiveQuery("date"); // using string key
   * const result = createLiveQuery('date', { limit: 10, descending: true }) // key + options
   * const result = createLiveQuery<CustomType>("date"); // using generics
   * const result = createLiveQuery((doc) => doc.date)); // using map function
   * ```
   *
   * ## Overview
   * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
   * when you use the `createLiveQuery` and `createDocument` APIs. By default, Fireproof stores data in the browser's
   * local storage.
   */
  readonly createLiveQuery: CreateLiveQuery;
}

/**
 *
 * ## Summary
 *
 * Create a Fireproof database and the utility hooks to work against it. If no name is
 * provided, then it will default to `FireproofDB`.
 *
 * ## Usage
 * ```tsx
 * const { database, createLiveQuery, createDocument } = createFireproof();
 * const { database, createLiveQuery, createDocument } = createFireproof("AwesomeDB");
 * const { database, createLiveQuery, createDocument } = createFireproof("AwesomeDB", { ...options });
 *
 * // As global databases -- can put these in a file and import them where you need them
 * export const FireproofDB = createFireproof();
 * export const AwesomeDB = createFireproof("AwesomeDB");
 * ```
 *
 */
export function createFireproof(dbName?: string, config: ConfigOpts = {}): CreateFireproof {
  // The database connection is cached, so subsequent calls to fireproof with the same name will
  // return the same database object. This makes it safe to invoke the getter function many times
  // without needing to wrap it with createMemo. An added perk of not needing createMemo is this
  // allows use of this hook at the global scope without needing to wrap it with createRoot from SolidJS.
  const database = () => fireproof(dbName || "FireproofDB", config);

  function createDocument<T extends DocTypes>(initialDocFn: Accessor<Doc<T>>): CreateDocumentResult<T> {
    const [doc, setDoc] = createSignal(initialDocFn());

    // Memoize the docId to re-run dependent effects ONLY when the _id value actually changes
    const docId = createMemo(() => doc()._id);

    const updateDoc: UpdateDocFn<T> = (newDoc, options = { replace: false }) => {
      setDoc(
        !newDoc
          ? initialDocFn
          : (prevDoc) => (options.replace ? (newDoc as Doc<T>) : (deepmerge(prevDoc, newDoc) as Doc<T>))
      );
    };

    const saveDoc: StoreDocFn<T> = async (existingDoc) => {
      const response = await database().put(existingDoc ?? doc());
      if (!existingDoc && !doc()._id) setDoc((d) => ({ ...d, _id: response.id }));
      return response;
    };

    const refreshDoc = async (db: Database, docId = "") => {
      // TODO: Add option for MVCC (Multi-version concurrency control) checks
      // https://use-fireproof.com/docs/database-api/documents/#multi-version-concurrency-control-mvcc-available-in-alpha-coming-soon-in-beta
      const storedDoc = await db.get<T>(docId).catch(initialDocFn);
      setDoc(() => storedDoc);
    };

    createEffect(() => {
      const subscriptionId = docId();
      if (!subscriptionId) return;

      const db = database();

      const unsubscribe = db.subscribe(async (updatedDocs) => {
        if (updatedDocs.find((c) => c._id === subscriptionId)) {
          await refreshDoc(db, subscriptionId);
        }
      });

      onCleanup(() => {
        unsubscribe();
      });
    });

    createEffect(() => {
      void refreshDoc(database(), initialDocFn()._id);
    });

    return [doc, updateDoc, saveDoc];
  }

  function createLiveQuery<T extends DocTypes>(
    strOrFn: string | MapFn,
    query = {},
    initialRows: IndexRow<T>[] = []
  ) {
    // TODO: Explore using a store instead of a signal for more efficient updates
    const [result, setResult] = createSignal({
      docs: initialRows.map((r) => r.doc as Doc<T>),
      rows: initialRows,
    });

    const refreshRows = async (db: Database) => {
      const res = await db.query<T>(strOrFn, query);
      setResult({ ...res, docs: res.rows.map((r) => r.doc as Doc<T>) });
    };

    createEffect(() => {
      const db = database();

      void refreshRows(db);

      const unsubscribe = db.subscribe(async () => {
        await refreshRows(db);
      });

      onCleanup(() => {
        unsubscribe();
      });
    });

    return result;
  }

  return { database, createDocument, createLiveQuery };
}
