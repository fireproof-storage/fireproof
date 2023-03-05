import React from 'react'
import { useState, createContext, useEffect, ReactNode } from 'react'
import { Fireproof } from '@fireproof/core'
import useFireproof from './hooks/useFireproof'
import { useKeyring } from '@w3ui/react-keyring'
import reactLogo from './assets/react.svg'
import './App.css'
import {
  Route,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useRevalidator,
  createRoutesFromElements,
} from 'react-router-dom'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import AppHeader from './components/AppHeader/index.jsx'
import Spinner from './components/Spinner'
import InputArea from './components/InputArea'
import { W3APIProvider } from './components/W3API'
import { Authenticator, AuthenticationForm, AuthenticationSubmitted } from './components/Authenticator'

import { List } from './List'
import { AllLists } from './AllLists'

export const FireproofCtx = createContext<Fireproof>(null)

export interface ListLoaderData {
  list: ListDoc
  todos: TodoDoc[]
}

interface LayoutProps {
  children?: ReactNode
}

interface Doc {
  _id: string
}

export interface TodoDoc extends Doc {
  completed: boolean
  title: string
  listId: string
  type: 'todo'
}
export interface ListDoc extends Doc {
  title: string
  type: 'list'
}

interface AppState {
  list: ListDoc
  todos: TodoDoc[]
  err: Error | null
}

export const threeEmptyLists: ListDoc[] = [
  { title: '', _id: '', type: 'list' },
  { title: '', _id: '', type: 'list' },
  { title: '', _id: '', type: 'list' },
]

// w3ui keyring

export function SpaceRegistrar(): JSX.Element {
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

export function useRevalidatorAndSubscriber(name: string, addSubscriber: (name: string, fn: () => void) => void): void {
  const revalidator = useRevalidator()
  addSubscriber(name, () => {
    revalidator.revalidate()
  })
}

/**
 * A React functional component that renders a list.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered list.
 */

const LoadingView = (): JSX.Element => {
  console.log('fixme: rendering missing route screen')
  return (
    <Layout>
      <div>
        <div className="listNav">
          <button>Loading...</button>
          <label></label>
        </div>
        <section className="main">
          <ul className="todo-list">
            <li>
              <label>&nbsp;</label>
            </li>
            <li>
              <label>&nbsp;</label>
            </li>
            <li>
              <label>&nbsp;</label>
            </li>
          </ul>
        </section>
        <InputArea placeholder="Create a new list or choose one" />
      </div>
    </Layout>
  )
}

/**
 * A React functional component that wraps around <List/> and <AllLists/>.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered list.
 */
function Layout({ children }: LayoutProps): JSX.Element {
  return (
    <>
      <AppHeader />
      <div>
        <header className="header">{children ? <>{children}</> : <Outlet />}</header>
      </div>
    </>
  )
}

const pageBase = document.location.pathname.split('/list')[0] || ''

function App() {
  const fireproof = useFireproof()
  const { fetchListWithTodos, fetchAllLists } = fireproof

  async function listLoader({ params: { listId } }: LoaderFunctionArgs): Promise<ListLoaderData> {
    return await fetchListWithTodos(listId)
  }

  async function allListLoader({ params }: LoaderFunctionArgs): Promise<ListDoc[]> {
    return await fetchAllLists()
  }

  let router = createBrowserRouter(
    createRoutesFromElements(
      <Route element={<Layout />}>
        <Route path="/" loader={allListLoader} element={<AllLists />} />
        <Route path="list">
          <Route path=":listId" loader={listLoader} element={<List />}>
            <Route path=":filter" element={<List />} />
          </Route>
        </Route>
      </Route>
    ),
    { basename: pageBase }
  )
  return (
    <FireproofCtx.Provider value={fireproof}>
      <W3APIProvider uploadsListPageSize={20}>
        {/* <Authenticator className='h-full'> */}
        <RouterProvider router={router} fallbackElement={<LoadingView />} />
        {/* </Authenticator> */}
      </W3APIProvider>
    </FireproofCtx.Provider>
  )
}

export default App
