import * as Clock from './clock.js'
import { EventFetcher, EventBlock, findCommonAncestorWithSortedEvents } from './clock.js'
import { create, load } from 'prolly-trees/map'

import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { MemoryBlockstore, MultiBlockFetcher } from './block.js'

import { nocache as cache } from 'prolly-trees/cache'
import { bf, simpleCompare as compare } from 'prolly-trees/utils'
import { create as createBlock } from 'multiformats/block'
const opts = { cache, chunker: bf(3), codec, hasher, compare }
const makeGetBlock = (blocks) => async (address) => {
  const { cid, bytes } = await blocks.get(address)
  return createBlock({ cid, bytes, hasher, codec })
}

/**
 * @typedef {{
 *   type: 'put'|'del'
 *   key: string
 *   value: import('./link').AnyLink
 *   root: import('./shard').ShardLink
 * }} EventData
 * @typedef {{
 *   root: import('./shard').ShardLink
 *   head: import('./clock').EventLink<EventData>[]
 *   event: import('./clock').EventBlockView<EventData>
 * } & import('./db-index').ShardDiff} Result
 */

/**
 * Put a value (a CID) for the given key. If the key exists it's value is
 * overwritten.
 *
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to put.
 * @param {import('./link').AnyLink} value The value to put.
 * @param {object} [options]
 * @returns {Promise<Result>}
 */
export async function put (inBlocks, head, key, value, options) {
  // key = [key, 1]
  const mblocks = new MemoryBlockstore()
  const blocks = new MultiBlockFetcher(mblocks, inBlocks)
  // const get = blocks.get.bind(blocks)

  const getBlock = makeGetBlock(blocks)

  const put = inBlocks.put.bind(inBlocks)

  if (!head.length) {
    let root
    const additions = []
    for await (const node of create({ get: getBlock, list: [{ key, value }], ...opts })) {
      const block = await node.block
      await put(block.cid, block.bytes)

      mblocks.putSync(block.cid, block.bytes)
      additions.push(block)
      root = block
    }

    /** @type {EventData} */
    const data = {
      type: 'put',
      root: {
        cid: root.cid,
        bytes: root.bytes,
        value: root.value
      },
      key,
      value
    }
    const event = await EventBlock.create(data, head)
    // is this save needed?
    await put(event.cid, event.bytes)
    mblocks.putSync(event.cid, event.bytes)

    head = await Clock.advance(blocks, head, event.cid)
    return {
      root,
      additions,
      removals: [],
      head,
      event
    }
  }

  const events = new EventFetcher(blocks)

  const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head)
  const aevent = await events.get(ancestor)
  const { root } = aevent.value.data
  // todo instead of loading it every time, we should be able to just make it part of the THIS
  const prollyRootNode = await load({ cid: root.cid, get: getBlock, ...opts })

  // console.log('sorted', sorted.length)
  const additions = new Map()
  const removals = new Map()

  const bulkOperations = sorted.map(({ value: event }) => {
    // console.log('event', event)
    const {
      data: { type, value, key }
    } = event
    return type === 'put' ? { key, value } : { key, del: true }
  })

  let prollyRootOut = prollyRootNode
  const { root: newProllyRootNode, blocks: newBlocks } =
    await prollyRootOut.bulk([...bulkOperations, { key, value }])

  prollyRootOut = newProllyRootNode

  for (const a of newBlocks) {
    await put(a.cid, a.bytes)
    mblocks.putSync(a.cid, a.bytes)
    additions.set(a.cid.toString(), a)
  }

  const finalProllyRootBlock = await prollyRootOut.block
  /** @type {EventData} */
  const data = {
    type: 'put',
    root: {
      cid: finalProllyRootBlock.cid,
      bytes: finalProllyRootBlock.bytes,
      value: finalProllyRootBlock.value
    },
    key,
    value
  }
  const event = await EventBlock.create(data, head)
  mblocks.putSync(event.cid, event.bytes)
  head = await Clock.advance(blocks, head, event.cid)
  // console.log('additions', additions.size, Array.from(additions.values()).map(v => v.cid.toString()).sort())
  return {
    root: finalProllyRootBlock,
    additions: Array.from(additions.values()),
    removals: Array.from(removals.values()),
    head,
    event
  }
}

/**
 * Determine the effective pail root given the current merkle clock head.
 *
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 */
export async function root (blocks, head) {
  if (!head.length) {
    throw new Error('no head')
  }

  const getBlock = makeGetBlock(blocks)

  // Use MemoryBlockstore to store blocks temporarily
  const mblocks = new MemoryBlockstore()
  // Use MultiBlockFetcher to fetch blocks
  blocks = new MultiBlockFetcher(mblocks, blocks)
  const events = new EventFetcher(blocks)

  // Find the common ancestor of the merkle clock head events

  const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head)

  // Get the value of the root from the ancestor event
  const aevent = await events.get(ancestor)
  const { root } = aevent.value.data

  // Load the root node of the ProllyTree with the given root CID
  const prollyRootNode = await load({ cid: root.cid, get: getBlock, ...opts })

  // Perform bulk operations (put or delete) for each event in the sorted array
  const bulkOperations = sorted.map(({ value: event }) => {
    const {
      data: { type, value, key }
    } = event
    return type === 'put' ? { key, value } : { key, del: true }
  })
  const { root: newProllyRootNode } = await prollyRootNode.bulk(bulkOperations)

  return await newProllyRootNode.block.cid
}

export async function eventsSince (blocks, head) {
  // todo refactor this to be reused instead of copy pasted
  // const getBlock = async (address) => {
  //   const { cid, bytes } = await blocks.get(address)
  //   return createBlock({ cid, bytes, hasher, codec })
  // }

  if (!head.length) {
    throw new Error('no head')
  }

  // Use MemoryBlockstore to store blocks temporarily
  const mblocks = new MemoryBlockstore()
  // Use MultiBlockFetcher to fetch blocks
  blocks = new MultiBlockFetcher(mblocks, blocks)
  const events = new EventFetcher(blocks)

  // Find the common ancestor of the merkle clock head events
  // Get the value of the root from the ancestor event
  // const aevent = await events.get(ancestor)
  // const { root } = aevent.value.data

  // // Load the root node of the ProllyTree with the given root CID
  // const prollyRootNode = await load({ cid: root.cid, get: getBlock, ...opts })

  // Sort the events by their sequence number
  const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(events, head)
  console.log('ancestor sorted', ancestor, sorted.length)

  const putEvents = sorted.filter(({ value: event }) => {
    const {
      data: { type }
    } = event
    return type === 'put'
  }).map(({ value: event }) => {
    const {
      data: { value }
    } = event
    return value
  })
  return putEvents
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
  // todo refactor this to be reused instead of copy pasted
  const getBlock = makeGetBlock(blocks)

  const rootCid = await root(blocks, head)
  const prollyRootNode = await load({ cid: rootCid, get: getBlock, ...opts })

  const { result } = await prollyRootNode.getAllEntries()

  // TODO should we include the key and value
  return result.map(({ key, value }) => ({ key, value }))
}

/**
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to retrieve.
 */
export async function get (blocks, head, key) {
  const get = async (address) => {
    const { cid, bytes } = await blocks.get(address)
    const blk = await createBlock({ cid, bytes, hasher, codec })
    return blk
  }
  const rootCid = await root(blocks, head)
  const prollyRootNode = await load({ cid: rootCid, get, ...opts })
  const result = await prollyRootNode.get(key)
  return result.result
}
