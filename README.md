# Fireproof

Fireproof is a realtime database for today's interactive applications. It uses immutable data and distributed protocols 
to offer a new kind of database that:
- can be embedded in any page or app, with a flexible data ownership model
- scales without incurring developer costs, thanks to Filecoin
- uses cryptographically verifiable protocols

Learn more about the concepts and architecture behind Fireproof on our website.


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

A simple put, get, and delete interface for keeping track of all your JSON documentnts. Once your data is in Fireproof you can access it from any app or website Fireproof document store uses MVCC versioning and Merkle clocks so you can always recover the version you are looking for.

### Flexible Indexes

Fireproof indexes are defined by custom JavaScript functions that you write, allowing you to easily index and search your data in the way that works best for your application. Easily handle data variety and schema drift by normalizing any schema to the desired index.

### Realtime Updates

Subscribe to query changes in your application, so your UI updates automatically. Use the supplied React hooks, our Redux connector, or simple function calls to be notified of relevant changes.

### Self-soverign identity

Fireproof is so easy to integrate with any site or app because you can get started right away, and set up an account later. By default users write to their own database copy, so you can get pretty far before you even have to think about API keys.

### Automatic Replication

Documents changes are persisted to Filecoin via web3.storage, and made available over IPFS and on a global content delivery network. All you need to do to sync state is send a link to the latest database head, and Fireproof will take care of the rest.


## Thanks

Thanks to Alan Shaw and Mikeal Rogers without whom this project would have never got started. The core merkle clock is based on [Alan's Pail](https://github.com/alanshaw/pail), and you can see the repository history goes all the way back to work begun as a branch of that repo. Mikeal wrote the initial prolly trees implementation.


[![Test](https://github.com/alanshaw/pail/actions/workflows/test.yml/badge.svg)](https://github.com/alanshaw/pail/actions/workflows/test.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)


## Install

```
npm install @fireproof-storage/fireproof
```

# Contributing

Feel free to join in. All welcome. [Open an issue](https://github.com/alanshaw/pail/issues)!

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/alanshaw/pail/blob/main/LICENSE.md)
