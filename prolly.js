import * as Clock from './clock.js'
import { EventFetcher, EventBlock } from './clock.js'
import { create, load } from 'prolly-trees/src/db-index.js'
import { nocache as cache } from 'prolly-trees/src/cache.js'
import { bf } from 'prolly-trees/src/utils.js'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'

import { Block, MemoryBlockstore, MultiBlockFetcher } from './block.js'

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
 * } & import('./index').ShardDiff} Result
 */

const opts = { cache, chunker: bf(3), codec, hasher }

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
export async function put (blocks, head, key, value, options) {
  const mblocks = new MemoryBlockstore()
  blocks = new MultiBlockFetcher(mblocks, blocks)

  if (!head.length) {
    // create a new db-index with a list of key,value
    const { get, put } = blocks
    let root
    const additions = []
    for await (const node of create({ get, list: [{ key, value }], ...opts })) {
      const block = await node.block
      await put(block.cid, block.bytes)
      mblocks.putSync(block.cid, block.bytes)
      additions.push(block)
      root = block
    }
    /** @type {EventData} */
    const data = { type: 'put', root, key, value }
    const event = await EventBlock.create(data, head)
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
  const ancestor = await findCommonAncestor(events, head)
  if (!ancestor) throw new Error('failed to find common ancestor event')

  const aevent = await events.get(ancestor)
  let { root } = aevent.value.data

  const sorted = await findSortedEvents(events, head, ancestor)
  const additions = new Map()
  const removals = new Map()

  for (const { value: event } of sorted) {
    if (!['put', 'del'].includes(event.data.type)) {
      throw new Error(`unknown event type: ${event.data.type}`)
    }
    const result = event.data.type === 'put'
      ? await Pail.put(blocks, root, event.data.key, event.data.value)
      : await Pail.del(blocks, root, event.data.key)

    root = result.root
    for (const a of result.additions) {
      mblocks.putSync(a.cid, a.bytes)
      additions.set(a.cid.toString(), a)
    }
    for (const r of result.removals) {
      removals.set(r.cid.toString(), r)
    }
  }

  const result = await Pail.put(blocks, root, key, value, options)
  for (const a of result.additions) {
    mblocks.putSync(a.cid, a.bytes)
    additions.set(a.cid.toString(), a)
  }
  for (const r of result.removals) {
    removals.set(r.cid.toString(), r)
  }

  /** @type {EventData} */
  const data = { type: 'put', root: result.root, key, value }
  const event = await EventBlock.create(data, head)
  mblocks.putSync(event.cid, event.bytes)
  head = await Clock.advance(blocks, head, event.cid)

  return {
    root: result.root,
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
  if (!head.length) return

  const mblocks = new MemoryBlockstore()
  blocks = new MultiBlockFetcher(mblocks, blocks)

  const events = new EventFetcher(blocks)
  const ancestor = await findCommonAncestor(events, head)
  if (!ancestor) throw new Error('failed to find common ancestor event')

  const aevent = await events.get(ancestor)
  let { root } = aevent.value.data

  const sorted = await findSortedEvents(events, head, ancestor)
  for (const { value: event } of sorted) {
    if (!['put', 'del'].includes(event.data.type)) {
      throw new Error(`unknown event type: ${event.data.type}`)
    }
    const result = event.data.type === 'put'
      ? await Pail.put(blocks, root, event.data.key, event.data.value)
      : await Pail.del(blocks, root, event.data.key)

    root = result.root
    for (const a of result.additions) {
      mblocks.putSync(a.cid, a.bytes)
    }
  }

  return root
}

/**
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to retrieve.
 */
export async function get (blocks, head, key) {
  return Pail.get(blocks, await root(blocks, head), key)
}

/**
 * Find the common ancestor event of the passed children. A common ancestor is
 * the first single event in the DAG that _all_ paths from children lead to.
 *
 * @param {import('./clock').EventFetcher} events
 * @param  {import('./clock').EventLink<EventData>[]} children
 */
async function findCommonAncestor (events, children) {
  if (!children.length) return
  const candidates = children.map(c => [c])
  while (true) {
    let changed = false
    for (const c of candidates) {
      const candidate = await findAncestorCandidate(events, c[c.length - 1])
      if (!candidate) continue
      changed = true
      c.push(candidate)
      const ancestor = findCommonString(candidates)
      if (ancestor) return ancestor
    }
    if (!changed) return
  }
}

/**
 * @param {import('./clock').EventFetcher} events
 * @param {import('./clock').EventLink<EventData>} root
 */
async function findAncestorCandidate (events, root) {
  const { value: event } = await events.get(root)
  if (!event.parents.length) return root
  return event.parents.length === 1
    ? event.parents[0]
    : findCommonAncestor(events, event.parents)
}

/**
 * @template {{ toString: () => string }} T
 * @param  {Array<T[]>} arrays
 */
function findCommonString (arrays) {
  arrays = arrays.map(a => [...a])
  for (const arr of arrays) {
    for (const item of arr) {
      let matched = true
      for (const other of arrays) {
        if (arr === other) continue
        matched = other.some(i => String(i) === String(item))
        if (!matched) break
      }
      if (matched) return item
    }
  }
}

/**
 * Find and sort events between the head(s) and the tail.
 * @param {import('./clock').EventFetcher} events
 * @param {import('./clock').EventLink<EventData>[]} head
 * @param {import('./clock').EventLink<EventData>} tail
 */
async function findSortedEvents (events, head, tail) {
  // get weighted events - heavier events happened first
  /** @type {Map<string, { event: import('./clock').EventBlockView<EventData>, weight: number }>} */
  const weights = new Map()
  const all = await Promise.all(head.map(h => findEvents(events, h, tail)))
  for (const arr of all) {
    for (const { event, depth } of arr) {
      const info = weights.get(event.cid.toString())
      if (info) {
        info.weight += depth
      } else {
        weights.set(event.cid.toString(), { event, weight: depth })
      }
    }
  }

  // group events into buckets by weight
  /** @type {Map<number, import('./clock').EventBlockView<EventData>[]>} */
  const buckets = new Map()
  for (const { event, weight } of weights.values()) {
    const bucket = buckets.get(weight)
    if (bucket) {
      bucket.push(event)
    } else {
      buckets.set(weight, [event])
    }
  }

  // sort by weight, and by CID within weight
  return Array.from(buckets)
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, es]) => es.sort((a, b) => String(a.cid) < String(b.cid) ? -1 : 1))
}

/**
 * @param {import('./clock').EventFetcher} events
 * @param {import('./clock').EventLink<EventData>} start
 * @param {import('./clock').EventLink<EventData>} end
 * @returns {Promise<Array<{ event: import('./clock').EventBlockView<EventData>, depth: number }>>}
 */
async function findEvents (events, start, end, depth = 0) {
  const event = await events.get(start)
  const acc = [{ event, depth }]
  const { parents } = event.value
  if (parents.length === 1 && String(parents[0]) === String(end)) return acc
  const rest = await Promise.all(parents.map(p => findEvents(events, p, end, depth + 1)))
  return acc.concat(...rest)
}
