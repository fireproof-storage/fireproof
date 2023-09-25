import { useEffect, useState, useCallback } from 'react';
import { fireproof } from '@fireproof/core';
import type { Doc, Database, DbResponse, MapFn, FireproofOptions } from '@fireproof/core';

type LiveQueryFnReturn = { docs: Doc[], rows: any[] }
type LiveQueryFn = (mapFn: string | MapFn, query?: object, initialRows?: any[]) => LiveQueryFnReturn;

type UseDocFnReturn = [Doc, (newDoc: Doc | false, replace?: boolean) => void, () => Promise<DbResponse>]
type UseDocFn = (initialDoc: Doc) => UseDocFnReturn

type TlUseLiveQuery = {
  (...args: Parameters<LiveQueryFn>): ReturnType<LiveQueryFn>
  database: Database
}

type TlUseDocument = {
  (...args: Parameters<UseDocFn>): ReturnType<UseDocFn>
  database: Database
}

export interface FireproofCtxValue {
  database: Database;
  useLiveQuery: LiveQueryFn
  useDocument: UseDocFn
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
}
export const useLiveQuery = topLevelUseLiveQuery as TlUseLiveQuery;

/**
 * Top level hook to initialize a Fireproof database and a document for it.
 * Uses default db name 'useFireproof'.
 */
const topLevelUseDocument = (...args) => {
  const { useDocument, database } = useFireproof();
  // @ts-ignore
  topLevelUseDocument.database = database;
  // @ts-ignore
  return useDocument(...args);
};
export const useDocument = topLevelUseDocument as TlUseDocument;

export function useFireproof(
  name: string | Database = 'useFireproof',
  config: FireproofOptions = {},
): FireproofCtxValue {
  const database = (typeof name === 'string') ? fireproof(name, config) : name;

  function useDocument(initialDoc: Doc): UseDocFnReturn {
    const id = initialDoc._id;
    const [doc, setDoc] = useState(initialDoc);

    const saveDoc = useCallback(
      async () => {
        const putDoc = id ? { ...doc, _id: id } : doc;
        return await database.put(putDoc as Doc)
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
      (newDoc, replace) => {
        if (newDoc) return replace ? setDoc(newDoc) :setDoc((d) => ({ ...d, ...newDoc }));
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
    }, [mapFn.toString(), JSON.stringify(query)]);

    return result;
  }

  return {
    useLiveQuery,
    useDocument,
    database,
    ready : true,
  };
}
