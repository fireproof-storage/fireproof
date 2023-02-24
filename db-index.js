import { create, load } from 'prolly-trees/db-index'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { nocache as cache } from 'prolly-trees/cache'
import { bf, simpleCompare as compare } from 'prolly-trees/utils'
import * as codec from '@ipld/dag-cbor'
import { create as createBlock } from 'multiformats/block'
const opts = { cache, chunker: bf(3), codec, hasher, compare }
const makeGetBlock = (blocks) => async (address) => {
  const { cid, bytes } = await blocks.get(address)
  return createBlock({ cid, bytes, hasher, codec })
}

const makeDoc = ({ key, value }) => ({ _id: key, ...value })

const indexEntriesForChanges = (changes, mapFun) => {
  const indexEntries = []
  changes.forEach(({ key, value, del }) => {
    if (del) return
    mapFun(makeDoc({ key, value }), (k, v) => {
      indexEntries.push({
        key: [k, key],
        value: v
      })
    })
  })
  return indexEntries
}

const indexEntriesForOldChanges = (docs, mapFun) => {
  const indexEntries = []
  docs.forEach((doc) => {
    mapFun(doc, (k, v) => {
      indexEntries.push({
        key: [k, doc._id],
        value: v
      })
    })
  })
  return indexEntries
}

const oldDocsBeforeChanges = async (changes, snapshot) => {
  const oldDocs = new Map()
  for (const { key, value, del } of changes) {
    if (oldDocs[key]) continue
    console.log('get change', key)
    oldDocs[key] = await snapshot.get(key) // do we want it to come back as {key, value} or {_id, ...value}?
    console.log('got change', oldDocs[key])
    oldDocs.set(key, makeDoc({ key, value }))
  }
  return Array.from(oldDocs.values())
}

export default class Index {
  constructor (database, mapFun) {
    this.database = database
    this.mapFun = mapFun
    this.indexRoot = null
    this.dbHead = null
  }

  /**
   * Query object can have {range}
   *
   */
  async query (query) {
    // if (!this.indexRoot) {
    await this.#updateIndex()
    // }
    const response = await queryIndexRange(this.database.blocks, this.indexRoot, query)
    return {
      // TODO fix this naming upstream in prolly/db-index
      rows: response.result.map(({ id, key, row }) => ({ id: key, key: id, value: row }))
    }
  }

  /**
   * Update the index with the latest changes
   * @private
   * @returns {Promise<void>}
   */
  async #updateIndex () {
    const result = await this.database.changesSince(this.dbHead)
    const indexEntries = indexEntriesForChanges(result.rows, this.mapFun)

    if (this.dbHead) {
      const oldDocs = await oldDocsBeforeChanges(result.rows, this.database.snapshot(this.dbHead))
      console.log('old docs', oldDocs)
      // const oldIndexEntries = indexEntriesForChanges(oldDocs, this.mapFun)
    }

    // TODO we need removals for when documents change, does that mean we need to index the entries by doc id?
    this.indexRoot = await bulkIndex(this.database.blocks, this.indexRoot, indexEntries, opts)
    this.dbHead = result.head
  }

  // todo use the index from other peers?
  // we might need to add CRDT logic to it for that
  // it would only be a performance improvement, but might add a lot of complexity
  //   advanceIndex ()) {}
}

/**
 * Update the index with the given entries
 * @param {Blockstore} blocks
 * @param {import('multiformats/block').Block} inRoot
 * @param {import('prolly-trees/db-index').IndexEntry[]} indexEntries
 */
async function bulkIndex (blocks, inRoot, indexEntries) {
  if (!indexEntries.length) return inRoot
  const putBlock = blocks.put.bind(blocks)
  const getBlock = makeGetBlock(blocks)
  if (!inRoot) {
    // make a new index

    for await (const node of await create({ get: getBlock, list: indexEntries, ...opts })) {
      const block = await node.block
      await putBlock(block.cid, block.bytes)
      inRoot = block
    }
    return inRoot
  } else {
    // load existing index
    const index = await load({ cid: inRoot.cid, get: getBlock, ...opts })
    const { root, blocks } = await index.bulk(indexEntries)
    for await (const block of blocks) {
      await putBlock(block.cid, block.bytes)
    }
    return root.block
  }
}

/**
 * Query the index for the given range
 * @param {Blockstore} blocks
 * @param {import('multiformats/block').Block} inRoot
 * @param {import('prolly-trees/db-index').Query} query
 * @returns {Promise<import('prolly-trees/db-index').QueryResult>}
 **/
async function queryIndexRange (blocks, { cid }, query) {
  if (!cid) return { result: [] }
  const getBlock = makeGetBlock(blocks)
  const index = await load({ cid, get: getBlock, ...opts })
  return index.range(...query.range)
}
