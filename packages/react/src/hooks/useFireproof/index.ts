import { useEffect, useState, useCallback, createContext } from 'react';
import { Database, Fireproof, Index } from '@fireproof/core';

interface Document {
  _id: string;
  [key: string]: any;
}

export interface FireproofCtxValue {
  database: Fireproof|null;
  useLiveQuery: Function;
  useLiveDocument: Function;
  ready: boolean;
}

export const FireproofCtx  = createContext<FireproofCtxValue>({
  useLiveQuery: () => {},
  useLiveDocument: () => {},
  database: null,
  ready: false,
})

let startedSetup = false;
let database: Database;
const initializeDatabase = (name: string) => {
  if (database) return;
  database = Fireproof.storage(name);
};

/**
@function useFireproof
React hook to initialize a Fireproof database.
You might need to import { nodePolyfills } from 'vite-plugin-node-polyfills' in your vite.config.ts
@param {string} name - The path to the database file
@param {function(database: Database): void} [defineDatabaseFn] - Synchronous function that defines the database, run this before any async calls
@param {function(database: Database): Promise<void>} [setupDatabaseFn] - Asynchronous function that sets up the database, run this to load fixture data etc
@returns {FireproofCtxValue} { useLiveQuery, useLiveDocument, database, ready }
*/
export function useFireproof(
  name = 'useFireproof',
  defineDatabaseFn = (database: Database) => {
    // define indexes here before querying them in setup
    database;
  },
  setupDatabaseFn = async (database: Database) => {
    database;
  },
) : FireproofCtxValue {
  const [ready, setReady] = useState(false);
  initializeDatabase(name);

  useEffect(() => {
    const doSetup = async () => {
      if (ready || startedSetup) return;
      startedSetup = true;
      defineDatabaseFn(database);
      if (database.clock.length === 0) {
        await setupDatabaseFn(database);
      }
      setReady(true);
    };
    doSetup();
  }, [ready]);

  function useLiveDocument(initialDoc: Document) {
    const id = initialDoc._id;
    const [doc, setDoc] = useState(initialDoc);

    const saveDoc = useCallback(
      async (newDoc) => await database.put({ _id: id, ...newDoc }),
      [id],
    );

    const refreshDoc = useCallback(async () => {
      // todo add option for mvcc checks
      setDoc(await database.get(id).catch(() => initialDoc));
    }, [id, initialDoc]);

    useEffect(
      <React.EffectCallback>(() =>
        database.subscribe((changes: { key: string; id: string }[]) => {
          if (changes.find((c) => c.key === id)) {
            refreshDoc(); // todo use change.value
          }
        })),
      [id, refreshDoc],
    );

    useEffect(() => {
      refreshDoc();
    }, []);

    return [doc, saveDoc];
  }

  function useLiveQuery(mapFn: Function, query = {}, initialRows: any[] = []) {
    const [result, setResult] = useState({ rows: initialRows, proof: {}, docs: initialRows.map((r) => r.doc) });
    const [index, setIndex] = useState<Index | null>(null);

    const refreshRows = useCallback(async () => {
      if (index) {
        const res = await index.query(query)
        setResult({...res, docs: res.rows.map((r) => r.doc)});
      }
    }, [index, JSON.stringify(query)]);

    useEffect(
      <React.EffectCallback>(() =>
        database.subscribe(() => {
          refreshRows();
        })),
      [database, refreshRows],
    );

    useEffect(() => {
      refreshRows();
    }, [index]);

    useEffect(() => {
      setIndex(new Index(database, null, mapFn));
    }, [mapFn.toString()]);

    return result;
  }

  return {
    useLiveQuery,
    useLiveDocument,
    database,
    ready,
  };
}
