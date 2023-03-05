/* global localStorage */
import { useEffect, useState, createContext } from 'react'
import throttle from 'lodash.throttle'
import { useKeyring } from '@w3ui/react-keyring'
import { store } from '@web3-storage/capabilities/store'
import { Store } from '@web3-storage/upload-client'
import { InvocationConfig } from '@web3-storage/upload-client/types'
import { Fireproof, Index, Listener } from '@fireproof/core'
import {
  Route,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useRevalidator,
  createRoutesFromElements,
} from 'react-router-dom'

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

function localGet(key) {
  if (storageSupported) {
    return localStorage && localStorage.getItem(key)
  }
}

function localSet(key, value) {
  if (storageSupported) {
    return localStorage && localStorage.setItem(key, value)
  }
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(1) // determinstic fixtures

const loadFixtures = async (database) => {
  const fp = localGet('fireproof')
  if (fp) {
    console.log("Loading previous database clock. (delete localStorage['fireproof'] to reset)")
    const { clock } = JSON.parse(fp)
    return await database.setClock(clock)
  }
  const nextId = (prefix = '') => prefix + rand().toString(32).slice(2)

  const listTitles = ['Building Apps', 'Having Fun', 'Getting Groceries']
  const todoTitles = [
    [
      'In the browser',
      'On the phone',
      'With or without Redux',
      'Login components',
      'GraphQL queries',
      'Automatic replication and versioning',
    ],
    ['Rollerskating meetup', 'Motorcycle ride', 'Write a sci-fi story with ChatGPT'],
    ['Macadamia nut milk', 'Avocado toast', 'Coffee', 'Bacon', 'Sourdough bread', 'Fruit salad'],
  ]
  let ok
  for (let j = 0; j < 3; j++) {
    ok = await database.put({ title: listTitles[j], type: 'list', _id: nextId('' + j) })
    for (let i = 0; i < todoTitles[j].length; i++) {
      await database.put({
        _id: nextId(),
        title: todoTitles[j][i],
        listId: ok.id,
        completed: rand() > 0.75,
        type: 'todo',
        createdAt: '2' + i,
      })
    }
  }
  await database.allLists
    .query()
    .then(console.log)
    .catch(() => {}) // this will make the second run faster
  await database.todosbyList
    .query()
    .then(console.log)
    .catch(() => {}) // this will make the second run faster
  localSet('fireproof', JSON.stringify(database))
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

export default function useFireproof() {
  const [ready, setReady] = useState(false)

  const addSubscriber = (label, fn) => {
    inboundSubscriberQueue.set('label', fn)
  }

  const listenerCallback = () => {
    console.log('listenerCallback', database.clock)
    localSet('fireproof', JSON.stringify(database))
    for (const [, fn] of inboundSubscriberQueue) fn()
  }

  useEffect(() => {
    const doSetup = async () => {
      await loadFixtures(database)
      listener.on('*', throttle(listenerCallback, 250))
      setReady(true)
    }
    doSetup()
  }, [])

  const fetchAllLists = async () => {
    const lists = await database.allLists.query({ range: ['list', 'listx'] })
    return lists.rows.map((row) => row.value)
  }

  const fetchListWithTodos = async (_id) => {
    const list = await database.get(_id)
    const todos = await database.todosbyList.query({
      range: [
        [_id, '0'],
        [_id, '9'],
      ],
    })
    return { list, todos: todos.rows.map((row) => row.value) }
  }

  const addList = async (title) => {
    return await database.put({ title, type: 'list' })
  }

  const addTodo = async (listId, title) => {
    return await database.put({ completed: false, title, listId, type: 'todo', createdAt: new Date().toISOString() })
  }

  const toggle = async ({ completed, ...doc }) => {
    return await database.put({ completed: !completed, ...doc })
  }

  const destroy = async ({ _id }) => {
    return await database.del(_id)
  }

  const updateTitle = async (doc, title) => {
    doc.title = title
    return await database.put(doc)
  }

  const clearCompleted = async (listId) => {
    const todos = (
      await database.todosbyList.query({
        range: [
          [listId, '1'],
          [listId, 'x'],
        ],
      })
    ).rows.map((row) => row.value)
    const todosToDelete = todos.filter((todo) => todo.completed)
    for (const todoToDelete of todosToDelete) {
      await database.del(todoToDelete._id)
    }
  }

  return {
    fetchAllLists,
    fetchListWithTodos,

    addList,
    addTodo,
    // toggleAll,
    // load,
    toggle,
    destroy,
    updateTitle,
    clearCompleted,
    // onAuthChange
    // isLoading
    addSubscriber,
    database,
    ready,
  }
}

async function uploadCarBytes(conf: InvocationConfig, carCID: any, carBytes: Uint8Array) {
  console.log('storing carCID', carCID, JSON.stringify(conf))
  const storedCarCID = await Store.add(conf, new Blob([carBytes]))
  console.log('storedDarCID', storedCarCID)
}

export const useUploader = (database: Fireproof) => {
  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring()
  const registered = Boolean(space?.registered())

  useEffect(() => {
    console.log('all lists registered', registered)
    if (registered) {
      const setUploader = async () => {
        // todo move this outside of routed components?
        await loadAgent()
        const withness = space.did()
        const delegz = { with: withness, ...store }
        delegz.can = 'store/*'
        const conf = {
          issuer: agent,
          with: withness,
          proofs: await getProofs([delegz]),
        }
        database.setCarUploader((carCid: any, carBytes: Uint8Array) => {
          uploadCarBytes(conf, carCid, carBytes)
        })
      }
      setUploader()
    }
  }, [registered])
  return registered
}
