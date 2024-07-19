# <img src="https://fireproof.storage/static/img/flame.svg" alt="Fireproof logo" width="25"> [Fireproof](https://fireproof.storage) + SolidJS

<p align="right">
  <a href="https://github.com/fireproof-storage/fireproof/actions/workflows/ci.yaml">
    <img src="https://github.com/fireproof-storage/fireproof/actions/workflows/ci.yaml/badge.svg" alt="Test status">
  </a>
</p>

Simplify your SolidJS application state with a live database. Automatically update your UI based on local or remote changes, and optionally integrate with any cloud for replication and sharing.

Fireproof is an embedded JavaScript document database designed to streamline app development. Data resides locally, with optional encrypted cloud storage and real-time sync and collaboration. Features like live queries, database branches and snapshots, and file attachments make Fireproof ideal for browser-based apps big or small.

Fireproof works in the browser, server, edge function, and any other JavaScript environment, with [connectors for popular backend services like AWS, Netlify, and PartyKit.]()

## Why choose Fireproof

Fireproof has a unique take on distributed data integrity, rooted in immutable data and cryptographically verifiable protocols. This allows you to add live data to any app without complex configuration or installation (it's just an npm module) and if you decide to connect to the cloud you can easily choose storage providers or connect to your own S3 bucket. End-to-end encryption allows you to manage keys separately from data, defining custom security policies, so you can get started writing app features today, and connect to any environment when you are ready. This infrastructure independence makes Fireproof great for brownfield and greenfield projects alike.

With Fireproof, you **build first** and connect it to your cloud of choice when you are ready, so there's nothing holding you back from adding it to your existing apps, or writing something new.

[Read more about the thinking behind Fireproof on our blog.](https://fireproof.storage/blog/) The community is active on [Discord](https://discord.gg/cCryrNHePH) and [X](https://twitter.com/FireproofStorge), among other places.

## Installation

Install both `solid-js` and `@fireproof/solid-js`. (Note: `solid-js` is a peer depdendency)

```sh
npm install solid-js @fireproof/solid-js
pnpm install solid-js @fireproof/solid-js
```

### Example

```ts
import { createFireproof } from "@fireproof/solid-js";

type Todo = { text: string; date: number; completed: boolean };

// You can have a global database that any Solid component can import
const TodoListDB = createFireproof('TodoListDB');

/*
 Or you can destructure the hook
 const { database, createDocument, createLiveQuery } = createFireproof('TodoListDB');
*/

export default function TodoList() {
  const todos = TodoListDB.createLiveQuery<Todo>('date', { limit: 10, descending: true })
  const [todo, setTodo, saveTodo] = TodoListDB.createDocument<Todo>(() => ({
    text: '',
    date: Date.now(),
    completed: false,
  }));
```

## API Reference

### createFireproof

The primary export of the `@fireproof/solid-js` package is the `createFireproof` SolidJS hook.

```tsx
// API Signature
function createFireproof(dbName?: string, config?: ConfigOpts): CreateFireproof;
```

Using the hook without specifying a name for the database will default the name to `FireproofDB` under the hood. Aside from receiving an accessor to the database, you will also receive two supporting SolidJS hooks `createDocument` and `createLiveQuery` which act against said database.

```ts
// non-destructured vs destructured
const FireproofDB = createFireproof();
const { createDocument, createLiveQuery, database } = createFireproof();

const AwesomeDB = createFireproof("AwesomeDB");
const { createDocument, createLiveQuery, database } = createFireproof("AwesomeDB");
```

We will go over the optional `config` parameter for `createFireproof` later to talk further about `createDocument`, `createLiveQuery` and the `database`.

### createDocument

Create (or modify) a document in your Fireproof database.

```ts
// API Signature
function createDocument<T extends DocTypes>(initialDocFn: Accessor<Doc<T>>): CreateDocumentResult<T>;
```

Whether you create or modify a document is driven by the supply of an `_id` field in your invocation.

```ts
type Todo = { text: string; count: number; completed: boolean };

// Creates a new document on save
const [todo, setTodo, saveTodo] = createDocument<Todo>(() => ({ text: "", count: 0, completed: false }));

// Modifies an existing document (by _id) on save
const [todo, setTodo, saveTodo] = createDocument<Todo>(() => ({ _id: "...", text: "", count: 0, completed: false }));
```

The `createDocument` API will return to you a tuple containing three things:

- the document getter
- the document setter
- save/write function to database

As you can see, the hook supports TypeScript generics, so all the functions you receive in the tuple will be type-scoped to the custom type you injected as part of the invocation.

The getter/setter operates much like what you would expect from a normal `createSignal` call, but the setter has a different signature.

```ts
type UpdateDocFnOptions = { readonly replace?: boolean };
type UpdateDocFn<T extends DocTypes> = (newDoc?: Partial<Doc<T>>, options?: UpdateDocFnOptions) => void;
```

Here are the ways you use the setter:

```ts
const [todo, setTodo] = createDocument<Todo>(() => ({ text: "", count: 0, completed: false }));
// Sticking with the Todo objects from above.
// You can pass partial structs updating target fields
// Or you can update everything at once
setTodo({ text: "newTodo" });
setTodo({ count: 3 });
setTodo({ completed: true });

// Output { text: "newTodo", count: 3, completed: true }
console.log(todo());

// Reset the document to default original state
setTodo();

// Output { text: "", count: 0, completed: false }
console.log(todo());

// Using the replace option will completely overwrite the document.
// Essentially, it is both a reset as shown earlier + an apply
setTodo({ text: "anotherTodo", count: 2, completed: false }, { replace: true });
```

The last function from the tuple is the save/write to database function. It has the following signature:

```ts
type StoreDocFn<T extends DocTypes> = (existingDoc?: Doc<T>) => Promise<DocResponse>;
```

This function has two modes of use:

- Save/update the current document to the database
- Save/update an _existing_ document in the database

The first mode is executed by simply invoking the function like so:

```ts
await saveTodo(); // save/write the current document state to the database
```

The second mode can only be exercised via complementing `createDocument` with the results from the second support hook `createLiveQuery` which we can now segue into.

### createLiveQuery

Access to live query results, enabling real-time updates in your app.

```ts
type LiveQueryResult<T extends DocTypes> = {
  readonly docs: Doc<T>[];
  readonly rows: IndexRow<T>[];
};

export type CreateLiveQuery = <T extends DocTypes>(
  mapFn: string | MapFn,
  query?: QueryOpts,
  initialRows?: IndexRow<T>[]
) => Accessor<LiveQueryResult<T>>;
```

Here are some usage examples:

```ts
const result = createLiveQuery("_id"); // all documents
const result = createLiveQuery("date"); // find docs with a 'date' field
const result = createLiveQuery<Todo>("date", { limit: 10, descending: true }); // key + options + generics
```

The `createLiveQuery` hook is responsibile for subscribing for document updates against the database. If any changes have been made, then the query results will be updated triggering a re-render of contents on your web application.

You can specify your function as a string and Fireproof will interpret it as indexing that field on all documents. You can also pass a function for more control:

The same mechanism that powers the built-in indexes can all be used to connect secondary [vector indexers](https://github.com/tantaraio/voy) or fulltext indexes to Fireproof. [Follow this tutorial to connect a secondary index](https://fireproof.storage/documentation/external-indexers/).

### database

The last thing you receive from `createFireproof` is the accessor to the underlying Fireproof database. We provide this getter as something of an "escape hatch" if you find that you are unable to achieve some outcome you are looking for due to some limitations in the `createDocument` and `createLiveQuery` hook interfaces.

```ts
const { id } = await database().put({
    _id: 'three-thousand'
    name: 'André',
    age: 47
});

const doc = await database().get('three-thousand')
// {
//    _id  : 'three-thousand'
//    name : 'André',
//    age  : 47
// }

const result = await database().query("age", { range: [40, 52] })
```

Jump to the docs site [for JavaScript API basics.](https://use-fireproof.com/docs/database-api/basics) You can [find a real-world JavaScript app here.](https://github.com/mlc-ai/web-stable-diffusion/pull/52)

## Database Features

The core features of the database are available on any platform in a compact JavaScript package and a foundational cloud storage service.

- **JSON Documents** - Encrypted changes are persisted locally and to any connected storage. Store any JSON object using a familiar document database API.
- **File Attachments** - Share social media or manage uploads within Fireproof's [file attachment API](https://use-fireproof.com/docs/database-api/documents#put-with-files). Attachments are stored locally and in the cloud, and can be encrypted or public.
- **Live Query** - Sort and filter any database with CouchDB-style `map` functions. The `createFireproof` Solid hook integrates so cleanly your code doesn't even have to import `createSignal` or `createEffect`, instead, [`createLiveQuery`](https://use-fireproof.com/docs/react-hooks/use-live-query) makes dynamic renders easy.
- **Realtime Updates** - [Subscribe to query changes in your application](https://use-fireproof.com/docs/database-api/database#subscribing-to-changes), so your UI updates automatically. This makes vanilla JS apps super easy to build -- the `createFireproof` Solid hook handles this so you won't need `db.subscribe()` there.
- **Cryptographic Proofs** - Fireproof's Merkle clocks and hash trees are immutable and self-validating, making all query results into offline-capable data slices. Fireproof makes cryptographic proofs available for all of its operations, accelerating replication and making trustless index sharing possible. This makes it a great choice for building custom document approval workflows or other situations where provenance is important.

Learn more about the [architecture](https://use-fireproof.com/docs/architecture) behind Fireproof.

### Cryptographic Proofs

Fireproof's Merkle clocks and hash trees are immutable and self-validating, and all query results are offline-capable data slices. Fireproof makes cryptographic proofs available for all of its operations, accelerating replication and making trustless index sharing possible. If you are making a "DocuSign for **\_**", [proofs make Fireproof the ideal verifiable document database](https://fireproof.storage/posts/from-mlops-to-point-of-sale:-merkle-proofs-and-data-locality/) for smart contracts and other applications where unique, verifiable, and trustworthy data is required. [Proof chains provide performance benefits as well](https://purrfect-tracker-45c.notion.site/Data-Routing-23c37b269b4c4c3dacb60d0077113bcb), by allowing recipients to skip costly I/O operations and instead cryptographically verify that changes contain all of the required context.

## Use Cases

Fireproof is optimized to make [building React and other front-end apps](https://github.com/fireproof-storage/fireproof/blob/main/packages/react/README.md) fast and fun, with reliable results. Suitable for mission-critical data workloads like [LLM orchestration](https://fireproof.storage/posts/why-proofs-matter-for-ai/), supply-chain provenance, and field data collection, [Fireproof is also great](https://fireproof.storage/posts/great-opportunites-to-use-fireproof/) for gaming, [generative AI](https://github.com/fireproof-storage/fireproof/discussions/11), social media, collaborative world-building, and rapidly implementing [executive decision support tools](https://epiphany.fireproof.storage) that can stand up to blockchain levels of scrutiny.

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

## Package Maintenance

There are a few project scripts that deal with the maintenance of the `@fireproof/solid-js` npm package within this monorepo:

- `pnpm build:solid` - build solid packages
- `pnpm build:watch:solid` - builds solid packages in watch mode
- `pnpm test:solid` - runs integration tests
- `pnpm start:solid` - runs example app

Feel free to [join in the conversation on Discord. All welcome.](https://discord.gg/cCryrNHePH)

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/jchris/fireproof/blob/main/LICENSE.md)
