import ReactDOM from 'react-dom'
import './style.css'
// import { Fireproof } from '../../../packages/fireproof/src/fireproof.js'
// import { useFireproof } from '../../../packages/react/dist/index.mjs'
import { Fireproof } from '../../../packages/fireproof/dist/src/fireproof.mjs'
// import { useFireproof } from '../../../packages/react/dist/index.mjs'
import { useFireproof } from 'use-fireproof'
// console.log(Fireproof, useFireproof)

let myDatabase = null
if (!myDatabase) {
  myDatabase = Fireproof.storage('tomato-park')
}

const App = () => {
  console.log('App')
  const { database, useLiveQuery, useDocument } = useFireproof(myDatabase)
  console.log('database', database)
  const items = useLiveQuery('type', { key: 'todo' }).docs
  const [doc, setDoc, saveDoc] = useDocument({ message: 'new todo', type: 'todo' })
  console.log('items', items)
  return (
    <>
      <h1>Welcome to Tomato Park</h1>
      <form>
        <input value={doc.message} onChange={e => setDoc({ message: e.target.value })} />
        <button
          onClick={e => {
            e.preventDefault()
            saveDoc()
          }}
        >
          Save
        </button>
      </form>
      <ul>
        {items.map(item => (
          <li key={item.key}>{item.message}</li>
        ))}
      </ul>
    </>
  )
}

ReactDOM.render(<App />, document.getElementById('root'))
