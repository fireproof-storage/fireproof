import React from 'react'
import { useContext } from 'react'
import { Link, useLoaderData, useRevalidator } from 'react-router-dom'
import InputArea from './InputArea'
import { FireproofCtx } from '../hooks/useFireproof'
import { TimeTravel } from './TimeTravel'
import { UploadManager, UploaderCtx } from '../hooks/useUploader'
import { useKeyring } from '@w3ui/react-keyring'
import { ListDoc } from '../interfaces'
import { makeQueryFunctions } from '../makeQueryFunctions'

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
  const { ready, database, addSubscriber } = useContext(FireproofCtx)
  const { addList } = makeQueryFunctions({ ready, database })

  const revalidator = useRevalidator()
  addSubscriber('AllLists', () => {
    // console.log('revalidating', name)
    revalidator.revalidate()
  })

  let lists = useLoaderData() as ListDoc[]
  if (lists.length == 0) {
    lists = threeEmptyLists
  }
  // now upload stuff
  // const { registered } = useContext(UploaderCtx)
  // const { registered } = useContext(UploaderCtx)
  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring()
  const registered = Boolean(space?.registered())
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
      <InputArea onSubmit={addList} placeholder="Create a new list or choose one" />
      <div className="dbInfo">
        <TimeTravel database={database} />
        <UploadManager registered={registered} />
      </div>
    </div>
  )
}
