// @ts-ignore
import { useEffect, useState, createContext } from 'react'
import { Fireproof, Listener } from '../src/fireproof.js'

/**
@typedef {Object} FireproofCtxValue
@property {Function} addSubscriber - A function to add a subscriber with a label and function.
@property {Fireproof} database - An instance of the Fireproof class.
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

function useLiveDoc (initialDoc) {
  const id = initialDoc._id
  const [doc, setDoc] = useState(initialDoc)

  const saveDoc = async newDoc => {
    await fireproof.put({ _id: id, ...newDoc })
  }
  const refreshDoc = useCallback(async () => {
    // todo add option for mvcc checks
    const got = await fireproof.get(id).catch(() => initialDoc)
    setDoc(got)
  }, [id, initialDoc])

  useEffect(
    () =>
      fireproof.registerListener(change => {
        if (change.find(c => c.key === id)) {
          refreshDoc()
        }
      }),
    [id, refreshDoc]
  )

  useEffect(() => {
    refreshDoc()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [doc, saveDoc]
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

  return {
    addSubscriber,
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
