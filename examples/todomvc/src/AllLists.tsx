import React from 'react'
import { useContext } from 'react'
import { Link, useLoaderData } from 'react-router-dom'
import InputArea from './components/InputArea'
import {
  FireproofCtx,
  useUploader,
  useRevalidatorAndSubscriber,
  SpaceRegistrar,
  TimeTravel,
} from './hooks/useFireproof'

import { ListDoc } from './interfaces'

const threeEmptyLists: ListDoc[] = [
  { title: '', _id: '', type: 'list' },
  { title: '', _id: '', type: 'list' },
  { title: '', _id: '', type: 'list' },
]

const todoItems = ({ title, _id }: ListDoc, i: number) => {
  if (_id === '') {
    return (
      <li key={_id || i}>
        <label>&nbsp;</label>
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
}

/**
 * A React functional component that renders a list of todo lists.
 *
 * @returns {JSX.Element}
 *   A React element representing the rendered lists.
 */
export function AllLists(): JSX.Element {
  // first data stuff
  const { addList, database, addSubscriber } = useContext(FireproofCtx)
  useRevalidatorAndSubscriber('AllLists', addSubscriber)
  let lists = useLoaderData() as ListDoc[]
  if (lists.length == 0) {
    lists = threeEmptyLists
  }

  // now upload stuff
  const registered = useUploader(database)

  // now action stuff
  const onSubmit = async (title: string) => await addList(title)

  return (
    <div>
      <div className="listNav">
        <button
          onClick={async () => {
            console.log('await database.changesSince()', await database.changesSince())
          }}
        >
          Choose a list.
        </button>
        <label></label>
      </div>
      <ul className="todo-list">{lists.map(todoItems)}</ul>
      <InputArea onSubmit={onSubmit} placeholder="Create a new list or choose one" />
      <TimeTravel database={database} />
      {!registered && <SpaceRegistrar />}
    </div>
  )
}
