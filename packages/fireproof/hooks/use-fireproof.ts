/* global localStorage */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useEffect, useState, createContext } from 'react'
import { Fireproof, Listener, Hydrator } from '../index'

export interface FireproofCtxValue {
  addSubscriber: (label: String, fn: Function) => void
  database: Fireproof
  ready: boolean
  persist: () => void
}
export const FireproofCtx = createContext<FireproofCtxValue>({
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
 * @function useFireproof
 * React hook to initialize a Fireproof database, automatically saving and loading the clock.
 * You might need to `import { nodePolyfills } from 'vite-plugin-node-polyfills'` in your vite.config.ts
 * @param [defineDatabaseFn] Synchronous function that defines the database, run this before any async calls
 * @param [setupDatabaseFn] Asynchronous function that sets up the database, run this to load fixture data etc
 * @returns {FireproofCtxValue} { addSubscriber, database, ready }
 */
export function useFireproof(
  defineDatabaseFn = (database: Fireproof) => {},
  setupDatabaseFn = async (database: Fireproof) => {},
  name: string
): FireproofCtxValue {
  const [ready, setReady] = useState(false)
  initializeDatabase(name || 'useFireproof')
  const localStorageKey = 'fp.' + database.name

  const addSubscriber = (label: String, fn: Function) => {
    inboundSubscriberQueue.set(label, fn)
  }

  const listenerCallback = async event => {
      localSet(localStorageKey, JSON.stringify(database))
    if (event._external) return
    for (const [, fn] of inboundSubscriberQueue) fn()
  }

  useEffect(() => {
    const doSetup = async () => {
      if (ready) return
      if (startedSetup) return
      startedSetup = true
      defineDatabaseFn(database) // define indexes before querying them
      console.log('Initializing database', database.name)
      const fp = localGet(localStorageKey) // todo use db.name
      if (fp) {
        try {
          const serialized = JSON.parse(fp)
          // console.log('serialized', JSON.stringify(serialized.indexes.map(c => c.clock)))
          console.log(`Loading previous database clock. (localStorage.removeItem('${localStorageKey}') to reset)`)
          await Hydrator.fromJSON(serialized, database)
          const changes = await database.changesSince()
          if (changes.rows.length < 2) {
            // console.log('Resetting database')
            throw new Error('Resetting database')
          }
        } catch (e) {
          console.error(`Error loading previous database clock. ${fp} Resetting.`, e)
          await Hydrator.zoom(database, [])
          await setupDatabaseFn(database)
          localSet(localStorageKey, JSON.stringify(database))
        }
      } else {
        await setupDatabaseFn(database)
        localSet(localStorageKey, JSON.stringify(database))
      }
      setReady(true)
      listener.on('*', listenerCallback)//hushed('*', listenerCallback, 250))
    }
    doSetup()
  }, [ready])

  return {
    addSubscriber,
    database,
    ready,
    persist: () => {
      localSet(localStorageKey, JSON.stringify(database))
    }
  }
}

const husherMap = new Map()
const husher = (id: string, workFn: { (): Promise<any> }, ms: number) => {
  if (!husherMap.has(id)) {
    const start: number = Date.now()
    husherMap.set(
      id,
      workFn().finally(() => setTimeout(() => husherMap.delete(id), ms - (Date.now() - start)))
    )
  }
  return husherMap.get(id)
}
const hushed =
  (id: string, workFn: { (...args): Promise<any> }, ms: number) =>
  (...args) =>
    husher(id, () => workFn(...args), ms)

let storageSupported = false
try {
  storageSupported = window.localStorage && true
} catch (e) {}
export function localGet(key: string) {
  if (storageSupported) {
    return localStorage && localStorage.getItem(key)
  }
}
function localSet(key: string, value: string) {
  if (storageSupported) {
    return localStorage && localStorage.setItem(key, value)
  }
}
// function localRemove(key) {
//   if (storageSupported) {
//     return localStorage && localStorage.removeItem(key)
//   }
// }
