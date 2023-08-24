import { TransactionBlockstore, IndexBlockstore, Transaction } from './transaction'
import { clockChangesSince, applyBulkUpdateToCrdt, getValueFromCrdt, doCompact } from './crdt-helpers'
import type { DocUpdate, BulkResult, ClockHead, FireproofOptions, ChangesOptions } from './types'
import type { Index } from './index'
import { advance } from '@alanshaw/pail/clock'
import { root } from '@alanshaw/pail/crdt'

export class CRDTClock {
  // todo: keep the clock of remote and local changes separate, merge on read
  // that way we can drop the whole remote if we need to
  // should go with making sure the local clock only references locally available blocks on write
  head: ClockHead = []

  zoomers: Set<(() => void)> = new Set()
  watchers: Set<((updates: DocUpdate[]) => void)> = new Set()

  blocks: TransactionBlockstore | null = null

  setHead(head: ClockHead) {
    this.head = head
  }

  async applyHead(tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] = []) {
    const ogHead = this.head.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead = newHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    if (ogHead.toString() === newHead.toString()) {
      return
    }
    const ogPrev = prevHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    if (ogHead.toString() === ogPrev.toString()) {
      this.setHead(newHead)
      this.watchers.forEach((fn) => fn(updates))
      return
    }

    const withBlocks = async (tblocks: Transaction| null, fn: (blocks: Transaction) => Promise<BulkResult>) => {
      if (tblocks instanceof Transaction) return await fn(tblocks)
      if (!this.blocks) throw new Error('missing blocks')
      return await this.blocks.transaction(fn)
    }

    const { head } = await withBlocks(tblocks, async (tblocks) => {
      // handles case where a sync came in during a bulk update, or somehow concurrent bulk updates happened
      let head = this.head
      for (const cid of newHead) {
        head = await advance(tblocks, this.head, cid)
      }
      const result = await root(tblocks, head)
      result.additions.forEach(a => tblocks.putSync(a.cid, a.bytes))
      return { head }
    })

    this.setHead(head)
    this.zoomers.forEach((fn) => fn())
    this.watchers.forEach((fn) => fn(updates))
  }

  onTick(fn: (updates: DocUpdate[]) => void) {
    this.watchers.add(fn)
  }

  onZoom(fn: () => void) {
    this.zoomers.add(fn)
  }
}

export class CRDT {
  name: string | null
  opts: FireproofOptions = {}
  ready: Promise<void>
  blocks: TransactionBlockstore
  indexBlocks: IndexBlockstore

  indexers: Map<string, Index> = new Map()

  clock: CRDTClock = new CRDTClock()

  constructor(name?: string, opts?: FireproofOptions) {
    this.name = name || null
    this.opts = opts || this.opts
    this.blocks = new TransactionBlockstore(this.name, this.clock, this.opts)
    this.clock.blocks = this.blocks
    this.indexBlocks = new IndexBlockstore(this.name ? this.name + '.idx' : null, this, this.opts)
    this.ready = Promise.all([this.blocks.ready, this.indexBlocks.ready]).then(() => {})
    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex()
      }
    })
  }

  async bulk(updates: DocUpdate[], options?: object): Promise<BulkResult> {
    await this.ready
    return await this.blocks.transaction(async (tblocks): Promise<BulkResult> => {
      const prevHead = [...this.clock.head]
      const { head } = await applyBulkUpdateToCrdt(tblocks, this.clock.head, updates, options)
      await this.clock.applyHead(tblocks, head, prevHead, updates) // we need multi head support here if allowing calls to bulk in parallel
      return { head }
    })
  }

  // async getAll(rootCache: any = null): Promise<{root: any, cids: CIDCounter, clockCIDs: CIDCounter, result: T[]}> {

  async get(key: string) {
    await this.ready
    const result = await getValueFromCrdt(this.blocks, this.clock.head, key)
    if (result.del) return null
    return result
  }

  async changes(since: ClockHead = [], opts: ChangesOptions = {}) {
    await this.ready
    return await clockChangesSince(this.blocks, this.clock.head, since, opts)
  }

  async compact() {
    await this.ready
    return await doCompact(this.blocks, this.clock.head)
  }
}
