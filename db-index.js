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
    mapFun(doc, (k) => {
      indexEntries.push({
        key: [k, doc._id],
        del: true
      })
    })
  })
  return indexEntries
}

const oldDocsBeforeChanges = async (changes, snapshot) => {
  const oldDocs = new Map()
  for (const { key } of changes) {
    if (oldDocs.has(key)) continue
    try {
      const change = await snapshot.get(key)
      oldDocs.set(key, change)
    } catch (e) {
      console.log('olddocs e', key, e.message)
      if (e.message !== 'Not found') throw e
    }
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
  async query (query, root = null) {
    if (!root) {
      await this.#updateIndex()
    }
    root = root || this.indexRoot
    const response = await queryIndexRange(this.database.blocks, root, query)
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
    this.dbHead = null
    this.indexRoot = null
    const result = await this.database.changesSince(this.dbHead)
    if (this.dbHead) {
      const oldDocs = await oldDocsBeforeChanges(result.rows, this.database.snapshot(this.dbHead))
      const oldIndexEntries = indexEntriesForOldChanges(oldDocs, this.mapFun)
      console.log('oldIndexEntries', oldIndexEntries) // { key: [55, 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c'], del: true }
      this.indexRoot = await bulkIndex(this.database.blocks, this.indexRoot, oldIndexEntries, opts)
      this.removalRoot = this.indexRoot
    }
    const indexEntries = indexEntriesForChanges(result.rows, this.mapFun)
    console.log('indexEntries', indexEntries)
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
    console.log('created index', inRoot.cid)
    return inRoot
  } else {
    // load existing index
    console.log('loading index', inRoot.cid)
    const index = await load({ cid: inRoot.cid, get: getBlock, ...opts })
    const { root, blocks } = await index.bulk(indexEntries)
    for await (const block of blocks) {
      await putBlock(block.cid, block.bytes)
    }
    console.log('updated index', root.block.cid)

    return root.block // if we hold the root we won't have to load every time
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
