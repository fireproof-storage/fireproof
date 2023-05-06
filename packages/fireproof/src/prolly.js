import {
  advance,
  EventFetcher,
  EventBlock,
  findCommonAncestorWithSortedEvents,
  findEventsToSync,
  vis as visClock
} from './clock.js'
// import { create, load } from '../../../../prolly-trees/src/map.js'
// @ts-ignore
import { create, load } from 'prolly-trees/map'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
// @ts-ignore
import { CIDCounter, bf, simpleCompare as compare } from 'prolly-trees/utils'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { doTransaction } from './blockstore.js'
import { create as createBlock } from 'multiformats/block'
const blockOpts = { cache, chunker: bf(30), codec, hasher, compare }

// const SYNC_ROOT = 'fireproof' // change this if you want to break sync

/**
 * @typedef {import('./blockstore.js').TransactionBlockstore} TransactionBlockstore
 */

// const withLog = async (label, fn) => {
//   const resp = await fn()
//   // console.log('withLog', label, !!resp)
//   return resp
// }

// should also return a CIDCounter
export const makeGetBlock = blocks => {
  // const cids = new CIDCounter() // this could be used for proofs of mutations
  const getBlockFn = async address => {
    // const { cid, bytes } = await withLog(address, () => blocks.get(address))
    const { cid, bytes } = await blocks.get(address)
    // cids.add({ address: cid })
    return createBlock({ cid, bytes, hasher, codec })
  }
  return {
    // cids,
    getBlock: getBlockFn
  }
}

/**
 *
 * @param {*} param0
 * @returns
 */
async function createAndSaveNewEvent ({ inBlocks, bigPut, root, event: inEvent, head, additions, removals = [] }) {
  let cids
  const { key, value, del } = inEvent
  console.log('createAndSaveNewEvent', root)
  const data = {
    root: root
      ? root.cid
      : null,
    key
  }
  // import('./clock').EventLink<import('./clock').EventData>
  if (del) {
    data.value = null
    data.type = 'del'
  } else {
    data.value = value
    data.type = 'put'
  }
  // console.log('head', head)
  // if (head.length === 0) {
  //   // create an empty prolly root
  //   let emptyRoot

  //   for await (const node of create({ get: getBlock, list: [{ key: '_sync', value: SYNC_ROOT }], ...blockOpts })) {
  //     emptyRoot = await node.block
  //     bigPut(emptyRoot)
  //   }
  //   console.log('emptyRoot', emptyRoot)
  //   const first = await EventBlock.create(
  //     {
  //       root: emptyRoot.cid,
  //       key: null,
  //       value: null,
  //       type: 'del'
  //     },
  //     []
  //   )
  //   bigPut(first)
  //   head = [first.cid]
  // }

  /** @type {import('./clock').EventData} */
  // @ts-ignore
  const event = await EventBlock.create(data, head)
  bigPut(event)
  // @ts-ignore
  ;({ head, cids } = await advance(inBlocks, head, event.cid))

  return {
    root,
    additions,
    removals,
    head,
    clockCIDs: cids,
    event
  }
}

const makeGetAndPutBlock = inBlocks => {
  // const mblocks = new MemoryBlockstore()
  // const blocks = new MultiBlockFetcher(mblocks, inBlocks)
  const { getBlock, cids } = makeGetBlock(inBlocks)
  const put = inBlocks.put.bind(inBlocks)
  const bigPut = async (block, additions) => {
    // console.log('bigPut', block.cid.toString())
    const { cid, bytes } = block
    put(cid, bytes)
    // mblocks.putSync(cid, bytes)
    if (additions) {
      additions.set(cid.toString(), block)
    }
  }
  return { getBlock, bigPut, blocks: inBlocks, cids }
}

const bulkFromEvents = (sorted, event) => {
  if (event) {
    const update = { value: { data: { key: event.key } } }
    if (event.del) {
      update.value.data.type = 'del'
    } else {
      update.value.data.type = 'put'
      update.value.data.value = event.value
    }
    sorted.push(update)
  }
  const bulk = new Map()
  for (const { value: event } of sorted) {
    const {
      data: { type, value, key }
    } = event
    const bulkEvent = type === 'put' ? { key, value } : { key, del: true }
    bulk.set(bulkEvent.key, bulkEvent) // last wins
  }
  return Array.from(bulk.values())
}

// Get the value of the root from the ancestor event
/**
 *
 * @param {EventFetcher} events
 * @param {import('./clock').EventLink<import('./clock').EventData>} ancestor
 * @param {*} getBlock
 * @returns
 */
const prollyRootFromAncestor = async (events, ancestor, getBlock) => {
  // console.log('prollyRootFromAncestor', ancestor)
  const event = await events.get(ancestor)
  const { root } = event.value.data
  if (root) {
    return load({ cid: root, get: getBlock, ...blockOpts })
  } else {
    console.log('no root', root) // false means no common ancestor. null means empty database.
    return root
  }
}

