# Encrypted Blockstore

Multi-writer self-hosted local-first [IPFS-compatible blockstore](https://ipfs.tech) with end-to-end encryption. If you have code that expects a JavaScript blockstore, you can instantiate one of these instead and get superpowers. What kind of superpowers? 

By default, encrypted blockstores are backed by the browser or the local filesystem. Each transaction is committed as a new immutable CAR file (content addressed archive), which can be replicated and hosted anywhere. The blockstore has connectors for a range of cloud storage providers, so you can easily sync your data using AWS, Netlify, Cloudflare, web3.storage, or any other cloud storage provider. 

## Usage

The interface will be similar to other content-addressed blockstores, like the [IPFS JS blockstore](https://github.com/ipfs/js-stores)

```js
const blockstore = new EncryptedBlockstore(requiredConfig)

await blockstore.transaction(async (blocks) => {
  // ... your app logic ...
  await blocks.put(cid1, bytes1)
  
  // ... your app logic ...
  await blocks.put(cid2, bytes2)
  
  // return any small data shape your code needs to read
  // from the blockstore like a CID for the most recent 
  // user data. this is your mutable state pointer.
  return { myCustomHeader : cid2 } 
})

// the blockstore can be read from outside a transaction
const block = await blockstore.get(cid1)
```

You can see that once you are in a transaction, the blocks look just like an IFPS blockstore. In addition to `put` `get` and `delete`, you can also use `putSync` and `getSync`, and list blocks with `entries`.

This blockstore is excellent for any data structure that you want to persist locally and replicate online. It is especially useful for [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) and [DAGs](https://en.wikipedia.org/wiki/Directed_acyclic_graph), but should work for any IPFS CID storage and retrieval.

### Working with CRDTs

For correctness, you'll want to have a data structure that can merge incoming data. There are very many of these. It's important because updates can come from anywhere in any order. The blockstore will make sure that all the blocks are available by CID, but it's up to your code to merge the incoming data. If your merge operation is commutative, then you can merge in any order. Warning, if you try to privilege your local data, or otherwise make a lossy merge, your app will have trouble syncing. If this sounds like something you don't want to worry about, then you should probably be using one of the libraries that depend on Encrypted Blockstore, like [Fireproof](https://use-fireproof.com) which gives a MongoDB-like API and handles the merging and sync for you.

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
    await myDataStructure.merge(meta.myCustomHeader)
  },
  compact: async (compactionBlocks) => {
    // Traverse your data structure with your existing code, reading from the compaction blockstore
    await myDataStructure.listAll(compactionBlocks, myCustomHeader)
    // return the data-structure header in the same format as a transaction call
    return myCustomHeader
  },
  crypto,
  store
}

const blockstore = new EncryptedBlockstore(blockstoreConfig)
```

The `applyMeta` function can call into your data structures to merge the incoming data. The encrypted blockstore takes care of making sure blocks are available by CID, so all your code needs to do is read from the blockstore. The custom header returned from your next transaction will be made available to anyone listening to the blockstore. This is how you can sync your data across multiple devices.

## Compaction

Without compaction, your blockstore will grow with each transaction, as each transaction is committed to a new immutable CAR file. This results in thousands of small files, many containing duplicate or out-of-date data. If you don't provide a compaction function, the blockstore can use a default compaction function that deduplicates and preserves all the CIDs in the set, into a single file (coming soon). Your data structure can do better, as it will know which blocks can be safely discarded. Implement compaction as a callback that is passed a blockstore instance which logs any blocks that it reads. Your function should traverse your entire dataset. At the end the blockstore writes out a new unified CAR file, with links to the old CAR files. This speeds up sync and read times because it results in a single CAR file that contains all the deduplicated blocks.

The `compact` function above is an example of this, or see the [Fireproof compaction function in the CRDT library](https://github.com/fireproof-storage/fireproof/blob/main/packages/fireproof/src/crdt.ts) for another example.

The blockstore will take care to update the header and write out a fresh CAR file with all the blocks. This CAR file will be faster to fetch, and new operations will be performed as a diff against this CAR file.

### Compaction Cleanup

In shared storage situations, just because compaction has removed references to old files, doesn't mean there aren't other readers that would like to read them. Instead of immediately deleting old files, it deletes the files unlinked from the previous compaction. Additionally, in many connectors, the old files are simply not deleted at all, in favor of syncing well with remote clients. Running a cloud cleanup is possible, but it's not implemented yet.

## Encryption

Encrypted Blockstore uses symmetric keys, and each blockstore generates its own key. This means that files are opaque to storage providers, but the key is broadcast on the metadata channel, so it's up to you how secure you want to make it. [Read about the encryption model in the Fireproof docs here](https://use-fireproof.com/docs/database-api/encryption). The blockstore was extracted from Fireproof, so for the first releases you'll want to read the Fireproof docs for more information.

## Connectors

The blockstore layer includes all the Fireproof connectors, so you can leverage all the work that has been done there, and easily sync your data to any cloud storage provider. There are always more connectors, so [check here for the main collection.](https://github.com/fireproof-storage/fireproof/tree/main/packages)

* [S3](https://github.com/fireproof-storage/valid-cid-s3-bucket) - Verified storage for CAR files, using Lambda and signed URLs
* [Netlify](https://www.npmjs.com/package/@fireproof/netlify) - CAR file storage and shared CRDT access
* [PartyKit](https://www.npmjs.com/package/@fireproof/partykit) - Cloudflare Workers for realtime sync and storage
* [web3.storage](https://www.npmjs.com/package/@fireproof/ipfs) - I heard you like IPFS, so I put your IPFS blocks in encrypted CAR files on IPFS

## Architecture

Read about the overall architecture in the [Fireproof docs](https://use-fireproof.com/docs/architecture).

## Contributing

Please [join the Fireproof discord to discuss the project and get involved.](https://discord.gg/cCryrNHePH)