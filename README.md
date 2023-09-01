

# <img src="https://fireproof.storage/static/img/flame.svg" alt="Fireproof logo" width="25"> Fireproof

<p align="right">
  <a href="https://github.com/fireproof-storage/fireproof/actions/workflows/test.yml">
    <img src="https://github.com/fireproof-storage/fireproof/actions/workflows/test.yml/badge.svg" alt="Test status">
  </a>
  <a href="https://www.typescriptlang.org" rel="nofollow">
    <img src="https://camo.githubusercontent.com/0d1fa0bafb9d3d26ac598799ca1d0bf767fc28a41d3f718d404433b392b9a5cd/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f74797065732f73637275622d6a732e737667" alt="Types exported"  >
  </a>
</p>

Simplify your application state with a live database. Automatically update your UI based on local or remote changes, and optionally integrate with any cloud for replication and sharing.

Fireproof is an embedded JavaScript document database designed to streamline app development. Data resides locally, with optional encrypted cloud storage and realtime collaboration. Features like live queries, database branches and snapshots, and file attachments make Fireproof ideal for browser-based apps big or small. Get started with just the NPM module:

```sh
npm install use-fireproof
```

or install in any page via HTML script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@fireproof/core/dist/browser/fireproof.iife.js"></script>
```
 
 ### JavaScript Example

```js
import { fireproof } from 'use-fireproof'

const db = fireproof('my-app-name')
const { id } = await db.put({
    _id: 'three-thousand'
    name: 'André',
    age: 47
});

const doc = await db.get(id)
const result = await db.query("age", { range: [40, 52] })
```

Jump to the docs site [for JavaScript API basics.](https://use-fireproof.com/docs/database-api/basics) You can [find a real-world JavaScript app here.](https://github.com/mlc-ai/web-stable-diffusion/pull/52) Fireproof has been tested in many JavaScript environments. Read more about [bundler support](https://use-fireproof.com/docs/bundling).


### React Example 

Fireproof has React hooks so you can avoid boilerplate and write expressive code. Instead of dealing with React contexts and reducers, simple hooks make your JSON documents feel like `setState()` objects.

```js
import { useLiveQuery, useDocument } from 'use-fireproof'

