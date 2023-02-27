import { useState, createContext, useContext, useEffect } from 'react'
import { Fireproof } from '../../../'
import useFireproof from './hooks/useFireproof'
import reactLogo from './assets/react.svg'
import './App.css'
import {
  Route, Link, RouterProvider, createBrowserRouter,
  createRoutesFromElements, useNavigate, useParams, useLoaderData
} from "react-router-dom";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router-dom";
import AppHeader from './components/AppHeader/index.jsx';
import Footer from './components/Footer'
import Spinner from './components/Spinner'
import InputArea from './components/InputArea'
import TodoItem from './components/TodoItem'

export const FireproofCtx = createContext<Fireproof>(null)

function Login() {
  // const { user, doLogin, doLogout } = useContext(UserCtx)
  const user = null
  const doLogin = () => { }
  const doLogout = () => { }

  const style = { cursor: 'pointer' }
  const actionForm = (
    <span>
      <button style={style} onClick={doLogin}>
        Login or Sign Up to sync your todos
      </button>
    </span>
  )
  return (
    <div className='Login'>
      {user
        ? (
          <button style={style} onClick={doLogout}>
            Logout
          </button>
        )
        : (
          actionForm
        )}
    </div>
  )
}

function AllLists() {
  const { addList } = useContext(FireproofCtx)
  const navigate = useNavigate()
  let lists = useLoaderData() as ListDoc[];
  const onSubmit = async (title: string) => {
    const { id } = await addList(title)
    navigate(`/list/${id}`)
  }
  return (
    <div>
      <div className='listNav'>
        <label>Choose a list.</label>
      </div>
      <section className='main'>
        <ul className='todo-list'>
          {lists.map(({ title, _id }) => {
            return (
              <li key={_id}>
                <label>
                  <Link to={`/list/${_id}`}>{title}</Link>
                </label>
              </li>
            )
          })}
        </ul>
      </section>
      <InputArea
        onSubmit={onSubmit}
        placeholder='Create a new list or choose from above.'
      />
    </div>
  )
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

function List() {
  const {
    addTodo,
    toggle,
    destroy,
    clearCompleted,
    updateTitle
  } = useContext(FireproofCtx)
  let params = useParams();
  const [hack, setHack] = useState(0)


  let { list, todos } = useLoaderData() as ListLoaderData;
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
        <button onClick={() => navigate('/')}>back to all lists</button>
        <label>List: {list.title}</label>
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
    </div>
  )
}

const NotFound = () => (
  <div>
    <h2>Not found</h2>
    <p>Sorry, nothing here.</p>
    <Link to='/'>Go back to the main page.</Link>
  </div>
)

interface ListLoaderData {
  list: ListDoc
  todos: TodoDoc[]
}


function App() {
  const [hack, setHack] = useState(0)
  const fireproof = useFireproof({
    refresh: () => {
      setHack(hack + 1)
    }
  })
  const { fetchListWithTodos, fetchAllLists, ready } = fireproof

  async function listLoader({ params: { listId } }: LoaderFunctionArgs): Promise<ListLoaderData> {
    return await fetchListWithTodos(listId)
  }

  async function allListLoader({ params }: LoaderFunctionArgs): Promise<ListDoc[]> {
    return await fetchAllLists()
  }

  let router = createBrowserRouter(
    createRoutesFromElements(
      <>
        <Route path='/' loader={allListLoader} element={<AllLists />} />
        <Route path='list'>
          <Route path=':listId' loader={listLoader} element={<List />} >
            <Route path='active' element={<List />} />
            <Route path='completed' element={<List />} />
          </Route>
        </Route>
      </>
    )
  );

  return (
    <FireproofCtx.Provider value={fireproof}>
      <AppHeader />
      <div>
        <header className='header'>
          <Login />
          {ready && <RouterProvider router={router} fallbackElement={<NotFound />} />}
        </header>
      </div>
    </FireproofCtx.Provider>
  )
}

export default App
