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
    console.log('this.dbHead', this.dbHead)
    const result = await this.database.docsSince(this.dbHead)
    console.log('docs since', result.rows)
    const indexEntries = []
    result.rows.forEach(doc => {
      this.mapFun(doc, (k, v) => {
        indexEntries.push({
          key: [k, doc._id],
          value: v
        })
      })
    })
    console.log('old indexRoot', this.indexRoot?.cid)
    // TODO we need removals for when documents change, does that mean we need to index the entries by doc id?
    console.log('index entries', indexEntries)
    const rootNode = await bulkIndex(this.database.blocks, this.indexRoot, indexEntries, opts)
    this.indexRoot = rootNode
    console.log('new indexRoot', this.indexRoot?.cid)
    console.log('new dbHead', result.head)
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
  const putBlock = blocks.put.bind(blocks)
  const getBlock = makeGetBlock(blocks)
  if (!inRoot) {
    // make a new index
    console.log('new index', indexEntries.length)

    for await (const node of await create({ get: getBlock, list: indexEntries, ...opts })) {
      const block = await node.block
      await putBlock(block.cid, block.bytes)
      inRoot = block
    }
    return inRoot
  } else {
    // load existing index
    console.log('bulk add', indexEntries.length)
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
async function queryIndexRange (blocks, { cid, value }, query) {
  const getBlock = makeGetBlock(blocks)
  console.log('queryIndexRange', { cid, value })

  const index = await load({ cid, get: getBlock, ...opts })
  return index.range(...query.range)
}
