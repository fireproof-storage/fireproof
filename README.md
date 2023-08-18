
<h3 align="center">
  Live database for the web
</h3>
<p align="center" >
  <a href="https://fireproof.storage/">
    <img src="https://fireproof.storage/static/img/logo-animated-black.svg" alt="Fireproof logo" width="160">
  </a>
</p>
<p align="center">
  <a href="https://github.com/fireproof-storage/fireproof/actions/workflows/test.yml">
    <img src="https://github.com/fireproof-storage/fireproof/actions/workflows/test.yml/badge.svg" alt="Test" style="max-width: 100%;">
  </a>
  <a href="https://www.typescriptlang.org" rel="nofollow">
    <img src="https://camo.githubusercontent.com/0d1fa0bafb9d3d26ac598799ca1d0bf767fc28a41d3f718d404433b392b9a5cd/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f74797065732f73637275622d6a732e737667" alt="Types exported"  style="max-width: 100%;">
  </a>
</p>

Fireproof is the quickest way to add live data to your React or other front-end app. Install anywhere JavaScript goes:

```sh
npm install @fireproof/core
```

or via `<script src="...">` tag referencing [`fireproof.iife.js`](https://www.npmjs.com/package/@fireproof/core?activeTab=code) for plain old HTML apps. (CDN link coming soon.)
<p align="center">
  <a href="https://www.npmjs.com/package/use-fireproof">
    <img src="https://shields.io/badge/react-black?logo=react&style=for-the-badge%22" alt="React"  style="max-width: 100%;">
  </a>
</p>

If you are using React, [jump to the `useFireproof` README](https://www.npmjs.com/package/use-fireproof), which is the preferred way to consume the database in client-side React code, or for a longer explanation, [try the step-by-step React tutorial.](https://use-fireproof.com/docs/react-tutorial)

### Vanilla JS Example

Fireproof uses end-to-end encryption, immutable data, and distributed protocols so your app is easy to start and seriously scales. Add a few lines to your front-end pages and you'll be developing with a live database with no other setup:

Import (or require) the library:

```js
import { database, index } from '@fireproof/core'
```
Intialize a database and optional index:

```js
const db = database('my-app-name')
const byAge = index(db, 'age')
```
Query the index anytime the database changes (great for automatically repainting UI):

```js
const onChange(async () => {
  const { rows } = await byAge.query({ range: [40, 52] })
  console.log(rows)
})
db.subscribe(onChange)
onChange()
```

Update documents based on user input:

```js
async function doChange(name, age)  {
  await db.put({ name, age })
}
/// ... meanwhile ... 
onClick = () => doChange(name, age)
```

This is even easier with [the Fireproof React hooks API](https://use-fireproof.com/docs/react-tutorial/) so it's OK to start there. Fireproof can be embedded in any page or app, and connect with any cloud (coming soon) via REST, S3, and web3.storage support. If you have particular storage needs, reach out and we can help you write a custom storage adapter.

## Why choose Fireproof

Fireproof has a unique take on distributed data integrity, rooted in immutable data and cryptographically verifiable protocols (what plants crave). This allows you to add live data to your app without complex configuration or installation (it's just an npm module) and if you decide to connect to the cloud you can easily choose storage providers or connect to your own S3 bucket. End-to-end encryption allows you to manage keys separately from data, defining custom security policies, so you can get started today connect to any environment when you are ready.

### Database Features

The core features of the database are available on any platform in a compact JavaScript package and a foundational cloud storage service.

* **JSON Documents** - Encrypted changes are persisted locally and to any connected storage. Store any JSON object using a familiar document database API. 
* **Live Query** - Sort and filter any database with CouchDB-style `map` functions. The `useFireproof` React hook integrates so cleanly your code doesn't even have to import `useState` or `useEffect`, instead, [`useLiveQuery`](https://use-fireproof.com/docs/react-hooks/use-live-query) makes dynamic renders easy.
* **Realtime Updates** - [Subscribe to query changes in your application](https://use-fireproof.com/docs/database-api/database#subscribing-to-changes), so your UI updates automatically. This makes vanilla JS apps super easy to build -- the `useFireproof` React hook handles this so you won't need `db.subscribe()` there.
* **Cryptographic Proofs** - Fireproof's Merkle clocks and hash trees are immutable and self-validating, making all query results into offline-capable data slices. Fireproof makes cryptographic proofs available for all of its operations, accelerating replication and making trustless index sharing possible. This makes it a great choice for building custom document approval workflows or other situations where provenance is important.

Learn more about the [architecture](https://use-fireproof.com/docs/architecture) behind Fireproof.

### Use cases

Fireproof is optimized to make [building React apps](https://github.com/fireproof-storage/fireproof/blob/main/packages/react/README.md) fast and fun, with reliable results. Suitable for mission-critical data workloads like [LLM orchestration](https://fireproof.storage/posts/why-proofs-matter-for-ai/), supply-chain provenance, and field use of auditable data, [ Fireproof is also great](https://fireproof.storage/posts/great-opportunites-to-use-fireproof/) for social media, collaborative world-building, and rapidly implementing executive decision support tools that can stand up to blockchain levels of scrutiny.

With Fireproof, you **build first** and connect it to your cloud of choice when you are ready, so there's nothing holding you back from adding it to your existing apps, or writing something new.

## React Quick Start
*One-line preview:* in the context of a React component render, `useLiveQuery` will automatically refresh (even on changes by remote collaborators):

```js
  const completedTodos = useLiveQuery('completed', { limit: 10 })
```
This is the README for the core database technology. [The `useFireproof` hook documentation has a getting started guide](https://use-fireproof.com/docs/react-tutorial). Don't forget to star 🌟 this repo on the way over.

## AI Copilot Quick Start

Because Fireproof is designed to let you get started in the browser and connect to the cloud when you're ready, it's ideal for AI-assisted app development.  If you are using GPT, Claude, or Bard, you can [easily enable the AI to write React apps using Fireproof](https://hackernoon.com/get-chatgpt-to-focus-on-coding-on-the-right-apis-with-gptdoc-strings). 

Working with an AI assistant is a great way to get started on projects or try out new frameworks. Paste this line of code into your prompt, along with a detailed description of the app to build, and your app will be running without ever requiring a cloud.

```
Fireproof/React/Usage: import { useFireproof } from '@fireproof/react'; function App() { const { useLiveQuery, useDocument, database } = useFireproof(); const result = useLiveQuery(doc => doc.word, { limit: 10 }); const [{ count }, saveCountDocument] = useDocument({_id: 'count', count: 0}); return (<><p>{count} changes</p><input type='text' onChange={() => saveCountDocument({count: count + 1})} onSubmit={e => database.put({word: e.target.value})} /><ul>{result.map(row => (<li key={row.id}>{row.key}</li>))}</ul></>)}
```

For example prompts and inspiration [check out the illustrated version of this technique with links to saved chats](https://use-fireproof.com/docs/chatgpt-quick-start) that are ready to go.

## API Usage

### Encrypted Documents

A simple put, get and delete interface for keeping track of all your JSON documents. Once your data is in Fireproof you can access it from any app or website. 

```js
const { id } = await database.put({
    _id: 'three-thousand'
    name: 'André',
    age: 47
});

const doc = await database.get('three-thousand') 
// {
//    _id  : 'three-thousand'
//    name : 'André',
//    age  : 47
// }
```

Fireproof tracks all versions so undo is easy to write, and cryptographically verifiable snapshots of the database are as easy as web links.


### Live Query

Fireproof provides a live query interface that allows you to subscribe to changes in your data. This means that your UI will automatically update whenever there is a change to your data. See the [useFireproof React hooks documentation](https://github.com/fireproof-storage/fireproof/blob/main/packages/react/README.md) for the easiest way to use this feature.

Fireproof indexes are defined by custom JavaScript functions that you write, allowing you to easily index and search your data in the way that works best for your application. Easily handle data variety and schema drift by normalizing any data to the desired index. The index function defines the sort order. You can use the index to query for a range of values or to find exact matches. This baseline functionality is all you need to build many kinds of complex queries.

```js
const byAge = index(database, "age")
const { rows } = await index.query({ range: [40, 52] })
```

By default you can specify your function as a string and Fireproof will interpret it as indexing that field on any documents. Read on for examples of how you can get more control when you want. The optional second argument to your map function allows you to specify both keys and values for the index:

```js
const index = new Index(database, "namesByAge", function (doc, map) {
  map(doc.age, doc.name)
})
const { rows, ref } = await index.query({ range: [40, 52] })
// [ { key: 42, value: 'alice', id: 'a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c' },
//   { key: 47, value: 'André', id: 'three-thousand' } ]
```

The same mechanism that powers the built-in indexes can all be used to connect secondary [vector indexers](https://github.com/tantaraio/voy) or fulltext indexes to Fireproof. [Follow this tutorial to connect a secondary index](https://fireproof.storage/documentation/external-indexers/).

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

The React [useLiveQuery](https://use-fireproof.com/docs/react-hooks/use-live-query) hook automatically refreshes query results for you, but under the hood, it's just calling `index.query()` and calling `setState()` when the results change. You can use the same technique to build your live query UIs with any framework.

### Cryptographic Proofs

Fireproof's Merkle clocks and hash trees are immutable and self-validating, and all query results are offline-capable data slices. Fireproof makes cryptographic proofs available for all of its operations, accelerating replication and making trustless index sharing possible. If you are making a "DocuSign for _____", [proofs make Fireproof the ideal verifiable document database](https://fireproof.storage/posts/from-mlops-to-point-of-sale:-merkle-proofs-and-data-locality/) for smart contracts and other applications where unique, verifiable, and trustworthy data is required. [Proof chains provide performance benefits as well](https://purrfect-tracker-45c.notion.site/Data-Routing-23c37b269b4c4c3dacb60d0077113bcb), by allowing recipients to skip costly I/O operations and instead cryptographically verify that changes contain all of the required context.

## Coming Soon

The six-month roadmap for Fireproof includes these features to make it a complete offering for application data.

### Cloud Storage

When you are ready to save your data to the cloud for sharing or backup:

```js
import { connect } from '@fireproof/core'

const connection = await connect(db, 'my-account-email@example.com')
```

You can tie any app to your app developer storage account, or allow users to create personal storage accounts (at no cost to you).


### Automatic Replication

Documents changes are persisted to [Filecoin](https://filecoin.io) via [web3.storage](https://web3.storage), and made available over IPFS and on a global content delivery network. All you need to do to sync state is send a link to the latest database head, and Fireproof will take care of the rest. 

### Peer-to-peer Sync

Application instances can be connected using WebRTC or any other stream API library, like [Socket Supply](https://socketsupply.co), [libp2p](https://libp2p.io), or [PartyKit](https://partykit.io). The [first sync demo uses pure WebRTC with no signaling server](https://game.fireproof.storage), which limits its usability. There are demos with other transports coming soon.

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
4. Run the command `pnpm install`. This will install all the dependencies that are listed in the `package.json` file.
5. Now change the directory to packages/fireproof using the command `cd packages/fireproof`.
6. See the `package.json` file to work with all the listed commands and try them out. You can also test your changes using `npm test`.
7. Also change directory to `examples/todomvc` and run the command `npm run dev` to load up a simple application to understand the use of Fireproof as a real-time database.
8. Keep contributing :) See [issues](https://github.com/fireproof-storage/fireproof/issues) for ideas how to get started.

Feel free to join in. All welcome. 

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/jchris/fireproof/blob/main/LICENSE.md)
