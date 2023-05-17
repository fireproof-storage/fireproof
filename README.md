# 🔥 Fireproof

Fireproof is a realtime database for today's interactive applications. It uses immutable data and distributed protocols 
to offer a new kind of database that:
- can be embedded in any page or app, with a flexible data ownership model
- can be hosted on any cloud
- uses cryptographically verifiable protocols (what plants crave)

Fireproof is optimized to make building React apps fast and fun, with reliable results. The data can be as mission-critical as you want, as everything is encrypted and hash-based proofs are used to verify integrity. [Great use cases](https://fireproof.storage/posts/great-opportunites-to-use-fireproof/) include everything from social media to collaborative world-building (metaverse) to executive decision support tools that can stand up to blockchain levels of scrutiny.

## React hooks API

Here's an example app using Fireproof and React. Look out for `useLiveQuery` and `database.put` -- that's all you really need to get started:

```js
import { useFireproof } from '@fireproof/react'

export default App = () => {
  const { database, useLiveQuery } = useFireproof()
  const todoList = useLiveQuery((doc) => doc.date).docs
  const [newTodo, setNewTodo] = useState('')

  return (
    <div>
      <input type="text" onChange={(e) => setNewTodo(e.target.value)} />
      <button onClick={() => database.put({text: newTodo, date: Date.now(), completed: false})}>Save</button>
      <ul>
        {todoList.map((todo) => (
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

### Features

* **Realtime** - data is updated as soon as it is available, with no polling or refreshes required.
* **Distributed** - data is stored in a distributed network, so it is always available.
* **Sync** - users can collaborate on data subsets, with changes synced across devices or via the cloud.
* **Proofs** - cryptographic verification makes results verifiable and lowers operating costs

### Architecture

* Powered by IPFS data structures, Fireproof can be hosted on traditional cloud or Filecoin infrastructure.
* Immutable content-addressed data ensures that data is always consistent, accurate, and verified
* Encrypted at rest and in transit, with optional clear-text database publishing for content management use cases.
* Open source, so you can inspect the code and make sure that it meets your security and privacy requirements.

Learn more about the [concepts](https://fireproof.storage/posts/from-mlops-to-point-of-sale:-merkle-proofs-and-data-locality/) and [architecture](https://fireproof.storage/documentation/how-the-database-engine-works/) behind Fireproof, or look in the `examples/` directory for projects using the database, or see [examples on CodePen](https://codepen.io/jchrisa/pen/GRYJJEM). 

## ChatGPT / Bard Quick Start

Paste this to GPT 4, 3.5, or Bard to enable it to write React apps using Fireproof:

```
Fireproof/React/Usage: import { useFireproof } from '@fireproof/react'; function App() { const { useLiveQuery, useLiveDocument, database } = useFireproof(); const result = useLiveQuery(doc => doc.word, { limit: 10 }); const [{ count }, saveCountDocument] = useLiveDocument({_id: 'count', count: 0}); return (<><p>{count} changes</p><input type='text' onChange={() => saveCountDocument({count: count + 1})} onSubmit={e => database.put({word: e.target.value})} /><ul>{result.map(row => (<li key={row.id}>{row.key}</li>))}</ul></>)}
```

In the same prompt, describe the app you want to build. Here are some examples that worked for us:

* Create a React app using Fireproof for tracking party invites. It should have a text input that creates a new document with the guest name, and an Index that lists all guests in a &lt;ul&gt;. ([Running copy here.](https://codepen.io/jchrisa/pen/zYmogWO))
* Build a React app that allows you to create profiles for dogs, and browse to each profile. It should be optimized for mobile. Use Tailwind.
* Build a photo grid app with drag-and-drop ordering that references photos by URL. Use tailwind and render all photos as squares. Keep grid arrangement in Fireproof with one document for each gallery, that is 4-16 photos arranged into a layout.
* Build an app using React, Fireproof, MagicLink, and Tailwind that allows users to create one-question multiple-choice polls and collect the answers.
* Create a note-taking app using React, Tailwind, and Fireproof that stores each note as a large text string in a Fireproof document, and uses an Index to split the text of the documents into tokens for full-text search. The app has an input field to search the documents via an index query.

Please share your successes with us here or on [Twitter.](https://twitter.com/FireproofStorge)

#### Advanced AI Docs

You can enhance the AI's understanding by adding the core APIs. Use this if you aren't using React, or you are adding additional features to your app and you need to go deeper than the React hooks.

```
Fireproof/API/Usage: import { Fireproof, Index } from '@fireproof/core'; const db = fireproof.storage('app-db-name'); const ok = await db.put({ any: 'json' }); const doc = await db.get(ok.id); await db.del(doc._id); const all = await db.allDocuments(); all.rows.map(({key, value}) => value); useEffect(()=> db.subscribe(updateReactStateFn), []); const index = new Index(db, (doc, map) => map(doc.any, {custom: Object.keys(doc)})); const result = await index.query({range : ['a', 'z']}); result.rows.map(({ key }) => key);
```

### Status

Fireproof 0.6.0 is alpha software, 0.7.0 will be the first beta release. It is ready for you to evaluate for your future applications. 

[![Test](https://github.com/jchris/fireproof/actions/workflows/test.yml/badge.svg)](https://github.com/jchris/fireproof/actions/workflows/test.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Features

### Encrypted Documents

A simple put, get, and delete interface for keeping track of all your JSON documents. Once your data is in Fireproof you can access it from any app or website. Fireproof document store uses MVCC versioning and Merkle clocks so you can always recover the version you are looking for.

```js
const { id, ref } = await database.put({
    _id: 'three-thousand'
    name: 'André',
    age: 47
});
const doc = await database.get('three-thousand', { mvcc: true }) // mvcc is optional
// {
//    _id  : 'three-thousand'
//    _clock : CID(bafy84...agfw7)
//    name : 'André',
//    age  : 47
// }
```

As you can see in the return value above, the `_clock` allows you to query a stable snapshot of that version of the database. Fireproof uses immutable data structures under the hood, so you can always rollback to old data. Files can be embedded anywhere in your document using IPFS links like `{"/": "bafybeih3e3zdiehbqfpxzpppxrb6kaaw4xkbqzyr2f5pwr5refq2te2ape"}`, with API sugar coming soon.

### Live Query

Fireproof provides a live query interface that allows you to subscribe to changes in your data. This means that your UI will automatically update whenever there is a change to your data. See the [useFireproof React hooks documentation](https://github.com/fireproof-storage/fireproof/blob/main/packages/react/README.md) for the easiest way to use this feature.

Fireproof indexes are defined by custom JavaScript functions that you write, allowing you to easily index and search your data in the way that works best for your application. Easily handle data variety and schema drift by normalizing any data to the desired index. The index function defines the sort order. You can use the index to query for a range of values or to find exact matches. This baseline functionality is all you need to build many kinds of complex queries.

```js
const index = new Index(database, "byAge", (doc) => doc.age)
const { rows, proof } = await index.query({ range: [40, 52] })
```

You can ignore the proof or use it to optimize hydration of your client side components. The `rows` are the results of the query. You can use `database.subscribe(myAppQueryFn)` to get notified of changes and re-issue your query. The React [useLiveQuery](https://fireproof.storage/documentation/usefireproof-hook-for-react/) hook does this for you automatically.

If you need more control over the results, you can use the optional second argument to your map function to specify both keys and values for the index:

```js
const index = new Index(database, "namesByAge", function (doc, map) {
  map(doc.age, doc.name)
})
const { rows, ref } = await index.query({ range: [40, 52] })
// [ { key: 42, value: 'alice', id: 'a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c' },
//   { key: 47, value: 'André', id: 'three-thousand' } ]
```

### Realtime Updates

Subscribe to query changes in your application, so your UI updates automatically. Use the supplied React hooks, or simple function calls to be notified of relevant changes.

```js
const unsubscribe = database.subscribe(changes) => {
  changes.forEach(change => {
    console.log(change)
  })
})
```

Return the `unsubscribe` function from `useEffect` and React will handle it for you. (In the code below, we use the arrow function's implicit return to connect the unsubscribe function to the `useEffect` hook. This prevents extra subscriptions from building up on each render.)

```js
useEffect(() => database.subscribe((changes) => 
    changes.forEach(change => console.log(change))), [])
