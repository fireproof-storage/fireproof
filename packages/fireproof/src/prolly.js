import {
  advance,
  EventFetcher,
  EventBlock,
  findCommonAncestorWithSortedEvents,
  findEventsToSync
} from './clock.js'
import { create, load } from 'prolly-trees/map'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { doTransaction } from './blockstore.js'

import { nocache as cache } from 'prolly-trees/cache'
import { CIDCounter, bf, simpleCompare as compare } from 'prolly-trees/utils'
import { create as createBlock } from 'multiformats/block'
const opts = { cache, chunker: bf(3), codec, hasher, compare }

const withLog = async (label, fn) => {
  const resp = await fn()
  // console.log('withLog', label, !!resp)
  return resp
}

// should also return a CIDCounter
export const makeGetBlock = (blocks) => {
  // const cids = new CIDCounter() // this could be used for proofs of mutations
  const getBlockFn = async (address) => {
    const { cid, bytes } = await withLog(address, () => blocks.get(address))
    // cids.add({ address: cid })
    return createBlock({ cid, bytes, hasher, codec })
  }
  return {
    // cids,
    getBlock: getBlockFn
  }
}

/**
 * Creates and saves a new event.
 * @param {import('./blockstore.js').Blockstore} inBlocks - A persistent blockstore.
 * @param {MemoryBlockstore} mblocks - A temporary blockstore.
 * @param {Function} getBlock - A function that gets a block.
 * @param {Function} bigPut - A function that puts a block.
 * @param {import('prolly-trees/map').Root} root - The root node.
 * @param {Object<{ key: string, value: any, del: boolean }>} event - The update event.
 * @param {CID[]} head - The head of the event chain.
 * @param {Array<import('multiformats/block').Block>} additions - A array of additions.
 * @param {Array<mport('multiformats/block').Block>>} removals - An array of removals.
 * @returns {Promise<{
 *   root: import('prolly-trees/map').Root,
 *   additions: Map<string, import('multiformats/block').Block>,
 *   removals: Array<string>,
 *   head: CID[],
 *   event: CID[]
 * }>}
 */
async function createAndSaveNewEvent ({
  inBlocks,
  bigPut,
  root,
  event: inEvent,
  head,
  additions,
  removals = []
}) {
  let cids
  const { key, value, del } = inEvent
  const data = {
    type: 'put',
    root: {
      cid: root.cid,
      bytes: root.bytes,
      value: root.value
    },
    key
  }

  if (del) {
    data.value = null
    data.type = 'del'
  } else {
    data.value = value
  }
  /** @type {EventData} */

  const event = await EventBlock.create(data, head)
  bigPut(event)
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

const makeGetAndPutBlock = (inBlocks) => {
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

const bulkFromEvents = (sorted) =>
  sorted.map(({ value: event }) => {
    const {
      data: { type, value, key }
    } = event
    return type === 'put' ? { key, value } : { key, del: true }
  })

// Get the value of the root from the ancestor event
/**
 *
 * @param {EventFetcher} events
 * @param {Link} ancestor
 * @param {*} getBlock
 * @returns
 */
const prollyRootFromAncestor = async (events, ancestor, getBlock) => {
  // console.log('prollyRootFromAncestor', ancestor)
  const event = await events.get(ancestor)
  const { root } = event.value.data
  // console.log('prollyRootFromAncestor', root.cid, JSON.stringify(root.value))
  return load({ cid: root.cid, get: getBlock, ...opts })
}

/**
 * Put a value (a CID) for the given key. If the key exists it's value is overwritten.
 *
 * @param {import('../test/block.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to put.
 * @param {CID} value The value to put.
 * @param {object} [options]
 * @returns {Promise<Result>}
 */
export async function put (inBlocks, head, event, options) {
  const { getBlock, bigPut, blocks } = makeGetAndPutBlock(inBlocks)

  // If the head is empty, we create a new event and return the root and addition blocks
  if (!head.length) {
    const additions = new Map()
    let root
    for await (const node of create({ get: getBlock, list: [event], ...opts })) {
      root = await node.block
      bigPut(root, additions)
    }
    return createAndSaveNewEvent({ inBlocks, bigPut, root, event, head, additions: Array.from(additions.values()) })
  }

  // Otherwise, we find the common ancestor and update the root and other blocks
  const events = new EventFetcher(blocks)
  // this is returning more events than necessary
  const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head)
  // console.log('sorted', JSON.stringify(sorted.map(({ value: { data: { key, value } } }) => ({ key, value }))))
  const prollyRootNode = await prollyRootFromAncestor(events, ancestor, getBlock)

  const bulkOperations = bulkFromEvents(sorted)
  const { root: newProllyRootNode, blocks: newBlocks } = await prollyRootNode.bulk([...bulkOperations, event]) // ading delete support here
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

/**
 * Determine the effective prolly root given the current merkle clock head.
 *
 * @param {import('../test/block.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 */
export async function root (inBlocks, head) {
  if (!head.length) {
    throw new Error('no head')
  }
  const { getBlock, blocks } = makeGetAndPutBlock(inBlocks)
  const events = new EventFetcher(blocks)
  const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head)
  const prollyRootNode = await prollyRootFromAncestor(events, ancestor, getBlock)

  // Perform bulk operations (put or delete) for each event in the sorted array
  const bulkOperations = bulkFromEvents(sorted)
  const { root: newProllyRootNode, blocks: newBlocks } = await prollyRootNode.bulk(bulkOperations)
  const prollyRootBlock = await newProllyRootNode.block
  // console.log('emphemeral blocks', newBlocks.map((nb) => nb.cid.toString()))
  // todo maybe these should go to a temp blockstore?
  await doTransaction('root', inBlocks, async (transactionBlockstore) => {
    const { bigPut } = makeGetAndPutBlock(transactionBlockstore)
    for (const nb of newBlocks) {
      bigPut(nb)
    }
    bigPut(prollyRootBlock)
  })
  return { cids: events.cids, node: newProllyRootNode }
}

/**
 * Get the list of events not known by the `since` event
 * @param {import('../test/block.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {import('./clock').EventLink<EventData>} since Event to compare against.
 * @returns {Promise<import('./clock').EventLink<EventData>[]>}
 */
export async function eventsSince (blocks, head, since) {
  if (!head.length) {
    throw new Error('no head')
  }
  const sinceHead = [...since, ...head]
  const { cids, events: unknownSorted3 } = await findEventsToSync(blocks, sinceHead)
  return { clockCIDs: cids, result: unknownSorted3.map(({ value: { data } }) => data) }
}

/**
 *
 * @param {import('../test/block.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 *
 * @returns {Promise<import('./prolly').Entry[]>}
 *
 */
export async function getAll (blocks, head) {
  // todo use the root node left around from put, etc
  // move load to a central place
  if (!head.length) {
    return { clockCIDs: new CIDCounter(), cids: new CIDCounter(), result: [] }
  }
  const { node: prollyRootNode, cids: clockCIDs } = await root(blocks, head)
  const { result, cids } = await prollyRootNode.getAllEntries() // todo params
  return { clockCIDs, cids, result: result.map(({ key, value }) => ({ key, value })) }
}

/**
 * @param {import('../test/block.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to retrieve.
 */
export async function get (blocks, head, key) {
  // instead pass root from db? and always update on change
  if (!head.length) {
    return { cids: new CIDCounter(), result: null }
  }
  const { node: prollyRootNode, cids: clockCIDs } = await root(blocks, head)
  const { result, cids } = await prollyRootNode.get(key)
  return { result, cids, clockCIDs }
}