// async function bigMerge (events, head, getBlock) {
//   const allRoots = await Promise.all(head.map(async h => prollyRootFromAncestor(events, h, getBlock)))
//   console.log('allRoots', allRoots)
//   // todo query over all roots and merge them, but how do they not have a common ancestor? they all start with the _sync root
//   throw new Error('not implemented')
// }

const doProllyBulk = async (inBlocks, head, event, doFull = false) => {
  const { getBlock, blocks } = makeGetAndPutBlock(inBlocks) // this is doubled with eventfetcher
  let bulkSorted = []
  let prollyRootNode = null
  const events = new EventFetcher(blocks)
  if (head.length) {
    if (!doFull && head.length === 1) {
      prollyRootNode = await prollyRootFromAncestor(events, head[0], getBlock)
    } else {
      // Otherwise, we find the common ancestor and update the root and other blocks
      // todo this is returning more events than necessary, lets define the desired semantics from the top down
      // good semantics mean we can cache the results of this call
      // const {cids, events : bulkSorted } = await findEventsToSync(blocks, head)
      const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head, doFull)

      bulkSorted = sorted
      console.log('sorted', !!ancestor, JSON.stringify(sorted.map(({ value: { data: { key, value } } }) => ({ key, value }))))
      if (ancestor) {
        prollyRootNode = await prollyRootFromAncestor(events, ancestor, getBlock)
        // if (!prollyRootNode) {
        //   prollyRootNode = await bigMerge(events, head, getBlock)
        //   // throw new Error('no common ancestor')
        // }
      }
      // console.log('event', event)
    }
  }

  const bulkOperations = bulkFromEvents(bulkSorted, event)

  // if prolly root node is null, we need to create a new one
  if (!prollyRootNode) {
    console.log('make new root', bulkOperations.length)
    let root
    let rootNode
    const newBlocks = []
    // if all operations are deletes, we can just return an empty root
    if (bulkOperations.every(op => op.del)) {
      return { root: null, blocks: [], clockCIDs: await events.all() }
    }
    for await (const node of create({ get: getBlock, list: bulkOperations, ...blockOpts })) {
      root = await node.block
      rootNode = node
      newBlocks.push(root)
    }
    // throw new Error('not root time')
    console.log('made new root', rootNode.constructor.name, root.value)
    return { root, blocks: newBlocks, clockCIDs: await events.all() }
  } else {
    const writeResp = await prollyRootNode.bulk(bulkOperations) // { root: newProllyRootNode, blocks: newBlocks }
    writeResp.clockCIDs = await events.all()
    return writeResp
  }
}

/**
 * Put a value (a CID) for the given key. If the key exists it's value is overwritten.
 *
 * @param {import('./blockstore.js').Blockstore} inBlocks Bucket block storage.
 * @param {import('./clock').EventLink<import('./clock').EventData>[]} head Merkle clock head.
 * @param {{key: string, value: import('./clock').EventLink<import('./clock').EventData>}} event The key of the value to put.
 * @param {object} [options]
 * @returns {Promise<any>}
 */
export async function put (inBlocks, head, event, options) {
  const { bigPut } = makeGetAndPutBlock(inBlocks)
  console.log('major put')
  // If the head is empty, we create a new event and return the root and addition blocks
  if (!head.length) {
    const additions = new Map()
    const { root, blocks } = await doProllyBulk(inBlocks, head, event)
    for (const b of blocks) {
      bigPut(b, additions)
    }
    return createAndSaveNewEvent({ inBlocks, bigPut, root, event, head, additions: Array.from(additions.values()) })
  }
  const { root: newProllyRootNode, blocks: newBlocks } = await doProllyBulk(inBlocks, head, event)

  if (!newProllyRootNode) {
    return createAndSaveNewEvent({
      inBlocks,
      bigPut,
      root: null,
      event,
      head,
      additions: []
    })
  } else {
    const prollyRootBlock = await newProllyRootNode.block
    const additions = new Map() // ; const removals = new Map()
    bigPut(prollyRootBlock, additions)
    for (const nb of newBlocks) {
      bigPut(nb, additions)
    }
    // additions are new blocks
    return createAndSaveNewEvent({
      inBlocks,
      bigPut,
      root: prollyRootBlock,
      event,
      head,
      additions: Array.from(additions.values()) /*, todo? Array.from(removals.values()) */
    })
  }
}

/**
 * Determine the effective prolly root given the current merkle clock head.
 *
 * @param {TransactionBlockstore} inBlocks Bucket block storage.
 * @param {import('./clock').EventLink<import('./clock').EventData>[]} head Merkle clock head.
 */
