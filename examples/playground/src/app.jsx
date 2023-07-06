import ReactDOM from 'react-dom'
import React, { useEffect, useState } from 'react'
import './style.css'
// import { Fireproof } from '../../../packages/fireproof/src/fireproof.js'
// import { useFireproof } from '../../../packages/react/dist/index.mjs'
import { Fireproof } from '../../../packages/fireproof/dist/src/fireproof.mjs'
// import { useFireproof } from '../../../packages/react/dist/index.mjs'
// import { useFireproof } from 'use-fireproof'
// console.log(Fireproof, useFireproof)

const database = Fireproof.storage('tomato-park')

window.fireproof = database

const App = () => {
  //   console.log('App')
  //   const { database, useLiveQuery, useDocument } = useFireproof()
//   console.log('database', database)

  const [items, setItems] = useState([])

  const [message, setMessage] = useState('')

  useEffect(() => {
    const onChange = async () => {
      const docs = await database.allDocuments()
      //   console.log('docs', docs)
      setItems(docs.rows)
    }
    onChange()
    return database.subscribe(onChange)
  }, [database])

  //   const items = useLiveQuery('type', { key: 'todo' }).docs
  //   const [doc, setDoc, saveDoc] = useDocument({ message: 'new todo', type: 'todo' })
  //   console.log('items', items)
  return (
    <>
      <h1>Welcome to Tomato Park</h1>
      <form>
        <input value={message} onChange={e => setMessage(e.target.value)} />
        <button
          onClick={e => {
            e.preventDefault()
            database.put({ message, type: 'todo' })
            setMessage('')
          }}
        >
          Save
        </button>
      </form>
      <ul>
        {items.map(item => (
          <li key={item.key}>{item.value.message}</li>
        ))}
      </ul>
    </>
  )
}

ReactDOM.render(<App />, document.getElementById('root'))
