import React from 'react'
import { useState, useContext } from 'react'
import { useKeyring } from '@w3ui/react-keyring'
import { useNavigate, useParams, useLoaderData, useRevalidator } from 'react-router-dom'
import Footer from './Footer'
import InputArea from './InputArea'
import TodoItem from './TodoItem'
import { useFireproof } from 'use-fireproof'
import { TimeTravel } from './TimeTravel'
import { UploadManager } from '../hooks/useUploader'

import { ListLoaderData, TodoDoc } from '../interfaces'
import { makeQueryFunctions } from '../makeQueryFunctions'

const sleep = async (t: number) => new Promise(resolve => setTimeout(resolve, t))

export function List(): JSX.Element {
  // first data stuff
  const { database } = useFireproof()
  const { addTodo, toggle, destroy, clearCompleted, updateTitle } = makeQueryFunctions({
    ready: true,
    database
  })
  let { list, todos } = useLoaderData() as ListLoaderData
  const [editing, setEditing] = useState('')
  const revalidator = useRevalidator()
  database.subscribe(async () => {
    revalidator.revalidate()
  })

  // now upload stuff

  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring()
  const registered = Boolean(space?.registered())

  // now route stuff
  const navigate = useNavigate()
  const { filter } = useParams()
  const nowShowing = filter || 'all'
  const routeFilter = filter || ''
  const filteredTodos = {
    all: todos,
    active: todos.filter(todo => !todo.completed),
    completed: todos.filter(todo => todo.completed)
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
          const handle = (fn: (arg0: TodoDoc, arg1: string) => any) => (val: string) =>
            fn(todo, val)
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
      />
      <div className="dbInfo">
        <TimeTravel database={database} />
        {/* <UploadManager registered={registered} /> */}
      </div>
    </div>
  )
}
