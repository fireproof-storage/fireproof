import { advance, EventFetcher, EventBlock, findCommonAncestorWithSortedEvents, findUnknownSortedEvents } from './clock.js'
import { create, load } from 'prolly-trees/map'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { MemoryBlockstore, MultiBlockFetcher } from './block.js'
import { doTransaction } from './blockstore.js'

import { nocache as cache } from 'prolly-trees/cache'
import { bf, simpleCompare as compare } from 'prolly-trees/utils'
import { create as createBlock } from 'multiformats/block'
const opts = { cache, chunker: bf(3), codec, hasher, compare }

const internalKey = (key) => '_' + key
const decodeKey = (key) => key.slice(1)

const withLog = async (label, fn) => {
  const resp = await fn()
  // console.log('withLog', label, !!resp)
  return resp
}

const makeGetBlock = (blocks) => async (address) => {
  const { cid, bytes } = await withLog(address, () => blocks.get(address))
  return createBlock({ cid, bytes, hasher, codec })
}

async function createAndSaveNewEvent (inBlocks, mblocks, getBlock, bigPut, root, { key, value, del }, head, additions, removals = []) {
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
  await bigPut(event)
  head = await advance(inBlocks, head, event.cid)

  return {
    root,
    additions,
    removals,
    head,
    event
  }
}

const makeGetAndPutBlock = (inBlocks) => {
  const mblocks = new MemoryBlockstore()
  const blocks = new MultiBlockFetcher(mblocks, inBlocks)
  const getBlock = makeGetBlock(blocks)
  const put = inBlocks.put.bind(inBlocks)
  const bigPut = async (block, additions) => {
    // console.log('bigPut', block.cid.toString())
    const { cid, bytes } = block
    await put(cid, bytes)
    mblocks.putSync(cid, bytes)
    if (additions) {
      additions.set(cid.toString(), block)
    }
  }
  return { getBlock, bigPut, mblocks, blocks }
}

const bulkFromEvents = (sorted) =>
  sorted.map(({ value: event }) => {
    const {
      data: { type, value, key }
    } = event
    return type === 'put' ? { key, value } : { key, del: true }
  })

// Get the value of the root from the ancestor event
const prollyRootFromAncestor = async (events, ancestor, getBlock) => {
  const event = await events.get(ancestor)
  const { root } = event.value.data
  return load({ cid: root.cid, get: getBlock, ...opts })
}

/**
 * Put a value (a CID) for the given key. If the key exists it's value is overwritten.
 *
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to put.
 * @param {import('./link').AnyLink} value The value to put.
 * @param {object} [options]
 * @returns {Promise<Result>}
 */
export async function put (inBlocks, head, inEvent, options) {
  const { getBlock, bigPut, mblocks, blocks } = makeGetAndPutBlock(inBlocks)

  const event = { ...inEvent, key: internalKey(inEvent.key) }
  // console.log('event', event, internalKey(inEvent.key))
  // If the head is empty, we create a new event and return the root and addition blocks
  if (!head.length) {
    const additions = new Map()
    let root
    for await (const node of create({ get: getBlock, list: [event], ...opts })) {
      root = await node.block
      await bigPut(root, additions)
    }
    return createAndSaveNewEvent(inBlocks, mblocks, getBlock, bigPut, root, event, head, Array.from(additions.values()))
  }

  // Otherwise, we find the common ancestor and update the root and other blocks
  const events = new EventFetcher(blocks)
  const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head)
  const prollyRootNode = await prollyRootFromAncestor(events, ancestor, getBlock)

  const bulkOperations = bulkFromEvents(sorted)
  const { root: newProllyRootNode, blocks: newBlocks } = await prollyRootNode.bulk([...bulkOperations, event]) // ading delete support here
  const prollyRootBlock = await newProllyRootNode.block
  const additions = new Map() // ; const removals = new Map()
  await bigPut(prollyRootBlock, additions)
  for (const nb of newBlocks) {
    await bigPut(nb, additions)
  }

  return createAndSaveNewEvent(inBlocks, mblocks, getBlock, bigPut,
    prollyRootBlock, event, head, Array.from(additions.values()) /*, Array.from(removals.values()) */)
}

/**
 * Determine the effective prolly root given the current merkle clock head.
 *
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 */
export async function root (inBlocks, head) {
  if (!head.length) {
    throw new Error('no head')
  }
  const { getBlock, blocks, bigPut } = makeGetAndPutBlock(inBlocks)
  const events = new EventFetcher(blocks)
  const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head)
  const prollyRootNode = await prollyRootFromAncestor(events, ancestor, getBlock)

  // Perform bulk operations (put or delete) for each event in the sorted array
  const bulkOperations = bulkFromEvents(sorted)
  // console.log('bulkOperations', bulkOperations)
  const { root: newProllyRootNode, blocks: newBlocks } = await prollyRootNode.bulk(bulkOperations)

  // console.log('emphemeral blocks', newBlocks.map((nb) => nb.cid.toString()))
  await doTransaction(inBlocks, async () => {
    for (const nb of newBlocks) {
      await bigPut(nb)
    }
  })

  return (await newProllyRootNode.block).cid
}

/**
 * Get the list of events not known by the `since` event
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {import('./clock').EventLink<EventData>} since Event to compare against.
 * @returns {Promise<import('./clock').EventLink<EventData>[]>}
 */
export async function eventsSince (blocks, head, since) {
  if (!head.length) {
    throw new Error('no head')
  }
  const sinceHead = [...since, ...head]
  const unknownSorted3 = await findUnknownSortedEvents(blocks, sinceHead,
    await findCommonAncestorWithSortedEvents(blocks, sinceHead))
  return unknownSorted3.map(({ value: { data: { key, ...event } } }) => ({ key: decodeKey(key), ...event }))
}

/**
 *
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 *
 * @returns {Promise<import('./prolly').Entry[]>}
 *
 */
export async function getAll (blocks, head) {
  // todo use the root node left around from put, etc
  // move load to a central place
  const prollyRootNode = await load({
    cid: await root(blocks, head),
    get: makeGetBlock(blocks),
    ...opts
  })
  const { result } = await prollyRootNode.getAllEntries()
  return result.map(({ key, value }) => ({ key: decodeKey(key), value }))
}

/**
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to retrieve.
 */
export async function get (blocks, head, key) {
  // instead pass root from db? and always update on change
  const prollyRootNode = await load({ cid: await root(blocks, head), get: makeGetBlock(blocks), ...opts })
  const { result } = await prollyRootNode.get(internalKey(key))
  return result
}

/**
 * @typedef {{
 *   type: 'put'|'del'
 *   key: string
 *   value: import('./link').AnyLink
 *   root: import('./shard').ShardLink
 * }} EventData
 *
 * @typedef {{
 *   root: import('./shard').ShardLink
 *   head: import('./clock').EventLink<EventData>[]
 *   event: import('./clock').EventBlockView<EventData>
 * } & import('./db-index').ShardDiff} Result
 */
