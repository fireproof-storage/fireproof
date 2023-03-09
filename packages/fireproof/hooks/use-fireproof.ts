/* global localStorage */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useEffect, useState, createContext } from 'react'
import { Fireproof, Listener } from '@fireproof/core'

export interface FireproofCtxValue {
  addSubscriber: (label: String, fn: Function) => void
  database: Fireproof
  ready: boolean
}
export const FireproofCtx = createContext<FireproofCtxValue>({
  addSubscriber: () => {},
  database: null,
  ready: false,
})



const inboundSubscriberQueue = new Map()
const database = Fireproof.storage()
const listener = new Listener(database)

/**
 * @function useFireproof
 * React hook to initialize a Fireproof database, automatically saving and loading the clock.
 * @param [defineDatabaseFn] Synchronous function that defines the database, run this before any async calls
 * @param [setupDatabaseFn] Asynchronous function that sets up the database, run this to load fixture data etc
 * @returns {FireproofCtxValue} { addSubscriber, database, ready }
 */
export function useFireproof(defineDatabaseFn: Function, setupDatabaseFn: Function): FireproofCtxValue {
  const [ready, setReady] = useState(false)
  defineDatabaseFn = defineDatabaseFn || (() => {})
  setupDatabaseFn = setupDatabaseFn || (() => {})

  if (!ready) {
    defineDatabaseFn(database)
  }

  const addSubscriber = (label: String, fn: Function) => {
    inboundSubscriberQueue.set(label, fn)
  }

  const listenerCallback = async () => {
    localSet('fireproof', JSON.stringify(database))
    for (const [, fn] of inboundSubscriberQueue) fn()
  }

  useEffect(() => {
    const doSetup = async () => {
      if (ready) return
      const fp = localGet('fireproof')
      if (fp) {
        const { clock } = JSON.parse(fp)
        console.log("Loading previous database clock. (localStorage.removeItem('fireproof') to reset)")
        await database.setClock(clock)
        try {
          await database.changesSince()
        } catch (e) {
          console.error('Error loading previous database clock.', e)
          await database.setClock([])
          await setupDatabaseFn(database)
          localSet('fireproof', JSON.stringify(database))
        }
      } else {
        await setupDatabaseFn(database)
        localSet('fireproof', JSON.stringify(database))
      }
      setReady(true)
      listener.on('*', hushed('*', listenerCallback, 250))
    }
    doSetup()
  }, [ready])

  return {
    addSubscriber,
    database,
    ready,
  }
}

const husherMap = new Map()
const husher = (id: string, workFn: { (): Promise<any> }, ms: number) => {
  if (!husherMap.has(id)) {
    husherMap.set(
      id,
      workFn().finally(() => setTimeout(() => husherMap.delete(id), ms))
    )
  }
  return husherMap.get(id)
}
const hushed = (id: string, workFn: { (): Promise<any> }, ms: number) => () => husher(id, workFn, ms)

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