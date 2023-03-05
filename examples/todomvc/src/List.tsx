import React from 'react'
import { useState, useContext } from 'react'
import { useNavigate, useParams, useLoaderData } from 'react-router-dom'
import Footer from './components/Footer'
import InputArea from './components/InputArea'
import TodoItem from './components/TodoItem'
import { FireproofCtx, UploadManager, useRevalidatorAndSubscriber, TimeTravel } from './hooks/useFireproof'
import { useUploader } from './hooks/useUploader'

import { ListLoaderData, TodoDoc } from './interfaces'

export function List(): JSX.Element {
  // first data stuff
  const { addTodo, toggle, destroy, clearCompleted, updateTitle, database, addSubscriber } = useContext(FireproofCtx)
  useRevalidatorAndSubscriber('one List', addSubscriber)
  let { list, todos } = useLoaderData() as ListLoaderData
  const [editing, setEditing] = useState('')
  // now upload stuff
  const registered = useUploader(database)
  // now route stuff
  const navigate = useNavigate()
  const { filter } = useParams()
  const nowShowing = filter || 'all'
  const routeFilter = filter || ''
  const filteredTodos = {
    all: todos,
    active: todos.filter((todo) => !todo.completed),
    completed: todos.filter((todo) => todo.completed),
  }
  const shownTodos = filteredTodos[nowShowing]
  // now action stuff
  const edit = (todo: TodoDoc) => () => setEditing(todo._id)
  const onClearCompleted = async () => await clearCompleted(list._id)
  const onSubmit = async (title: string) => await addTodo(list._id, title)
  return (
    <div>
      <div className="listNav">
        <button onClick={() => navigate('/')}>Back to all lists</button>
        <label>{list.title}</label>
      </div>

      <ul className="todo-list">
        {shownTodos.map((todo: TodoDoc) => {
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
      <InputArea onSubmit={onSubmit} placeholder="Add a new item to your list." />
      <Footer
        count={shownTodos.length}
        completedCount={filteredTodos['completed'].length}
        onClearCompleted={onClearCompleted}
        nowShowing={nowShowing}
        uri={routeFilter}
      />
      <TimeTravel database={database} />
      <UploadManager registered={registered} />
    </div>
  )
}
