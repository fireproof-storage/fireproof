import { TransactionBlockstore, IndexBlockstore } from './transaction'
import { clockChangesSince, applyBulkUpdateToCrdt, getValueFromCrdt, doCompact } from './crdt-helpers'
import type { DocUpdate, BulkResult, ClockHead, DbCarHeader, FireproofOptions } from './types'
import type { Index } from './index'

export class CRDTClock {
  head: ClockHead = []

  applyHead(head: ClockHead, merge: boolean = false) {
    if (merge) {
      throw new Error('merge not implemented')
      this.head = [...this.head, ...head]
    } else {
      this.head = head
    }
  }
}

export class CRDT {
  name: string | null
  opts: FireproofOptions = {}
  ready: Promise<void>
  blocks: TransactionBlockstore
  indexBlocks: IndexBlockstore

  indexers: Map<string, Index> = new Map()

  private clock: CRDTClock = new CRDTClock()

  constructor(name?: string, opts?: FireproofOptions) {
    this.name = name || null
    this.opts = opts || this.opts
    this.blocks = new TransactionBlockstore(this.name, this.clock, this.opts)
    this.indexBlocks = new IndexBlockstore(this.name ? this.name + '.idx' : null, this.opts)
    this.ready = Promise.all([this.blocks.ready, this.indexBlocks.ready]).then(() => {})
  }

  async bulk(updates: DocUpdate[], options?: object): Promise<BulkResult> {
    await this.ready
    const tResult = await this.blocks.transaction(async (tblocks): Promise<BulkResult> => {
      const { head } = await applyBulkUpdateToCrdt(tblocks, this.clock.head, updates, options)
      this.clock.applyHead(head) // we need multi head support here if allowing calls to bulk in parallel
      return { head }
    })
    return tResult
  }

  // async getAll(rootCache: any = null): Promise<{root: any, cids: CIDCounter, clockCIDs: CIDCounter, result: T[]}> {

  async get(key: string) {
    await this.ready
    const result = await getValueFromCrdt(this.blocks, this.clock.head, key)
    if (result.del) return null
    return result
  }

  async changes(since: ClockHead = []) {
    await this.ready
    return await clockChangesSince(this.blocks, this.clock.head, since)
  }

  async compact() {
    await this.ready
    return await doCompact(this.blocks, this.clock.head)
  }
}
