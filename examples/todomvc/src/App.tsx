import React from 'react';
import { useState, createContext, useContext, useEffect } from 'react'
import { Fireproof } from '@fireproof/core'
import useFireproof from './hooks/useFireproof'
import { useKeyring } from '@w3ui/react-keyring'
import reactLogo from './assets/react.svg'
import './App.css'
import {
  Route, Link, Outlet, RouterProvider, createBrowserRouter, useRevalidator,
  createRoutesFromElements, useNavigate, useParams, useLoaderData
} from "react-router-dom";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router-dom";
import AppHeader from './components/AppHeader/index.jsx';
import Footer from './components/Footer'
import Spinner from './components/Spinner'
import InputArea from './components/InputArea'
import TodoItem from './components/TodoItem'
import { W3APIProvider } from './components/W3API'
import { Authenticator, AuthenticationForm, AuthenticationSubmitted } from './components/Authenticator'
import { Store } from '@web3-storage/upload-client'
import { store } from '@web3-storage/capabilities/store'
import { InvocationConfig } from '@web3-storage/upload-client/types'


export const FireproofCtx = createContext<Fireproof>(null)


// w3ui keyring

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
    <div className='flex flex-col items-center space-y-24 pt-12'>
      <div className='flex flex-col items-center space-y-2'>
        <h3 className='text-lg'>Verify your email address!</h3>
        <p>
          web3.storage is sending you a verification email. Please click the link.
        </p>
      </div>
      <div className='flex flex-col items-center space-y-4'>
        <h5>Need a new verification email?</h5>
        <form
          className='flex flex-col items-center space-y-2'
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            void onSubmit(e)
          }}
        >
          <input
            className='text-black px-2 py-1 rounded'
            type='email'
            placeholder='Email'
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
          />
          <input
            type='submit'
            className='w3ui-button'
            value='Re-send Verification Email'
            disabled={email === ''}
          />
        </form>
        {submitted && (
          <p>
            Verification re-sent, please check your email for a verification
            email.
          </p>
        )}
      </div>
    </div>
  )
}

async function uploadCarBytes(conf: InvocationConfig, carCID: any, carBytes: Uint8Array) {
  console.log('storing carCID', carCID, JSON.stringify(conf))
  const storedCarCID = await Store.add(conf, new Blob([carBytes]))
  console.log('storedDarCID', storedCarCID)
}


interface Doc {
  _id: string
}

interface TodoDoc extends Doc {
  completed: boolean
  title: string
  listId: string
  type: "todo"
}
interface ListDoc extends Doc {
  title: string
  type: "list"
}


interface AppState {
  list: ListDoc,
  todos: TodoDoc[],
  err: Error | null
}



