// @ts-ignore
import { useEffect, useState, useCallback, createContext } from 'react'
import { Fireproof, Index, Listener } from '@fireproof/core'

/**
@typedef {Object} FireproofCtxValue
@property {Function} addSubscriber - A function to add a subscriber with a label and function.
@property {Fireproof} database - An instance of the Fireproof class.
@property {Function} useLiveQuery - A hook to return a query result
@property {Function} useLiveDocument - A hook to return a live document
@property {boolean} ready - A boolean indicating whether the database is ready.
@param {string} label - A label for the subscriber.
@param {Function} fn - A function to be added as a subscriber.
@returns {void}
*/
export const FireproofCtx = createContext({
  addSubscriber: () => {},
  database: null,
  ready: false
})

const inboundSubscriberQueue = new Map()

let startedSetup = false
let database
let listener
const initializeDatabase = name => {
  if (database) return
  database = Fireproof.storage(name)
  listener = new Listener(database)
}

/**
@function useFireproof
React hook to initialize a Fireproof database, automatically saving and loading the clock.
You might need to import { nodePolyfills } from 'vite-plugin-node-polyfills' in your vite.config.ts
@param {string} name - The path to the database file
@param {function(database): void} [defineDatabaseFn] - Synchronous function that defines the database, run this before any async calls
@param {function(database): Promise<void>} [setupDatabaseFn] - Asynchronous function that sets up the database, run this to load fixture data etc
@returns {FireproofCtxValue} { addSubscriber, database, ready }
*/
export function useFireproof (name = 'useFireproof', defineDatabaseFn = () => {}, setupDatabaseFn = async () => {}) {
  const [ready, setReady] = useState(false)
  initializeDatabase(name)

  const addSubscriber = (label, fn) => {
    inboundSubscriberQueue.set(label, fn)
  }

  const listenerCallback = async event => {
    if (event._external) return
    for (const [, fn] of inboundSubscriberQueue) fn()
  }

  useEffect(() => {
    const doSetup = async () => {
      if (ready) return
      if (startedSetup) return
      startedSetup = true
      defineDatabaseFn(database) // define indexes before querying them
      if (database.clock.length === 0) {
        await setupDatabaseFn(database)
      }
      setReady(true)
      listener.on('*', listenerCallback) // hushed('*', listenerCallback, 250))
    }
    doSetup()
  }, [ready])

  function useLiveDocument (initialDoc) {
    const id = initialDoc._id
    const [doc, setDoc] = useState(initialDoc)

    const saveDoc = async newDoc => {
      await database.put({ _id: id, ...newDoc })
    }
    const refreshDoc = useCallback(async () => {
      // todo add option for mvcc checks
      const got = await database.get(id).catch(() => initialDoc)
      setDoc(got)
    }, [id, initialDoc])

    useEffect(
      () =>
        database.registerListener(change => {
          if (change.find(c => c.key === id)) {
            refreshDoc()
          }
        }),
      [id, refreshDoc]
    )

    useEffect(() => {
      refreshDoc()
    }, [])

    return [doc, saveDoc]
  }

  function useLiveQuery (mapFn, query = {}, initialRows = []) {
    const [rows, setRows] = useState(initialRows)
    const [index, setIndex] = useState(null)

    const refreshRows = useCallback(async () => {
      const got = await index.query(query)
      setRows(got)
    }, [index, query])

    useEffect(
      () =>
        // todo listen to index changes
        database.registerListener(() => {
          refreshRows()
        }),
      [refreshRows]
    )

    useEffect(() => {
      const index = new Index(database, null, mapFn) // this should only be created once
      setIndex(index)
    }, [])

    return rows
  }

  return {
    addSubscriber,
    useLiveQuery,
    useLiveDocument,
    database,
    ready
  }
}

// const husherMap = new Map()
// const husher = (id, workFn, ms) => {
//   if (!husherMap.has(id)) {
//     const start = Date.now()
//     husherMap.set(
//       id,
//       workFn().finally(() => setTimeout(() => husherMap.delete(id), ms - (Date.now() - start)))
//     )
//   }
//   return husherMap.get(id)
// }
// const hushed =
//   (id, workFn, ms) =>
//     (...args) =>
//       husher(id, () => workFn(...args), ms)

// let storageSupported = false
// try {
//   storageSupported = window.localStorage && true
// } catch (e) {}
// export function localGet (key) {
//   if (storageSupported) {
//     return localStorage && localStorage.getItem(key)
//   }
// }
// function localSet (key, value) {
//   if (storageSupported) {
//     return localStorage && localStorage.setItem(key, value)
//   }
// }
// function localRemove(key) {
//   if (storageSupported) {
//     return localStorage && localStorage.removeItem(key)
//   }
// }
