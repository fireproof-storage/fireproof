# Encrypted Blockstore

Multi-writer self-hosted local-first [IPFS-compatible blockstore](https://ipfs.tech) with end-to-end encryption. If you have code that expects a JavaScript blockstore, you can instantiate one of these instead and get superpowers. What kind of superpowers? 

By default, encrypted blockstores are backed by the browser or the local filesystem. Each transaction is committed as a new immutable CAR file (content addressed archive), which can be replicated and hosted anywhere. The blockstore has connectors for a range of cloud storage providers, so you can easily sync your data using AWS, Netlify, Cloudflare, web3.storage, or any other cloud storage provider. [See the full list of connectors](#connectors).

## Usage

The interface will be similar to other content-addressed blockstores, like the [IPFS JS blockstore](https://github.com/ipfs/js-stores)

```js
const store = new EncryptedBlockstore(requiredConfig)

await store.transaction(async (blocks) => {
  // ... your app logic ...
  await blocks.put(cid1, bytes1)
  
  // ... your app logic ...
  await blocks.put(cid2, bytes2)
  
  // return any small data shape your code needs to read
  // from the blockstore like a CID for the most recent 
  // user data. this is your mutable state pointer.
  return { myCustomHeader : cid2 } 
})

// the store can be read from outside a transaction
const block = await store.get(cid1)
```

You can see that once you are in a transaction, the blocks look just like an IFPS blockstore. In addition to `put` `get` and `delete`, you can also use `putSync` and `getSync`, and list blocks with `entries`.

This blockstore is excellent for any data structure that you want to persist locally and replicate online. It is especially useful for [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) and [DAGs](https://en.wikipedia.org/wiki/Directed_acyclic_graph), but should work for any IPFS CID storage and retrieval.

## Setup

To configure the blockstore, you need to provide a callback and some implementations. The callback is called on every transaction and is where you can do things like update your UI or merge the incoming data with your data structures. The implementations are for the storage and encryption functions, which can vary by platform. The blockstore ships with basic implementations for the browser and the local filesystem, but you can also provide your own to fit your platform.

```js
import { EncryptedBlockstore } from '@fireproof/encrypted-blockstore'
import * as crypto from '@fireproof/encrypted-blockstore/crypto-web'
import * as store from '@fireproof/encrypted-blockstore/store-web'

const blockstoreConfig = {
  name: 'my-app',
  applyMeta: async (meta) => {
    // This is called on multi-user write and local load with your custom header.
    // It's where you can react to remote changes or load a new dataset.
    // You can also use this to merge the incoming data with your local data.
    myDataStructure.merge(meta.myCustomHeader)
  }
  crypto,
  store
}

const store = new EncryptedBlockstore(blockstoreConfig)
```

The `applyMeta` function can call into your data structures to merge the incoming data. The encrypted blockstore takes care of making sure blocks are available by CID, so all your code needs to do is read from the blockstore. The custom header returned from your next transaction will be made available to anyone listening to the blockstore. This is how you can sync your data across multiple devices.

## Working with CRDTs

For correctness, you'll want to have a data structure that can merge incoming data. There are very many of these. It's important because updates can come from anywhere in any order. The blockstore will make sure that all the blocks are available by CID, but it's up to your code to merge the incoming data. If your merge operation is commutative, then you can merge in any order. Warning, if you try to privilege your local data, or otherwise make a lossy merge, your app will have trouble syncing. If this sounds like something you don't want to worry about, then you should probably be using one of the libraries that depend on Encrypted Blockstore, like [Fireproof](https://use-fireproof.com) which gives a MongoDB-like API and handles the merging and sync for you.

## Encryption

Encrypted Blockstore uses symmetric keys, and each blockstore generates its own key. This means that files are opaque to storage providers, but the key is broadcast on the metadata channel, so it's up to you how secure you want to make it. [Read about the encryption model in the Fireproof docs here](https://use-fireproof.com/docs/database-api/encryption). The blockstore was extracted from Fireproof, so for the first releases you'll want to read the Fireproof docs for more information.






