import * as Clock from './clock.js'
import { EventFetcher, EventBlock } from './clock.js'
import { create, load } from 'prolly-trees/db-index'
import { nocache as cache } from 'prolly-trees/cache'
import { bf, simpleCompare as compare } from 'prolly-trees/utils'

import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'

import { MemoryBlockstore, MultiBlockFetcher } from './block.js'

import { create as createBlock } from 'multiformats/block'

export default class Index {
  constructor (database, mapFun) {
    this.database = database
    this.mapFun = mapFun
  }

  async query (query) {
    await this.#updateIndex()
    return {
      rows: []
    }
  }

  // build the function on all the docs in the database on first use
  async #createInitialIndex () {
    for await (const node of create({ get, list: [{ key, value }], ...opts })) {
      const block = await node.block
      await put(block.cid, block.bytes)

      mblocks.putSync(block.cid, block.bytes)
      additions.push(block)
      root = block
    }
  }

  async #updateIndex () {
    const docsSince = await this.database.docsSince()
    const indexEntries = []

    docsSince.forEach(doc => {
      this.mapFun(doc, (k, v) => {
        indexEntries.push([[k, doc._id], v])
      })
    })
    console.log('indexEntries', indexEntries)
  }

  //   advanceIndex ()) {}
}
