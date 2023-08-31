import { useEffect, useState, useCallback } from 'react';
import { fireproof } from '@fireproof/core';

import type { Doc, DocFragment, Database, FireproofOptions } from '@fireproof/core';

export interface FireproofCtxValue {
  database: Database;
  useLiveQuery: (mapFn: string | ((doc: Doc, map: (key: string, value: DocFragment) => void) => DocFragment), query?: object, initialRows?: any[]) => { docs: Doc[], rows: any[] };
  useDocument: (initialDoc: Doc) => [Doc, (newDoc: Doc | false) => void, () => Promise<void>]
  ready: boolean;
}

/**
 * @deprecated useFireproofCtx is deprecated, use useFireproof instead
 */
export const FireproofCtx = {} as FireproofCtxValue

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
  name: string | Database = 'useFireproof',
  config: FireproofOptions = {},
): FireproofCtxValue {
  const database = (typeof name === 'string') ? fireproof(name, config) : name;

  function useDocument(initialDoc: Doc): [Doc, (newDoc: Doc) => void, () => Promise<void>] {
    const id = initialDoc._id;
    const [doc, setDoc] = useState(initialDoc);

    const saveDoc = useCallback(
      async () => {
        const putDoc = id ? { ...doc, _id: id } : doc;
        await database.put(putDoc as Doc)
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

  function useLiveQuery(mapFn: ((doc: Doc, map: (key: string, value: DocFragment) => void) => DocFragment) | string, query = {}, initialRows: any[] = []) {
    const [result, setResult] = useState({
      rows: initialRows,
      docs: initialRows.map((r) => r.doc),
    });

    const refreshRows = useCallback(async () => {
        const res = await database.query(mapFn, query)
        setResult({ ...res, docs: res.rows.map((r) => r.doc) });
    }, [JSON.stringify(query)]);

    useEffect(
      <React.EffectCallback>(() =>
        database.subscribe(() => {
          refreshRows();
        })),
      [database, refreshRows],
    );

    useEffect(() => {
      refreshRows();
    }, [mapFn.toString()]);

    return result;
  }

  return {
    useLiveQuery,
    useDocument,
    database,
    ready : true,
  };
}
