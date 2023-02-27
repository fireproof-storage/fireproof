# 🔥 Fireproof

Fireproof is a realtime database for today's interactive applications. It uses immutable data and distributed protocols 
to offer a new kind of database that:
- can be embedded in any page or app, with a flexible data ownership model
- scales without incurring developer costs, thanks to Filecoin
- uses cryptographically verifiable protocols (what plants crave)

Learn more about the concepts and architecture behind Fireproof [in our plan.](https://hackmd.io/@j-chris/SyoE-Plpj)

[![Test](https://github.com/jchris/fireproof/actions/workflows/test.yml/badge.svg)](https://github.com/jchris/fireproof/actions/workflows/test.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Usage

```js
import Fireproof from 'fireproof';

async function main() {
  const database = new Fireproof();
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
const doc = await database.get('three-thousand')
// {
//    _id  : 'three-thousand'
//    _ref : CID(bafy84...agfw7)
//    name : 'André',
//    age  : 47
// }
```

The `_ref` allows you to query a stable snapshot of that version of the database. Fireproof uses immutable data structures under the hood, so you can always rollback to old data.

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

### Realtime Updates 🚧 (coming soon)

Subscribe to query changes in your application, so your UI updates automatically. Use the supplied React hooks, our Redux connector, or simple function calls to be notified of relevant changes.

```js
const listener = new Listener(database, function(doc, oldDoc, send) {
  if (doc.type == 'member' && !oldDoc) {
    send('new-member', id)
  }
})
listener.on('new-member', (doc) => {
  alert(`New member ${doc.name}`)
})
```

### Self-soverign Identity

Fireproof is so easy to integrate with any site or app because you can get started right away, and set up an account later. By default users write to their own database copy, so you can get pretty far before you even have to think about API keys. [Authorization is via non-extractable keypair](https://ucan.xyz), like TouchID / FaceID.

### Automatic Replication

Documents changes are persisted to [Filecoin](https://filecoin.io) via [web3.storage](https://web3.storage), and made available over IPFS and on a global content delivery network. All you need to do to sync state is send a link to the latest database head, and Fireproof will take care of the rest. [Learn how to enable replication.]()

## Limitations 💣

### Security

Until encryption support is enabled, all data written to Fireproof is public. There are no big hurdles for this feature but it's not ready yet.

### Persistence

Currently Fireproof writes transactions and proofs to in-memory [CAR files](https://ipld.io/specs/transport/car/carv2/) which are well suited for peer and cloud replication. Durability coming soon.

### Pre-beta Software

While the underlying data structures and libraries Fireproof uses are trusted with billions of dollars worth of data, Fireproof started in February of 2023. Results may vary.

## Thanks

Fireproof is a synthesis of work done by people in the web community over the years. I couldn't even begin to name all the folks who made pivotal contributions. Without npm, React, and VScode all this would have taken so much longer. But the distinguishing work on immutable datastructures came from the years of consideration IPFS, IPLD, and the Filecoin APIs have enjoyed.

Thanks to Alan Shaw and Mikeal Rogers without whom this project would have never got started. The core Merkle clock is based on [Alan's Pail](https://github.com/alanshaw/pail), and you can see the repository history goes all the way back to work begun as a branch of that repo. Mikeal wrote [the prolly trees implementation](https://github.com/mikeal/prolly-trees).

## Install

```
npm install @fireproof-storage/fireproof
```

# Contributing

Feel free to join in. All welcome. [Open an issue](https://github.com/jchris/fireproof/issues)!

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/jchris/fireproof/blob/main/LICENSE.md)
