/* global localStorage */
import { useEffect, useState, createContext } from 'react'
import throttle from 'lodash.throttle'
import { useKeyring } from '@w3ui/react-keyring'
import { Store } from '@web3-storage/upload-client'
import { InvocationConfig } from '@web3-storage/upload-client/types'
import { Fireproof, Index, Listener } from '@fireproof/core'
import { useRevalidator } from 'react-router-dom'

export const FireproofCtx = createContext<Fireproof>(null)

export function useRevalidatorAndSubscriber(name: string, addSubscriber: (name: string, fn: () => void) => void): void {
  const revalidator = useRevalidator()
  addSubscriber(name, () => {
    revalidator.revalidate()
  })
}

export const UploadManager = ({ registered }: { registered: Boolean }) => {
  if (registered) {
    return <p>Your changes are being saved to the public IPFS network with web3.storage</p>
  } else {
    return <SpaceRegistrar />
  }
}

function SpaceRegistrar(): JSX.Element {
  const [, { registerSpace }] = useKeyring()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  function resetForm(): void {
    setEmail('')
  }
  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSubmitted(true)
    try {
      await registerSpace(email)
    } catch (err) {
      console.log(err)
      throw new Error('failed to register', { cause: err })
    } finally {
      resetForm()
      setSubmitted(false)
    }
  }
  return (
    <div className="flex flex-col items-center space-y-24 pt-12">
      <div className="flex flex-col items-center space-y-2">
        <h3 className="text-lg">Verify your email address!</h3>
        <p>web3.storage is sending you a verification email. Please click the link.</p>
      </div>
      <div className="flex flex-col items-center space-y-4">
        <h5>Need a new verification email?</h5>
        <form
          className="flex flex-col items-center space-y-2"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            void onSubmit(e)
          }}
        >
          <input
            className="text-black px-2 py-1 rounded"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
          />
          <input type="submit" className="w3ui-button" value="Re-send Verification Email" disabled={email === ''} />
        </form>
        {submitted && <p>Verification re-sent, please check your email for a verification email.</p>}
      </div>
    </div>
  )
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
      <ol type={'1'}>
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
      </ol>
    </div>
  )
}

// const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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

declare global {
  interface Window {
    fireproof: Fireproof
  }
}
const defineDatabase = () => {
  const database = Fireproof.storage()
  database.allLists = new Index(database, function (doc, map) {
    if (doc.type === 'list') map(doc.type, doc)
  })
  database.todosbyList = new Index(database, function (doc, map) {
    if (doc.type === 'todo' && doc.listId) {
      map([doc.listId, doc.createdAt], doc)
    }
  })
  window.fireproof = database
  return database
}
const database = defineDatabase()
const listener = new Listener(database)
const inboundSubscriberQueue = new Map()

console.log('module fireproof loaded', database, database.allLists, database.todosbyList)

export default function useFireproof(setupFunction: Function): {
  addSubscriber: (label: String, fn: Function) => void
  database: Fireproof
  ready: boolean
} {
  const [ready, setReady] = useState(false)

  const addSubscriber = (label: String, fn: Function) => {
    inboundSubscriberQueue.set(label, fn)
  }

  const listenerCallback = () => {
    localSet('fireproof', JSON.stringify(database))
    for (const [, fn] of inboundSubscriberQueue) fn()
  }

  useEffect(() => {
    const doSetup = async () => {
      const fp = localGet('fireproof')
      if (fp) {
        console.log("Loading previous database clock. (delete localStorage['fireproof'] to reset)")
        const { clock } = JSON.parse(fp)
        await database.setClock(clock)
      } else {
        await setupFunction(database)
        localSet('fireproof', JSON.stringify(database))
      }
      listener.on('*', throttle(listenerCallback, 250))
      setReady(true)
    }
    doSetup()
  }, [])

  return {
    addSubscriber,
    database,
    ready,
  }
}

export async function uploadCarBytes(conf: InvocationConfig, carCID: any, carBytes: Uint8Array) {
  console.log('storing carCID', carCID, JSON.stringify(conf))
  const storedCarCID = await Store.add(conf, new Blob([carBytes]))
  console.log('storedCarCID', storedCarCID)
}