const shortLink = l => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`
const clockLog = new Set<string>()

const TimeTravel = ({ database }) => {
  database.clock && database.clock.length && clockLog.add(database.clock.toString())
  const diplayClocklog = Array.from(clockLog).reverse()
  return (<div className='timeTravel'>
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
    <p>Click a <b>Fireproof clock value</b> below to rollback in time.</p>
    <p>Clock log (newest first): </p>
    <ol type={"1"}>
      {diplayClocklog.map((entry) => (
        <li key={entry}>
          <button onClick={async () => {
            await database.setClock([entry])
          }} >{shortLink(entry)}</button>
        </li>
      ))}
    </ol>
  </div>)
}





/**
 * A React functional component that renders a list of todo lists.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered lists.
 */
function AllLists(): JSX.Element {
  const { addList, database, addSubscriber } = useContext(FireproofCtx)
  const navigate = useNavigate()
  let lists = useLoaderData() as ListDoc[];
  const revalidator = useRevalidator()
  addSubscriber('AllLists', () => {
    revalidator.revalidate();
  })
  if (lists.length == 0) {
    lists = [{ title: '', _id: '', type: 'list' }, { title: '', _id: '', type: 'list' }, { title: '', _id: '', type: 'list' }]
  }

  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring()
  const registered = Boolean(space?.registered())
  const onSubmit = async (title: string) => {
    const { id } = await addList(title)
  }


  useEffect(() => {
    console.log('all lists registered', registered)
    if (registered) {
      const setUploader = async () => { // todo move this outside of routed components?
        await loadAgent();
        const withness = space.did()
        const delegz = { with: withness, ...store}
        delegz.can =  "store/*"
        const conf = {
          issuer: agent,
          with: withness,
          proofs: await getProofs([delegz]),
        }
        database.setCarUploader((carCid, carBytes) => {
          uploadCarBytes(conf, carCid, carBytes)
        })
      }
      setUploader()
    }
  }, [registered])

  return (
    <div>
      <div className='listNav'>
        <button onClick={async () => {
          const allDocs = await database.changesSince()
          console.log('allDocs', allDocs.rows)
        }}>Choose a list.</button>
        <label></label>
      </div>
      <section className='main'>
        <ul className='todo-list'>
          {lists.map(({ title, _id }, i) => {
            if (_id === '') {
              return (
                <li key={_id || i}>
                  <label>
                    &nbsp;
                  </label>
                </li>
              )
            } else {
              return (
                <li key={_id || i}>
                  <label>
                    <Link to={`/list/${_id}`}>{title}</Link>
                  </label>
                </li>
              )
            }

          })}
        </ul>
      </section>
      <InputArea
        onSubmit={onSubmit}
        placeholder='Create a new list or choose one'
      />
      <TimeTravel database={database} />
      {!registered && <SpaceRegistrar />}
    </div>
  )
}

/**
 * A React functional component that renders a list.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered list.
 */
function List(): JSX.Element {
  const {
    addTodo,
    toggle,
    destroy,
    clearCompleted,
    updateTitle, database, addSubscriber
  } = useContext(FireproofCtx)
  let { list, todos } = useLoaderData() as ListLoaderData;

  const revalidator = useRevalidator()
  addSubscriber('one List', () => {
    revalidator.revalidate();
  })

  const pathFlag = 'all'
  const uri = window.location.pathname
  const filteredTodos = {
    all: todos,
    active: todos.filter((todo) => !todo.completed),
    completed: todos.filter((todo) => todo.completed)
  }
  const shownTodos = filteredTodos[pathFlag]


  const [editing, setEditing] = useState("")
  const navigate = useNavigate()
  const edit = (todo: TodoDoc) => () => setEditing(todo._id)
  const onClearCompleted = async () => await clearCompleted(list._id)




  return (
    <div>
      <div className='listNav'>
        <button onClick={() => navigate('/')}>Back to all lists</button>
        <label>{list.title}</label>
      </div>
      <ul className='todo-list'>
        {shownTodos.map((todo) => {
          const handle = (fn: (arg0: TodoDoc, arg1: string) => any) => (val: string) => fn(todo, val)
          return (
            <TodoItem
              key={todo._id}
              todo={todo}
              onToggle={handle(toggle)}
              onDestroy={handle(destroy)}
              onSave={handle(updateTitle)}
              onEdit={edit(todo)}
              editing={editing === todo._id}
              onCancel={console.log}
            />
          )
        })}
      </ul>
      <InputArea
        onSubmit={async (title: string) =>
          await addTodo(list._id, title)
        }
        placeholder='Add a new item to your list.'

      />

      <Footer
        count={shownTodos.length}
        completedCount={
          filteredTodos['completed'].length
        }
        onClearCompleted={onClearCompleted}
        nowShowing={pathFlag}
        uri={uri && uri.split('/').slice(0, 3).join('/')}
      />
      <TimeTravel database={database} />
    </div>
  )
}


/**
 * A React functional component that runs when a route is loading.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered list.
 */
const LoadingView = (): JSX.Element => {
  console.log('fixme: rendering missing route screen')
  return (
    <>
      <AppHeader />
      <div>
        <header className='header'>
          <div>
            <div className='listNav'>
              <button>Loading...</button>
              <label></label>
            </div>
            <section className='main'>
              <ul className='todo-list'>
                <li><label>&nbsp;</label></li>
                <li><label>&nbsp;</label></li>
                <li><label>&nbsp;</label></li>
              </ul>
            </section>
            <InputArea
              placeholder='Create a new list or choose one'
            />
          </div>
        </header>
      </div>
    </>
  )
}

interface ListLoaderData {
  list: ListDoc
  todos: TodoDoc[]
}

/**
 * A React functional component that wraps around <List/> and <AllLists/>.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered list.
 */
function Layout(): JSX.Element {
  return (
    <>
      <AppHeader />
      <div>
        <header className='header'>
          {/* <Login /> */}
          <Outlet />
        </header>
      </div>
    </>
  );
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
      <Route element={<Layout />} >
        <Route path='/' loader={allListLoader} element={<AllLists />} />
        <Route path='list'>
          <Route path=':listId' loader={listLoader} element={<List />} >
            <Route path='active' element={<List />} />
            <Route path='completed' element={<List />} />
          </Route>
        </Route>
      </Route>
    ), { basename: pageBase });
  return (
    <FireproofCtx.Provider value={fireproof}>
      <W3APIProvider uploadsListPageSize={20}>
        <Authenticator className='h-full'>
          <RouterProvider router={router} fallbackElement={<LoadingView />} />
        </Authenticator>
      </W3APIProvider>
    </FireproofCtx.Provider>
  )
}

export default App
