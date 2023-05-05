// @ts-ignore
import { useEffect, useState, useCallback, createContext } from 'react'
import { Fireproof, Index } from '@fireproof/core'

/**
@typedef {Object} FireproofCtxValue
@property {Fireproof} database - An instance of the Fireproof class.
@property {Function} useLiveQuery - A hook to return a query result
@property {Function} useLiveDocument - A hook to return a live document
@property {boolean} ready - A boolean indicating whether the database is ready.
*/
export const FireproofCtx = createContext({
  useLiveQuery: () => {},
  useLiveDocument: () => {},
  database: null,
  ready: false
})

let startedSetup = false
let database
const initializeDatabase = (name) => {
  if (database) return
  database = Fireproof.storage(name)
};

/**
@function useFireproof
React hook to initialize a Fireproof database.
You might need to import { nodePolyfills } from 'vite-plugin-node-polyfills' in your vite.config.ts
@param {string} name - The path to the database file
@param {function(database): void} [defineDatabaseFn] - Synchronous function that defines the database, run this before any async calls
@param {function(database): Promise<void>} [setupDatabaseFn] - Asynchronous function that sets up the database, run this to load fixture data etc
@returns {FireproofCtxValue} { useLiveQuery, useLiveDocument, database, ready }
*/
export function useFireproof (
  name = 'useFireproof',
  defineDatabaseFn = () => {},
  setupDatabaseFn = async () => {}
) {
  const [ready, setReady] = useState(false)
  initializeDatabase(name)
  useEffect(() => {
    const doSetup = async () => {
      if (ready || startedSetup) return
      startedSetup = true
      // define indexes before querying them
      defineDatabaseFn(database)
      if (database.clock.length === 0) {
        await setupDatabaseFn(database)
      }
      setReady(true)
    };
    doSetup()
  }, [ready])

  function useLiveDocument (initialDoc) {
    const id = initialDoc._id
    const [doc, setDoc] = useState(initialDoc)

    const saveDoc = useCallback(
      async (newDoc) => await database.put({ _id: id, ...newDoc }),
      [id]
    );

    const refreshDoc = useCallback(async () => {
      // todo add option for mvcc checks
      setDoc(await database.get(id).catch(() => initialDoc))
    }, [id, initialDoc])

    useEffect(
      () =>
        database.subscribe((change) => {
          if (change.find((c) => c.key === id)) {
            refreshDoc() // todo use change.value
          }
        }),
      [id, refreshDoc]
    );

    useEffect(() => refreshDoc(), [])

    return [doc, saveDoc]
  }

  function useLiveQuery (mapFn, query = null, initialRows = []) {
    const [rows, setRows] = useState({ rows: initialRows, proof: {} })
    const [index, setIndex] = useState(null)

    const refreshRows = useCallback(async () => {
      if (index) setRows(await index.query(query || {}))
    }, [index, JSON.stringify(query)])

    useEffect(
      () =>
        database.subscribe(() => {
          refreshRows()
        }),
      [refreshRows]
    );

    useEffect(() => refreshRows(), [index])

    useEffect(() => {
      setIndex(new Index(database, null, mapFn))
    }, [mapFn.toString()])

    return rows
  }

  return {
    useLiveQuery,
    useLiveDocument,
    database,
    ready
  };
}
