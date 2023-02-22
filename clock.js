import { Block, encode, decode } from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as cbor from '@ipld/dag-cbor'

/**
 * @template T
 * @typedef {{ parents: EventLink<T>[], data: T }} EventView
 */

/**
 * @template T
 * @typedef {import('multiformats').BlockView<EventView<T>>} EventBlockView
 */

/**
 * @template T
 * @typedef {import('multiformats').Link<EventView<T>>} EventLink
 */

/**
 * Advance the clock by adding an event.
 *
 * @template T
 * @param {import('./block').BlockFetcher} blocks Block storage.
 * @param {EventLink<T>[]} head The head of the clock.
 * @param {EventLink<T>} event The event to add.
 * @returns {Promise<EventLink<T>[]>} The new head of the clock.
 */
export async function advance (blocks, head, event) {
  /** @type {EventFetcher<T>} */
  const events = new EventFetcher(blocks)
  const headmap = new Map(head.map(cid => [cid.toString(), cid]))

  // Check if the headmap already includes the event, return head if it does
  if (headmap.has(event.toString())) return head

  // Does event contain the clock?
  let changed = false
  for (const cid of head) {
    if (await contains(events, event, cid)) {
      headmap.delete(cid.toString())
      headmap.set(event.toString(), event)
      changed = true
    }
  }

  // If the headmap has been changed, return the new headmap values
  if (changed) {
    return [...headmap.values()]
  }

  // Does clock contain the event?
  for (const p of head) {
    if (await contains(events, p, event)) {
      return head
    }
  }

  // Return the head concatenated with the new event if it passes both checks
  return head.concat(event)
}

/**
 * @template T
 * @implements {EventBlockView<T>}
 */
export class EventBlock extends Block {
  /**
   * @param {object} config
   * @param {EventLink<T>} config.cid
   * @param {Event} config.value
   * @param {Uint8Array} config.bytes
   */
  constructor ({ cid, value, bytes }) {
    // @ts-expect-error
    super({ cid, value, bytes })
  }

  /**
   * @template T
   * @param {T} data
   * @param {EventLink<T>[]} [parents]
   */
  static create (data, parents) {
    return encodeEventBlock({ data, parents: parents ?? [] })
  }
}

/** @template T */
export class EventFetcher {
  /** @param {import('./block').BlockFetcher} blocks */
  constructor (blocks) {
    /** @private */
    this._blocks = blocks
  }

  /**
   * @param {EventLink<T>} link
   * @returns {Promise<EventBlockView<T>>}
   */
  async get (link) {
    const block = await this._blocks.get(link)
    if (!block) throw new Error(`missing block: ${link}`)
    return decodeEventBlock(block.bytes)
  }
}

/**
 * @template T
 * @param {EventView<T>} value
 * @returns {Promise<EventBlockView<T>>}
 */
export async function encodeEventBlock (value) {
  // TODO: sort parents
  const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
  // @ts-expect-error
  return new Block({ cid, value, bytes })
}

/**
 * @template T
 * @param {Uint8Array} bytes
 * @returns {Promise<EventBlockView<T>>}
 */
export async function decodeEventBlock (bytes) {
  const { cid, value } = await decode({ bytes, codec: cbor, hasher: sha256 })
  // @ts-expect-error
  return new Block({ cid, value, bytes })
}

/**
 * Returns true if event "a" contains event "b". Breadth first search.
 * @template T
 * @param {EventFetcher} events
 * @param {EventLink<T>} a
 * @param {EventLink<T>} b
 */
async function contains (events, a, b) {
  if (a.toString() === b.toString()) return true
  const [{ value: aevent }, { value: bevent }] = await Promise.all([events.get(a), events.get(b)])
  const links = [...aevent.parents]
  while (links.length) {
    const link = links.shift()
    if (!link) break
    if (link.toString() === b.toString()) return true
    // if any of b's parents are this link, then b cannot exist in any of the
    // tree below, since that would create a cycle.
    if (bevent.parents.some(p => link.toString() === p.toString())) continue
    const { value: event } = await events.get(link)
    links.push(...event.parents)
  }
  return false
}

/**
 * @template T
 * @param {import('./block').BlockFetcher} blocks Block storage.
 * @param {EventLink<T>[]} head
 * @param {object} [options]
 * @param {(b: EventBlockView<T>) => string} [options.renderNodeLabel]
 */
export async function * vis (blocks, head, options = {}) {
  const renderNodeLabel = options.renderNodeLabel ?? (b => (b.value.data.value))
  const events = new EventFetcher(blocks)
  yield 'digraph clock {'
  yield '  node [shape=point fontname="Courier"]; head;'
  const hevents = await Promise.all(head.map(link => events.get(link)))
  const links = []
  const nodes = new Set()
  for (const e of hevents) {
    nodes.add(e.cid.toString())
    yield `  node [shape=oval fontname="Courier"]; ${e.cid} [label="${renderNodeLabel(e)}"];`
    yield `  head -> ${e.cid};`
    for (const p of e.value.parents) {
      yield `  ${e.cid} -> ${p};`
    }
    links.push(...e.value.parents)
  }
  while (links.length) {
    const link = links.shift()
    if (!link) break
    if (nodes.has(link.toString())) continue
    nodes.add(link.toString())
    const block = await events.get(link)
    yield `  node [shape=oval]; ${link} [label="${renderNodeLabel(block)}" fontname="Courier"];`
    for (const p of block.value.parents) {
      yield `  ${link} -> ${p};`
    }
    links.push(...block.value.parents)
  }
  yield '}'
}
