# 🔥 Fireproof

Fireproof is a realtime database for today's interactive applications. It uses immutable data and distributed protocols 
to offer a new kind of database that:
- can be embedded in any page or app, with a flexible data ownership model
- scales without incurring developer costs, thanks to Filecoin
- uses cryptographically verifiable protocols (what plants crave)

Learn more about the [concepts and architecture behind Fireproof](https://fireproof.storage/documentation/how-the-database-engine-works/), or jump to the [quick start](#quick-start) for React and server-side examples.

### Status

Fireproof is alpha software, you should only use it if you are planning to contribute. For now, [check out our React TodoMVC implementation running in browser-local mode.](https://main--lucky-naiad-5aa507.netlify.app/) It demonstrates document persistence, index queries, and event subscriptions, and uses the [`useFireproof()` React hook.](https://github.com/fireproof-storage/fireproof/blob/main/packages/fireproof/hooks/use-fireproof.tsx)

[![Test](https://github.com/jchris/fireproof/actions/workflows/test.yml/badge.svg)](https://github.com/jchris/fireproof/actions/workflows/test.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Usage

```js
import Fireproof from 'fireproof';

async function main() {
  const database = Fireproof.storage('my-db');
  const ok = await database.put({
    name: 'alice',
    age: 42
  });
  
  const doc = await database.get(ok.id);
  console.log(doc.name); // 'alice'
}

main();
```

## Features

### Document Store

A simple put, get, and delete interface for keeping track of all your JSON documents. Once your data is in Fireproof you can access it from any app or website. Fireproof document store uses MVCC versioning and Merkle clocks so you can always recover the version you are looking for.

```js
const { id, ref } = await database.put({
    _id: 'three-thousand'
    name: 'André',
    age: 47
});
const doc = await database.get('three-thousand', {mvcc : true}) // mvcc is optional
// {
//    _id  : 'three-thousand'
//    _clock : CID(bafy84...agfw7)
//    name : 'André',
//    age  : 47
// }
```

The `_clock` allows you to query a stable snapshot of that version of the database. Fireproof uses immutable data structures under the hood, so you can always rollback to old data. Files can be embedded anywhere in your document using IPFS links like `{"/":"bafybeih3e3zdiehbqfpxzpppxrb6kaaw4xkbqzyr2f5pwr5refq2te2ape"}`, with API sugar coming soon.

### Flexible Indexes

Fireproof indexes are defined by custom JavaScript functions that you write, allowing you to easily index and search your data in the way that works best for your application. Easily handle data variety and schema drift by normalizing any data to the desired index.

```js
const index = new Index(database, function (doc, map) {
  map(doc.age, doc.name)
})
const { rows, ref } = await index.query({ range: [40, 52] })
// [ { key: 42, value: 'alice', id: 'a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c' },
//   { key: 47, value: 'André', id: 'three-thousand' } ]
```

### Realtime Updates

Subscribe to query changes in your application, so your UI updates automatically. Use the supplied React hooks, our Redux connector, or simple function calls to be notified of relevant changes.

```js
const listener = new Listener(database, function(doc, emit) {
  if (doc.type == 'member') {
    emit('member')
  }
})
listener.on('member', (id) => {
  const doc = await db.get(id)
  alert(`Member update ${doc.name}`)
})
```

### Self-sovereign Identity

Fireproof is so easy to integrate with any site or app because you can get started right away, and set up an account later. By default users write to their own database copy, so you can get pretty far before you even have to think about API keys. [Authorization is via non-extractable keypair](https://ucan.xyz), like TouchID / FaceID.

### Automatic Replication

Documents changes are persisted to [Filecoin](https://filecoin.io) via [web3.storage](https://web3.storage), and made available over [IPFS] and on a global content delivery network. All you need to do to sync state is send a link to the latest database head, and Fireproof will take care of the rest. [Learn how to enable replication.](#status)

### Cryptographic Proofs

The [UCAN protocol](https://ucan.xyz) verifiably links Fireproof updates to authorized agents via cryptographic proof chains. These proofs are portable like bearer tokens, but because invocations are signed by end-user device keys, UCAN proofs don't need to be hidden to be secure, allowing for delegation of service capabilities across devices and parties. Additionally, Fireproof's Merkle clocks and hash trees are immutable and self-validating, making merging changes safe and efficient. Fireproof makes cryptographic proofs available for all of its operations, making it an ideal verifiable document database for smart contracts and other applications running in trustless environments. [Proof chains provide performance benefits as well](https://purrfect-tracker-45c.notion.site/Data-Routing-23c37b269b4c4c3dacb60d0077113bcb), by allowing recipients to skip costly I/O operations and instead cryptographically verify that changes contain all of the required context.

## Limitations 💣

### Security

Until encryption support is enabled, all data written to Fireproof is public. There are no big hurdles for this feature but it's not ready yet.

### Replication

Currently Fireproof writes transactions and proofs to [CAR files](https://ipld.io/specs/transport/car/carv2/) which are well suited for peer and cloud replication. They are stored in IndexedDB locally, with cloud replication coming very soon.

### Pre-beta Software

While the underlying data structures and libraries Fireproof uses are trusted with billions of dollars worth of data, Fireproof started in February of 2023. Results may vary.

## Thanks 🙏

Fireproof is a synthesis of work done by people in the web community over the years. I couldn't even begin to name all the folks who made pivotal contributions. Without npm, React, and VS Code all this would have taken so much longer. Thanks to everyone who supported me getting into database development via Apache CouchDB, one of the original document databases. The distinguishing work on immutable datastructures comes from the years of consideration [IPFS](https://ipfs.tech), [IPLD](https://ipld.io), and the [Filecoin APIs](https://docs.filecoin.io) have enjoyed.

Thanks to Alan Shaw and Mikeal Rogers without whom this project would have never got started. The core Merkle hash-tree clock is based on [Alan's Pail](https://github.com/alanshaw/pail), and you can see the repository history goes all the way back to work begun as a branch of that repo. Mikeal wrote [the prolly trees implementation](https://github.com/mikeal/prolly-trees).

## Quick Start

Look in the `examples/` directory for projects using the database. It's not picky how you use it, but we want to provide convenient jumping off places. Think of the examples as great to fork when starting your next project.

If are adding Fireproof to an existing page, just install it and try some operations.

```sh
npm install @fireproof/core
```

In your `app.js` or `app.tsx` file:

```js
import { Fireproof } from '@fireproof/core'
const fireproof = Fireproof.storage()
const ok = await fireproof.put({ hello: 'world' })
const doc = await fireproof.get(ok.id)
```

🤫 I like to drop a `window.fireproof = fireproof` in there as a development aid.

# Contributing

Feel free to join in. All welcome. [Open an issue](https://github.com/jchris/fireproof/issues)!

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/jchris/fireproof/blob/main/LICENSE.md)
