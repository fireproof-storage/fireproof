import { useEffect, useState, useCallback, createContext } from 'react';
import { database as obtainDb, index as obtainIndex } from '@fireproof/database';

import type { Doc, DocFragment, Index, Database } from '@fireproof/database';

export interface FireproofCtxValue {
  database: Database;
  useLiveQuery: (mapFn: string | ((doc: Doc, map: (key: string, value: DocFragment) => void) => DocFragment), query?: object, initialRows?: any[]) => { docs: Doc[], rows: any[] };
  useDocument: (initialDoc: Doc) => [Doc, (newDoc: Doc) => void, () => Promise<void>]
  ready: boolean;
}

export const FireproofCtx = createContext<FireproofCtxValue>({} as FireproofCtxValue);

/**
 * Top level hook to initialize a Fireproof database and a query for it.
 * Uses default db name 'useFireproof'.
 */
const topLevelUseLiveQuery = (...args) => {
  const { useLiveQuery, database } = useFireproof();
  // @ts-ignore
  topLevelUseLiveQuery.database = database;
  // @ts-ignore
  return useLiveQuery(...args);
};

export const useLiveQuery = topLevelUseLiveQuery;

/**
 * Top level hook to initialize a Fireproof database and a document for it.
 * Uses default db name 'useFireproof'.
 */
const topLevelUseLiveDocument = (...args) => {
  const { useDocument, database } = useFireproof();
  // @ts-ignore
  topLevelUseLiveDocument.database = database;
  // @ts-ignore
  return useDocument(...args);
};

export const useDocument = topLevelUseLiveDocument;

export function useFireproof(
  name : string | Database = 'useFireproof',
  setupDatabaseFn: null | ((db: Database) => Promise<void>) = null,
  config = {},
): FireproofCtxValue {
  const [ready, setReady] = useState(false);
  const database = (typeof name === 'string') ? obtainDb(name) : name;
  database.config = config;

  useEffect(() => {
    const doSetup = async () => {
      if (ready) return;
      if (setupDatabaseFn) {
        const chs = await database.changes([])
        if (chs.rows.length === 0) {
          await setupDatabaseFn(database);
        }
      }
      setReady(true);
    };
    doSetup();
  }, [name]);

  function useDocument(initialDoc: Doc): [Doc, (newDoc: Doc) => void, () => Promise<void>] {
    const id = initialDoc._id;
    const [doc, setDoc] = useState(initialDoc);

    const saveDoc = useCallback(
      async () => {
        const putDoc = id ? { ...doc, _id: id } : doc;
        await database.put(putDoc)
      },
      [id, doc],
    );

    const refreshDoc = useCallback(async () => {
      // todo add option for mvcc checks
      if (id)
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

    return [
      doc,
      (newDoc) => {
        if (newDoc) return setDoc((d) => ({ ...d, ...newDoc }));
        else return setDoc(initialDoc);
      },
      saveDoc,
    ];
  }

  function useLiveQuery(mapFn: ((doc: Doc, map: (key: string, value: DocFragment) => void) => DocFragment) | string | Index, query = {}, initialRows: any[] = []) {
    const [result, setResult] = useState({
      rows: initialRows,
      docs: initialRows.map((r) => r.doc),
    });
    const [index, setIndex] = useState<Index | null>(null);

    const refreshRows = useCallback(async () => {
      if (index) {
        const res = await index.query(query);
        setResult({ ...res, docs: res.rows.map((r) => r.doc) });
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
      if (typeof mapFn === 'string') {
        setIndex(obtainIndex(database, mapFn));
      // @ts-ignore
      } else if (mapFn.crdt) {
        setIndex(mapFn as Index);
      } else {
        // @ts-ignore
        setIndex(obtainIndex(database, makeName(mapFn.toString()), mapFn));
      }
    }, [mapFn.toString()]);

    return result;
  }

  return {
    useLiveQuery,
    // useLiveDocument : useDocument,
    useDocument,
    database,
    ready,
  };
}


function makeName(fnString: string) {
  const regex = /\(([^,()]+,\s*[^,()]+|\[[^\]]+\],\s*[^,()]+)\)/g
  let found: RegExpExecArray | null = null
  let matches = Array.from(fnString.matchAll(regex), match => match[1].trim())
  if (matches.length === 0) {
    found = /=>\s*(.*)/.exec(fnString)
  }
  if (!found) {
    return fnString
  } else {
    // it's a consise arrow function, match everythign after the arrow
    return found[1]
  }
}