export async function root (inBlocks, head, doFull = false) {
  if (!head.length) {
    throw new Error('no head')
  }
  console.log('root', head.map(h => h.toString()))
  // todo maybe these should go to a temp blockstore?
  return await doTransaction(
    'root',
    inBlocks,
    async transactionBlocks => {
      const { bigPut } = makeGetAndPutBlock(transactionBlocks)
      const { root: newProllyRootNode, blocks: newBlocks, clockCIDs } = await doProllyBulk(inBlocks, head, null, doFull)

      for (const nb of newBlocks) {
        bigPut(nb)
      }

      return { clockCIDs, node: newProllyRootNode }
    },
    false
  )
  // return { clockCIDs, node: newProllyRootNode }
}

/**
 * Get the list of events not known by the `since` event
 * @param {TransactionBlockstore} blocks Bucket block storage.
 * @param {import('./clock').EventLink<import('./clock').EventData>[]} head Merkle clock head.
 * @param {import('./clock').EventLink<import('./clock').EventData>} since Event to compare against.
 * @returns {Promise<{clockCIDs: CIDCounter, result: import('./clock').EventData[]}>}
 */
export async function eventsSince (blocks, head, since) {
  if (!head.length) {
    // throw new Error('no head')
    return { clockCIDs: [], result: [] }
  }
  // @ts-ignore
  const sinceHead = [...since, ...head] // ?
  const { cids, events: unknownSorted3 } = await findEventsToSync(blocks, sinceHead)
  return { clockCIDs: cids, result: unknownSorted3.map(({ value: { data } }) => data) }
}

/**
 *
 * @param {TransactionBlockstore} blocks Bucket block storage.
 * @param {import('./clock').EventLink<import('./clock').EventData>[]} head Merkle clock head.
 *
 * @returns {Promise<{root: any, cids: CIDCounter, clockCIDs: CIDCounter, result: import('./clock').EventData[]}>}
 *
 */
export async function getAll (blocks, head, rootCache = null, doFull = false) {
  // todo use the root node left around from put, etc
  // move load to a central place
  if (!head.length) {
    return { root: null, clockCIDs: new CIDCounter(), cids: new CIDCounter(), result: [] }
  }
  const { node: prollyRootNode, clockCIDs } = await rootOrCache(blocks, head, rootCache, doFull)

  if (!prollyRootNode) {
    return { root: null, clockCIDs, cids: new CIDCounter(), result: [] }
  }
  const { result, cids } = await prollyRootNode.getAllEntries() // todo params
  return { root: prollyRootNode, clockCIDs, cids, result: result.map(({ key, value }) => ({ key, value })) }
}

async function rootOrCache (blocks, head, rootCache, doFull = false) {
  let node
  let clockCIDs
  if (!doFull && rootCache && rootCache.root) {
    console.log('get root from cache', rootCache)
    node = rootCache.root
    clockCIDs = rootCache.clockCIDs
  } else {
    // console.log('finding root')
    // const callTag = Math.random().toString(36).substring(7)
    // console.time(callTag + '.root')
    //
    // const prevClock = [...this.clock]

    ;({ node, clockCIDs } = await root(blocks, head, doFull))

    // this.applyClock(prevClock, result.head)
    // await this.notifyListeners([decodedEvent])

    // console.timeEnd(callTag + '.root')
    console.log('found root', node)
  }
  return { node, clockCIDs }
}

/**
 * @param {TransactionBlockstore} blocks Bucket block storage.
 * @param {import('./clock').EventLink<import('./clock').EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to retrieve.
 */
export async function get (blocks, head, key, rootCache = null) {
  // instead pass root from db? and always update on change
  if (!head.length) {
    return { cids: new CIDCounter(), result: null }
  }

  const { node: prollyRootNode, clockCIDs } = await rootOrCache(blocks, head, rootCache)

  if (!prollyRootNode) {
    return { clockCIDs, cids: new CIDCounter(), result: null }
  }
  const { result, cids } = await prollyRootNode.get(key)
  return { result, cids, clockCIDs, root: prollyRootNode }
}

export async function * vis (blocks, head) {
  if (!head.length) {
    return { cids: new CIDCounter(), result: null }
  }
  const { node: prollyRootNode, cids } = await root(blocks, head)
  const lines = []
  for await (const line of prollyRootNode.vis()) {
    yield line
    lines.push(line)
  }
  return { vis: lines.join('\n'), cids }
}

export async function visMerkleTree (blocks, head) {
  // if (!head) return
  if (head && !Array.isArray(head)) {
    const getBl = makeGetBlock(blocks)
    const prollyRootNode = await load({
      cid: head,
      get: getBl.getBlock,
      ...blockOpts
    })
    const lines = []
    for await (const line of prollyRootNode.vis()) {
      lines.push(line)
    }
    return { vis: lines.join('\n'), cids: new CIDCounter() }
  }
  const { node: prollyRootNode, cids } = await root(blocks, head)
  const lines = []
  for await (const line of prollyRootNode.vis()) {
    lines.push(line)
  }
  return { vis: lines.join('\n'), cids }
}

export async function visMerkleClock (blocks, head) {
  const lines = []
  for await (const line of visClock(blocks, head)) {
    // yield line
    lines.push(line)
  }
  return { vis: lines.join('\n') }
}
