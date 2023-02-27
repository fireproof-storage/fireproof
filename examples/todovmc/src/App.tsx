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
  // const {  addList } = useContext(FireproofCtx)
  let lists = useLoaderData() as ListDoc[];

  const onSubmit = (title: string) => { }
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
                {/* <label onClick={() => alert('go')}>{data.title}</label> */}
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

function List(props: { path?: string; listId?: any; uri?: any }) {
  const {
    fetchList,
    isLoading,
    addTodo,
    toggle,
    destroy,
    load,
    clearCompleted,
    save
  } = useContext(FireproofCtx)

  let params = useParams();
  let data = useLoaderData() as ListDoc;
  console.log('load data', { params, data })
  const [state, realsetState] = useState<AppState>({
    list: {
      _id: 'chillout-typescript',
      type: "list",
      title: "Loading..."
    }, todos: [], err: null
  })
  function setState(state) {
    console.log('setStatenew', state)
    return realsetState(state)
  }
  const { listId, uri } = props
  // console.log('list', props)
  // const pathFlag = props.path?.split('/')[1] || 'all'
  const pathFlag = 'all'
  console.log({ pathFlag, uri, listId, state })
  const shownTodos = {
    all: state.todos,
    active: state.todos.filter((todo) => !todo.completed),
    completed: state.todos.filter((todo) => todo.completed)
  }[pathFlag]


  const [editing, setEditing] = useState(null)
  const navigate = useNavigate()
  const edit = (todo) => () => setEditing(todo._id)
  const onClearCompleted = () =>
    load(clearCompleted(state.list, listId).then(setState))
  return (
    <div>
      {(isLoading) && <Spinner />}
      <div className='listNav'>
        <label>List: {state.list.title}</label>
        <button onClick={() => navigate('/')}>back to all lists</button>
      </div>
      <ul className='todo-list'>
        {state.err
          ? (
            <div>{JSON.stringify(state.err, null, 2)} </div>
          )
          : (
            shownTodos &&
            shownTodos.map((todo) => {
              const handle = (fn) => () => load(fn(todo, listId).then(setState))
              return (
                <TodoItem
                  key={todo._id}
                  todo={todo}
                  onToggle={handle(toggle)}
                  onDestroy={handle(destroy)}
                  onEdit={edit(todo)}
                  editing={editing === todo._id}
                  onSave={(val) => handle(save(val))()}
                  onCancel={console.log}
                />
              )
            })
          )}
      </ul>
      <InputArea
        onSubmit={(title) =>
          load(addTodo(state.list, listId)(title).then(setState))}
        placeholder='Add a new item to your list.'
      />

      {state.todos && (
        <Footer
          count={shownTodos.length}
          completedCount={
            state.todos.filter((todo) => todo.completed).length
          }
          onClearCompleted={onClearCompleted}
          nowShowing={pathFlag}
          uri={uri && uri.split('/').slice(0, 3).join('/')}
        />
      )}
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



function App() {
  const fireproof = useFireproof()
  const { fetchList, fetchAllLists, ready } = fireproof

  async function listLoader({ params: { listId } }: LoaderFunctionArgs): Promise<ListDoc> {
    return await fetchList(listId)
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