function App() {
  const completedTodos = useLiveQuery('completed', { limit: 10 })
  const [newTodo, setNewTodoData, saveNewTodo] = useDocument({type: 'todo', text: '', completed: false, created: Date.now() })
```

Read the [step-by-step React tutorial](https://use-fireproof.com/docs/react-tutorial) to get started, or [check out this code sandbox example](https://codesandbox.io/s/fireproof-react-antd-twelve-nk63z6?file=/src/App.tsx) to see how easy it is to build a basic app.

## Why choose Fireproof 

Fireproof has a unique take on distributed data integrity, rooted in immutable data and cryptographically verifiable protocols. This allows you to add live data to your app without complex configuration or installation (it's just an npm module) and if you decide to connect to the cloud you can easily choose storage providers or connect to your own S3 bucket. End-to-end encryption allows you to manage keys separately from data, defining custom security policies, so you can get started writing app features today, and connect to any environment when you are ready.

### Database Features

The core features of the database are available on any platform in a compact JavaScript package and a foundational cloud storage service.

* **JSON Documents** - Encrypted changes are persisted locally and to any connected storage. Store any JSON object using a familiar document database API. 
* **File Attachments** - Share social media or manage uploads within Fireproof's [file attachment API](https://use-fireproof.com/docs/database-api/documents#put-with-files). Attachments are stored locally and in the cloud, and can be encrypted or public.
* **Live Query** - Sort and filter any database with CouchDB-style `map` functions. The `useFireproof` React hook integrates so cleanly your code doesn't even have to import `useState` or `useEffect`, instead, [`useLiveQuery`](https://use-fireproof.com/docs/react-hooks/use-live-query) makes dynamic renders easy.
* **Realtime Updates** - [Subscribe to query changes in your application](https://use-fireproof.com/docs/database-api/database#subscribing-to-changes), so your UI updates automatically. This makes vanilla JS apps super easy to build -- the `useFireproof` React hook handles this so you won't need `db.subscribe()` there.
* **Cryptographic Proofs** - Fireproof's Merkle clocks and hash trees are immutable and self-validating, making all query results into offline-capable data slices. Fireproof makes cryptographic proofs available for all of its operations, accelerating replication and making trustless index sharing possible. This makes it a great choice for building custom document approval workflows or other situations where provenance is important.

Learn more about the [architecture](https://use-fireproof.com/docs/architecture) behind Fireproof.

### Use cases

Fireproof is optimized to make [building React and other front-end apps](https://github.com/fireproof-storage/fireproof/blob/main/packages/react/README.md) fast and fun, with reliable results. Suitable for mission-critical data workloads like [LLM orchestration](https://fireproof.storage/posts/why-proofs-matter-for-ai/), supply-chain provenance, and field data collection, [Fireproof is also great](https://fireproof.storage/posts/great-opportunites-to-use-fireproof/) for gaming, [generative AI](https://github.com/fireproof-storage/fireproof/discussions/11), social media, collaborative world-building, and rapidly implementing [executive decision support tools](https://epiphany.fireproof.storage) that can stand up to blockchain levels of scrutiny.

With Fireproof, you **build first** and connect it to your cloud of choice when you are ready, so there's nothing holding you back from adding it to your existing apps, or writing something new.

### AI Copilot Quick Start

Because Fireproof is designed to let you get started in the browser and connect to the cloud when you're ready, it's ideal for AI-assisted app development.  If you are using GPT, Claude, or Bard, you can [easily enable the AI to write React apps using Fireproof](https://hackernoon.com/get-chatgpt-to-focus-on-coding-on-the-right-apis-with-gptdoc-strings). 

Working with an AI assistant is a great way to get started on projects or try out new frameworks. Paste this line of code into your prompt, along with a detailed description of the app to build, and your app will be running without ever requiring a cloud.

```
Fireproof/React/Usage: import { useFireproof } from 'use-fireproof'; function App() { const { useLiveQuery, useDocument, database } = useFireproof(); const result = useLiveQuery(doc => doc.word, { limit: 10 }); const [{ count }, saveCountDocument] = useDocument({_id: 'count', count: 0}); return (<><p>{count} changes</p><input type='text' onChange={() => saveCountDocument({count: count + 1})} onSubmit={e => database.put({word: e.target.value})} /><ul>{result.map(row => (<li key={row.id}>{row.key}</li>))}</ul></>)}
```

For example prompts and inspiration [check out the illustrated version of this technique with links to saved chats](https://use-fireproof.com/docs/chatgpt-quick-start) that are ready to go.

## API Usage

Import from the package like this:

```js
import { fireproof } from 'use-fireproof'
```
and create a database:
  
```js
const database = fireproof('my-app-name')
```


### JSON Documents

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


### Flexible Query


```js
const { rows } = await database.query("age", { range: [40, 52] })
```

Fireproof provides a live query interface that allows you to subscribe to changes in your data. This means that your UI will automatically update whenever there is a change to your data. See the [useFireproof React hooks documentation](https://github.com/fireproof-storage/fireproof/blob/main/packages/react/README.md) for the easiest way to use this feature.

You can specify your function as a string and Fireproof will interpret it as indexing that field on all documents. You can also pass a function for more control:

```js
const { rows } = await database.query(function (doc, map) {
    map(doc.age, doc.name)
  }, { range: [40, 52] })
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


### Cloud Storage

When you are ready to save your data to the cloud for sharing or backup:

```js
import { connect } from 'use-fireproof'

const connection = await connect.web3(db, 'my-account-email@example.com')
```

You can tie any app to your app developer storage account, or allow users to create personal storage accounts (at no cost to you).

Currently, the web3 driver only stores database data, not metadata, but that still makes it great for sharing databases via direct links.

## Coming Soon

The six-month roadmap for Fireproof includes these features to make it a complete offering for application data.


### Automatic Replication

Documents changes are persisted to [Filecoin](https://filecoin.io) via [web3.storage](https://web3.storage), and made available over IPFS and on a global content delivery network. All you need to do to sync state is send a link to the latest database head, and Fireproof will take care of the rest. 

### Peer-to-peer Sync

Application instances can be connected using WebRTC or any other stream API library, like [Socket Supply](https://socketsupply.co), [libp2p](https://libp2p.io), or [PartyKit](https://partykit.io). The [first sync demo uses pure WebRTC with no signaling server](https://game.fireproof.storage), which limits its usability. There are demos with other transports coming soon.

### Self-sovereign Identity

Fireproof is so easy to integrate with any site or app because you can get started right away, and set up an account later. By default users write to their own database copy, so you can get pretty far before you even have to think about API keys. [Authorization is via non-extractable keypair](https://ucan.xyz), like TouchID / FaceID.

## Thanks 🙏

Fireproof is a synthesis of work done by people in the web community over the years. I couldn't even begin to name all the folks who made pivotal contributions. Without npm, React, and VS Code all this would have taken so much longer. Thanks to everyone who supported me getting into database development via Apache CouchDB, one of the original document databases. The distinguishing work on immutable data-structures comes from the years of consideration [IPFS](https://ipfs.tech), [IPLD](https://ipld.io), and the [Filecoin APIs](https://docs.filecoin.io) have enjoyed.

Thanks to Alan Shaw and Mikeal Rogers without whom this project would have never got started. The core Merkle hash-tree clock is based on [Alan's Pail](https://github.com/alanshaw/pail), and you can see the repository history goes all the way back to work begun as a branch of that repo. Mikeal wrote [the prolly trees implementation](https://github.com/mikeal/prolly-trees).

## Contributing

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
