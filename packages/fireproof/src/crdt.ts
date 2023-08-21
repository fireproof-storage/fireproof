import { TransactionBlockstore, IndexBlockstore } from './transaction'
import { clockChangesSince, applyBulkUpdateToCrdt, getValueFromCrdt, doCompact } from './crdt-helpers'
import type { DocUpdate, BulkResult, ClockHead, DbCarHeader, FireproofOptions } from './types'
import type { Index } from './index'

export class CRDTClock {
  head: ClockHead = []

  zoomers: Set<(() => void)> = new Set()
  watchers: Set<((updates: DocUpdate[]) => void)> = new Set()

  applyHead(newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] = []) {
    const keepFromPrevHead = this.head.filter((link) => !prevHead.includes(link))
    this.head = [...new Set([...keepFromPrevHead, ...newHead])].sort((a, b) => a.toString().localeCompare(b.toString()))
    if (keepFromPrevHead.length !== 0 && this.head.length !== 0) {
      this.zoomers.forEach((fn) => fn())
    }
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
    this.indexBlocks = new IndexBlockstore(this.name ? this.name + '.idx' : null, this.opts)
    this.ready = Promise.all([this.blocks.ready, this.indexBlocks.ready]).then(() => {})
    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex()
      }
    })
  }

  async bulk(updates: DocUpdate[], options?: object): Promise<BulkResult> {
    await this.ready
    const tResult = await this.blocks.transaction(async (tblocks): Promise<BulkResult> => {
      const beforeHead = [...this.clock.head]
      const { head } = await applyBulkUpdateToCrdt(tblocks, this.clock.head, updates, options)
      this.clock.applyHead(head, beforeHead, updates) // we need multi head support here if allowing calls to bulk in parallel
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
