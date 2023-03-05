/* global localStorage */
import { useEffect, useState, createContext } from 'react'
import throttle from 'lodash.throttle'
import { useKeyring } from '@w3ui/react-keyring'
import { Store } from '@web3-storage/upload-client'
import { InvocationConfig } from '@web3-storage/upload-client/types'
import { Fireproof, Index, Listener } from '@fireproof/core'
import { useRevalidator } from 'react-router-dom'

export const FireproofCtx = createContext<Fireproof>(null)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function useRevalidatorAndSubscriber(name: string, addSubscriber: (name: string, fn: () => void) => void): void {
  const revalidator = useRevalidator()
  addSubscriber(name, () => {
    console.log('revalidating', name)
    revalidator.revalidate()
  })
}

const shortLink = (l: string) => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`
const clockLog = new Set<string>()

export const TimeTravel = ({ database }) => {
  database.clock && database.clock.length && clockLog.add(database.clock.toString())
  const diplayClocklog = Array.from(clockLog).reverse()
  return (
    <div className="timeTravel">
      <h2>Time Travel</h2>
      {/* <p>Copy and paste a <b>Fireproof clock value</b> to your friend to share application state, seperate them with commas to merge state.</p> */}
      {/* <InputArea
      onSubmit={
        async (tex: string) => {
          await database.setClock(tex.split(','))
        }
      }
      placeholder='Copy a CID from below to rollback in time.'
      autoFocus={false}
    /> */}
      <p>
        Click a <b>Fireproof clock value</b> below to rollback in time.
      </p>
      <p>Clock log (newest first): </p>
      <ul>
        {diplayClocklog.map((entry) => (
          <li key={entry}>
            <button
              onClick={async () => {
                await database.setClock([entry])
              }}
            >
              {shortLink(entry)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

let storageSupported = false
try {
  storageSupported = window.localStorage && true
} catch (e) {}

export function localGet(key) {
  if (storageSupported) {
    return localStorage && localStorage.getItem(key)
  }
}

function localSet(key, value) {
  if (storageSupported) {
    return localStorage && localStorage.setItem(key, value)
  }
}

function localRemove(key) {
  if (storageSupported) {
    return localStorage && localStorage.removeItem(key)
  }
}

declare global {
  interface Window {
    fireproof: Fireproof
  }
}

const inboundSubscriberQueue = new Map()
const database = Fireproof.storage()
const listener = new Listener(database)

export function useFireproof(
  defineDatabaseFn: Function,
  setupFn: Function
): {
  rebuild: any
  addSubscriber: (label: String, fn: Function) => void
  database: Fireproof
  ready: boolean
} {
  const [ready, setReady] = useState(false)

  if (!ready) {
    defineDatabaseFn(database)
  }

  const addSubscriber = (label: String, fn: Function) => {
    inboundSubscriberQueue.set(label, fn)
  }

  const listenerCallback = () => {
    localSet('fireproof', JSON.stringify(database))
    for (const [, fn] of inboundSubscriberQueue) fn()
  }

  function rebuild() {
    console.log('rebuilding')
    localRemove('fireproof')
    setReady(false)
  }

  useEffect(() => {
    const doSetup = async () => {
      console.log('called doSetup')
      if (ready) return
      const fp = localGet('fireproof')
      if (fp) {
        const { clock } = JSON.parse(fp)
        console.log("Loading previous database clock. (delete localStorage['fireproof'] to reset)")
        await database.setClock(clock)
      } else {
        await setupFn(database)
        localSet('fireproof', JSON.stringify(database))
      }
      setReady(true)
      listener.on('*', throttle(listenerCallback, 250))
    }
    doSetup()
  }, [ready])

  return {
    addSubscriber,
    database,
    ready,
    rebuild,
  }
}

export async function uploadCarBytes(conf: InvocationConfig, carCID: any, carBytes: Uint8Array) {
  return await Store.add(conf, new Blob([carBytes]))
}