```

### Cryptographic Proofs

Fireproof's Merkle clocks and hash trees are immutable and self-validating, making merging changes safe and efficient. Fireproof makes cryptographic proofs available for all of its operations, accelerating replication and making trustless index sharing possible. [Proofs make Fireproof the ideal verifiable document database](https://fireproof.storage/posts/from-mlops-to-point-of-sale:-merkle-proofs-and-data-locality/) for smart contracts and other applications where unique, verifiable, and trustworthy data is required. [Proof chains provide performance benefits as well](https://purrfect-tracker-45c.notion.site/Data-Routing-23c37b269b4c4c3dacb60d0077113bcb), by allowing recipients to skip costly I/O operations and instead cryptographically verify that changes contain all of the required context.

### Automatic Replication (coming soon)

Documents changes are persisted to [Filecoin](https://filecoin.io) via [web3.storage](https://web3.storage), and made available over [IPFS] and on a global content delivery network. All you need to do to sync state is send a link to the latest database head, and Fireproof will take care of the rest. 

### Self-sovereign Identity

Fireproof is so easy to integrate with any site or app because you can get started right away, and set up an account later. By default users write to their own database copy, so you can get pretty far before you even have to think about API keys. [Authorization is via non-extractable keypair](https://ucan.xyz), like TouchID / FaceID.

## Thanks 🙏

Fireproof is a synthesis of work done by people in the web community over the years. I couldn't even begin to name all the folks who made pivotal contributions. Without npm, React, and VS Code all this would have taken so much longer. Thanks to everyone who supported me getting into database development via Apache CouchDB, one of the original document databases. The distinguishing work on immutable data-structures comes from the years of consideration [IPFS](https://ipfs.tech), [IPLD](https://ipld.io), and the [Filecoin APIs](https://docs.filecoin.io) have enjoyed.

Thanks to Alan Shaw and Mikeal Rogers without whom this project would have never got started. The core Merkle hash-tree clock is based on [Alan's Pail](https://github.com/alanshaw/pail), and you can see the repository history goes all the way back to work begun as a branch of that repo. Mikeal wrote [the prolly trees implementation](https://github.com/mikeal/prolly-trees).

# Contributing

To contribute please follow these steps for local setup and installation of the project

1. Click on the "Fork" button in the top-right corner of the repository's page. This will create a copy of the repository in your account.
2. Clone the forked repository to your local machine using Git.
3. Now cd to the target directory, or load the directory in your IDE, and open up a terminal.
4. Write the command `pnpm install`. This will install all the dependencies that are listed in the `package.json` file.
5. Now change the directory to packages/fireproof using the command `cd packages/fireproof`.
6. See the `package.json` file to work with all the listed commands and try them out. You can also test your application locally using `npm test`.
7. Also change directory to `examples/todomvc` and run the command `npm run dev` to load up a simple application to understand the use of Fireproof as a real-time database.
8. Keep contributing :) See [projects](https://github.com/fireproof-storage/fireproof/projects?query=is%3Aopen) and [issues](https://github.com/fireproof-storage/fireproof/issues) for ideas where to get started.

Feel free to join in. All welcome. [Open an issue](https://github.com/jchris/fireproof/issues)!

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/jchris/fireproof/blob/main/LICENSE.md)
