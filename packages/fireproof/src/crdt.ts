import { TransactionBlockstore, IndexBlockstore } from './transaction'
import { clockChangesSince, applyBulkUpdateToCrdt, getValueFromCrdt, doCompact, readFiles } from './crdt-helpers'
import type { DocUpdate, BulkResult, ClockHead, FireproofOptions, ChangesOptions } from './types'
import type { Index } from './index'
import { CRDTClock } from './crdt-clock'

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
    this.indexBlocks = new IndexBlockstore((this.opts.persistIndexes && this.name) ? this.name + '.idx' : null, this, this.opts)
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
      updates = updates.map(({ key, value, del }) => {
        readFiles(this.blocks, { doc: value })
        return { key, value, del }
      })
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
