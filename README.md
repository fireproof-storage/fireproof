# pail

DAG based key value store. Sharded DAG that minimises traversals and work to build shards.

## Background

* Max block size = 512KiB
* Max key length is 64
* Represenation dag-cbor `[[key, CID],…]`
    * Array so mutations are easier - insert/remove elements at the right place with `Array.splice`
    * `Object.entries` from serialization form is easy
    * Keys are sorted lexicographically

### Lazy sharding

Do the minimum amount of work to make the block fit in the size limit.

Still deterministic.

Minimises traversals.

#### Sharding algorithm:

1. Find longest common prefix using insert key as base
2. If common prefix for > 1 entries exists
    1. Create new shard with suffixes for entries that match common prefix
    1. Remove entries with common prefix from shard
    1. Add entry for common prefix, linking new shard
    1. FINISH
3. Else
    1. Find longest common prefix using adjacent key as base
    1. GOTO 2

e.g.
```
abelllllll
foobarbaz
foobarwooz
food
somethingelse
```

Put "foobarboz" and exceed shard size limit:
```
abelllllll
foobarbaz
<- foobarboz
foobarwooz
food
somethingelse
```

Find "foobar" as longest common prefix, create shard:
```
abelllllll
foobar -> baz
          boz
          wooz
food
somethingelse
```

Put "foopey":
```
abelllllll
foobar -> baz
          boz
          wooz
food
<- foopey
somethingelse
```

Find "foo" as longest common prefix, create shard:
```
abelllllll
foo -> bar -> baz
              boz
              wooz
       d
       pey
somethingelse
```

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

### Worked Example

⚠️ max key length 16, max block size X - indicated when met.

1. Put `file.txt: CID<data0>`

    Root:

    ```js
    [
      ['file.txt', CID<data0>]
    ]
    ```

2. Put `path/to/picture.jpg: CID<data1>`

    Root:

    ```js
    [
      ['file.txt', CID<data0>],
      ['path/to/picture.', [CID<shard0>]],
    ]
    ```

    Shard 0:

    ```js
    [
      ['jpg', CID<data1>]
    ]
    ```
    
    Note: New key exceeds max length so forces a shard.
    Note: Shards signaled by tuple `[CID]` for value (multiple elements invalid).

2. Put `path/to/picture.highres.jpg: CID<data2>`

    Root:

    ```js
    [
      ['file.txt', CID<data0>],
      ['path/to/picture.', [CID<shard0>]],
    ]
    ```

    Shard 0:

    ```js
    [
      ['highres.jpg', CID<data2>],
      ['jpg', CID<data1>]
    ]
    ```
    
    Note: Traverse into matching subkey shard.
    Note: Keys are sorted in shard.

2. Put `path/to/picture.maxres.jpg: CID<data3>`
    Put `path/to/picture.final.jpg: CID<data4>`
    Put `path/to/picture.final-2.jpg: CID<data5>`

    Root:

    ```js
    [
      ['file.txt', CID<data0>],
      ['path/to/picture.', [CID<shard0>]],
    ]
    ```

    Shard 0:

    ```js
    [
      ['final.jpg', CID<data4>],
      ['final-2.jpg', CID<data5>],
      ['highres.jpg', CID<data2>],
      ['jpg', CID<data1>],
      ['maxres.jpg', CID<data3>]
    ]
    ```
    
    Final put exceeds max block size in shard:
    Put `path/to/final-3.jpg: CID<data6>`
    
    Shard 0 (invalid - too big):

    ```js
    [
      ['final.jpg', CID<data4>],
      ['final-2.jpg', CID<data5>],
      ['final-3.jpg', CID<data6>],
      ['highres.jpg', CID<data2>],
      ['jpg', CID<data1>],
      ['maxres.jpg', CID<data3>]
    ]
