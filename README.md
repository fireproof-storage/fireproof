# pail

[![Test](https://github.com/alanshaw/pail/actions/workflows/test.yml/badge.svg)](https://github.com/alanshaw/pail/actions/workflows/test.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

DAG based key value store. Sharded DAG that minimises traversals and work to build shards.

[Read the SPEC](https://hackmd.io/@alanshaw/pail).

## Install

```
npm install @alanshaw/pail
```

## Usage

```js
import { ShardBlock, put, get, del } from '@alanshaw/pail'

// Initialize a new bucket
const blocks = new Blockstore() // like https://npm.im/blockstore-core
const init = await ShardBlock.create() // empty root shard
await blocks.put(init.cid, init.bytes)

// Add a key and value to the bucket
const { root, additions, removals } = await put(blocks, init.cid, 'path/to/data0', dataCID0)

console.log(`new root: ${root}`)

// Process the diff
for (const block of additions) {
  await blocks.put(block.cid, block.bytes)
}
for (const block of removals) {
  await blocks.delete(block.cid)
}
```
# Contributing

Feel free to join in. All welcome. [Open an issue](https://github.com/alanshaw/pail/issues)!

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/alanshaw/pail/blob/main/LICENSE.md)
