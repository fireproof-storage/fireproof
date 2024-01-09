/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireproof, Database } from "@fireproof/core";
import type { Doc, DbResponse, MapFn, ConfigOpts } from "@fireproof/core";
import { Accessor, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { deepmerge } from "deepmerge-ts";

type LiveQueryResult<T = any> = {
  readonly docs: Doc<T>[];
  readonly rows: T[];
};

export type CreateLiveQuery = <T = any>(mapFn: string | MapFn, query?: object, initialRows?: T[]) => Accessor<LiveQueryResult<T>>;

type UpdateDocFnOptions = {
  readonly replace?: boolean;
  readonly deepMerge?: boolean;
};

type UpdateDocFn<T extends Record<string, any> = any> = (newDoc?: Doc<Partial<T>>, options?: UpdateDocFnOptions) => void;

export type CreateDocumentResult<T extends Record<string, any> = any> = [Accessor<Doc<T>>, UpdateDocFn<T>, () => Promise<DbResponse>];

export type CreateDocument = <T extends Record<string, any> = any>(initialDoc: Accessor<Doc<T>>) => CreateDocumentResult<T>;

export type CreateFireproof = {
  /** The Fireproof database */
  readonly database: Accessor<Database>;
  /**
   * Loads and saves Fireproof documents and handles refreshing them when data changes
   * @param initialDoc
   * @returns
   */
  readonly createDocument: CreateDocument;
  readonly createLiveQuery: CreateLiveQuery;
};

/**
 * ### Usage
 * ```tsx
 * const { database, createLiveQuery, createDocument } = createFireproof("dbname");
 * const { database, createLiveQuery, createDocument } = createFireproof("dbname", { ...options });
 * ```
 *
 * ### Summary
 * Optional hook to create a custom-named Fireproof database and provides the utility hooks to query against it.
 *
 *
 * @param name - The name of the database to create or an existing database instance
 * @returns An object containing the custom database accessor and database scoped `createLiveQuery` and `createDocument` hooks
 *
 *
 * ### Overview
 *
 * TL;DR: Only use this hook if you need to configure a database name other than the default `@fireproof/db`.
 *
 * For most applications, using the `createLiveQuery` or `createDocument` hooks exported from `@fireproof/solid-js` should
 * suffice for the majority of use-cases. Under the hood, they act against a database named `@fireproof/db` instantiated with
 * default configurations. However, if you need to do a custom database setup or configure a database name more to your liking
 * than the default `@fireproof/db`, then use `createFireproof` as it exists for that purpose. It will provide you with the
 * custom database accessor and *lexically scoped* versions of `createLiveQuery` and `createDocument` that act against said
 * custom database.
 *
 * If you need to, using the power of Solid, you can distribute the custom database accessor and lexical hooks through your
 * app using the Context APIs or just simply instantiating them globally and importing it where you need it like you would with any global
 * SolidJS signal.
 */
export function createFireproof(
  name: string | Database = "@fireproof/db",
  config: ConfigOpts = {}
): CreateFireproof {
  // The database connection is cached, so subsequent calls to fireproof with the same name will
  // return the same database object. This makes it safe to call fireproof with every render.
  const database = createMemo(() => (typeof name === "string" ? fireproof(name, config) : name));

  function createDocument<T extends Record<string, any> = any>(initialDoc: Accessor<Doc<T>>): CreateDocumentResult {
    const [doc, setDoc] = createSignal(initialDoc());

    const updateDoc = (newDoc?: Doc<Partial<T>>, options: UpdateDocFnOptions = { replace: false, deepMerge: false }) => {
      if (!newDoc) return setDoc(initialDoc);
      if (options.replace) return setDoc(() => newDoc as Doc<T>);

      return setDoc((d) => (options.deepMerge ? deepmerge(d, newDoc) as Doc<T> : { ...d, ...newDoc }));
    };

    const saveDoc = async () => {
      const putDoc = initialDoc()._id ? ({ ...doc(), _id: initialDoc()._id } as Doc) : doc();
      return database().put(putDoc);
    };

    const refreshDoc = async (db: Database) => {
      if (!initialDoc()._id) return;

      // TODO: add option for mvcc checks
      setDoc(await db.get(initialDoc()._id as string).catch(() => initialDoc));
    };

    createEffect(() => {
      const db = database();
      const unsubscribe = db.subscribe((changes) => {
        if (changes.find((c) => c.key === initialDoc()._id)) {
          refreshDoc(db); // TODO: use change.value
        }
      });

      onCleanup(() => {
        unsubscribe();
      });
    });

    createEffect(() => {
      void refreshDoc(database());
    });

    return [doc, updateDoc, saveDoc];
  }

  function createLiveQuery<T = any>(mapFn: MapFn | string, query = {}, initialRows: any[] = []): Accessor<LiveQueryResult<T>> {
    const [result, setResult] = createSignal({
      rows: initialRows,
      docs: initialRows.map((r) => r.doc),
    });

    const refreshRows = async (db: Database) => {
      const res = await db.query(mapFn, query);
      setResult({ ...res, docs: res.rows.map((r) => r.doc) });
    };

    createEffect(() => {
      const db = database();
      const unsubscribe = db.subscribe(() => void refreshRows(db));

      onCleanup(() => {
        unsubscribe();
      });
    });

    return result;
  }

  return { database, createDocument, createLiveQuery };
}
