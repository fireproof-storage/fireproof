# useFireproof React hook

React hook to initialize a Fireproof database, automatically saving and loading the clock.

The hook takes two optional setup function arguments, `defineDatabaseFn` and `setupDatabaseFn`. See below for examples.
 
The return value looks like `{ useLiveQuery, useLiveDocument, database, ready }` where the `database` is the Fireproof instance that you can interact with using `put` and `get`, or via your indexes. The `ready` flag turns true after setup completes, you can use this to activate your UI. The `useLiveQuery` and `useLiveDocument` functions are hooks used to update your app in real-time.

Changes made via remote sync peers, or other members of your cloud replica group will appear automatically if you use these APIs. Makes writing collaborative workgroup software, and multiplayer games super easy.

## Usage Example

In larger apps you set up your context in App.js, and then use it in other components. This allows you to easily share
your index definitions and other setup code across your app. Here is what you might see in App.js:

```js
import { FireproofCtx, useFireproof } from '@fireproof/core/hooks/use-fireproof'

function App() {
  // establish the Fireproof context value
  const fpCtxValue = useFireproof()

  // render the rest of the application wrapped in the Fireproof provider
  return (
    <FireproofCtx.Provider value={fpCtxValue}>
        <MyComponent />
    </FireproofCtx.Provider>
  )
}
```

### useLiveQuery

And in your components, the `database` object and `useLiveQuery` and `useLiveDocument` hooks are available. In this example the `useLiveQuery` hook is used to display a list of todos, and the `database` object is used to add new todos:

```js
import { FireproofCtx } from '@fireproof/react'

export default TodoList = () => {
  const { database, useLiveQuery } = useContext(FireproofCtx)
  const todos = useLiveQuery((doc) => doc.date).docs
  const [newTodo, setNewTodo] = useState('')

  return (
    <div>
      <input type="text" onChange={(e) => setNewTodo(e.target.value)} />
      <button onClick={() => database.put({text: newTodo, date: Date.now(), completed: false})}>Save</button>
      <ul>
        {todos.map((todo) => (
          <li key={todo._id}>
            <input 
              type="checkbox" 
              checked={todo.completed}
              onChange={() => database.put({...todo, completed: !todo.completed})} />
            {todo.text}
          </li>
        ))}
    </div>
  )
}
```

### useLiveDocument

You can also subscribe directly to database updates, and redraw when necessary:

```js
import { FireproofCtx } from '@fireproof/react'

function MyComponent() {
  // get Fireproof context
  const { useLiveDocument } = useContext(FireproofCtx)
  const [doc, saveDoc] = useLiveDocument({_id : "my-doc-id"})
  
  // a function to change the value of the document
  const updateFn = async () => {
    await saveDoc({ _id : "my-doc-id", hello: "world", updated_at: new Date()})
  }

  // render the document with a click handler to update it
  return <pre onclick={updateFn}>{JSON.stringify(doc)}</pre>
}
```

### Raw database subscription

Here is the same example but without using the `useLiveDocument` hook:

```js
import { FireproofCtx } from '@fireproof/react'

function MyComponent() {
  // get Fireproof context
  const { ready, database } = useContext(FireproofCtx)

  // set a default empty document
  const [doc, setDoc] = useState({})

  // run the loader on first mount
  useEffect(() => {
    const getDataFn = async () => {
      setDoc(await database.get("my-doc-id"))
    }
    getDataFn();
    return database.subscribe(getDataFn)
  }, [database])

  // a function to change the value of the document
  const updateFn = async () => {
    await database.put({ _id : "my-doc-id", hello: "world", updated_at: new Date()})
  }

  // render the document with a click handler to update it
  return <pre onclick={updateFn}>{JSON.stringify(doc)}</pre>
}
```

This should result in a tiny application that updates the document when you click it. In a real application you'd probably query an index to present eg. all of the photos in a gallery.

## Setup Functions

### defineDatabaseFn 
 
Synchronous function that defines the database, run this before any async calls. You can use it to do stuff like set up Indexes. Here's an example:

```js
const defineIndexes = (database) => {
  database.allLists = new Index(database, 'allLists', function (doc, map) {
    if (doc.type === 'list') map(doc.type, doc)
  })
  database.todosByList = new Index(database, 'todosByList', function (doc, map) {
    if (doc.type === 'todo' && doc.listId) {
      map([doc.listId, doc.createdAt], doc)
    }
  })
  window.fireproof = database // 🤫 for dev
  return database
}
```

### setupDatabaseFn

An asynchronous function that uses the database when it's ready, run this to load fixture data, insert a dataset from somewhere else, etc. Here's a simple example:

```js
async function setupDatabase(database)) {
    const apiData = await (await fetch('https://dummyjson.com/products')).json()
    for (const product of apiData.products) {
        await database.put(product)
    }  
}
```

Note there are no protections against you running the same setup over and over again, so you probably want to put some logic in there to do the right thing.

Here is an example of generating deterministic fixtures, using `mulberry32` for deterministic randomness so re-runs give the same CID, avoiding unnecessary bloat at development time, taken from the TodoMVC demo app.

```js
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(1) // determinstic fixtures

export default async function loadFixtures(database) {
  const nextId = (prefix = '') => prefix + rand().toString(32).slice(2)
  const listTitles = ['Building Apps', 'Having Fun', 'Getting Groceries']
  const todoTitles = [
    [
      'In the browser',
      'On the phone',
      'With or without Redux',
      'Login components',
      'GraphQL queries',
      'Automatic replication and versioning',
    ],
    ['Rollerskating meetup', 'Motorcycle ride', 'Write a sci-fi story with ChatGPT'],
    ['Macadamia nut milk', 'Avocado toast', 'Coffee', 'Bacon', 'Sourdough bread', 'Fruit salad'],
  ]
  let ok
  for (let j = 0; j < 3; j++) {
    ok = await database.put({ 
        title: listTitles[j], 
        type: 'list', 
        _id: nextId('' + j) 
    })
    for (let i = 0; i < todoTitles[j].length; i++) {
      await database.put({
        _id: nextId(),
        title: todoTitles[j][i],
        listId: ok.id,
        completed: rand() > 0.75,
        type: 'todo',
      })
    }
  }
}
```

 