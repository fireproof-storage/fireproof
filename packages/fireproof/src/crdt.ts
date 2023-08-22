import { TransactionBlockstore, IndexBlockstore, Transaction } from './transaction'
import { clockChangesSince, applyBulkUpdateToCrdt, getValueFromCrdt, doCompact } from './crdt-helpers'
import type { DocUpdate, BulkResult, ClockHead, FireproofOptions } from './types'
import type { Index } from './index'
// import { cidListIncludes, uniqueCids } from './loader'
import { advance } from '@alanshaw/pail/clock'
import { root } from '@alanshaw/pail/crdt'

export class CRDTClock {
  head: ClockHead = []

  zoomers: Set<(() => void)> = new Set()
  watchers: Set<((updates: DocUpdate[]) => void)> = new Set()

  blocks: TransactionBlockstore | null = null

  async applyHead(tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] = []) {
    const ogHead = this.head.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead = newHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    if (ogHead.toString() === newHead.toString()) {
      console.log('applyHead noop')
      return
    }
    const ogPrev = prevHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    console.log('applyHead', !!tblocks, { ogHead, newHead, ogPrev })
    if (ogHead.toString() === ogPrev.toString()) {
      this.head = newHead
      this.watchers.forEach((fn) => fn(updates))
      console.log('applyHead done: this.head = newHead')
      return
    }

    const withBlocks = async (tblocks: Transaction| null, fn: (blocks: Transaction) => Promise<BulkResult>) => {
      if (tblocks instanceof Transaction) return await fn(tblocks)
      if (!this.blocks) throw new Error('missing blocks')
      console.log('run own transaction', this.blocks.loader?.carLog.toString())
      return await this.blocks.transaction(fn)
    }

    const { head } = await withBlocks(tblocks, async (tblocks) => {
      console.log('advanving over', newHead.toString())
      // handles case where a sync came in during a bulk update, or somehow concurrent bulk updates happened
      let head = this.head
      for (const cid of newHead) {
        head = await advance(tblocks, this.head, cid)
      }
      const result = await root(tblocks, head)
      result.additions.forEach(a => tblocks.putSync(a.cid, a.bytes))
      return { head }
    })

    this.head = head
    console.log('onZoom', this.head)
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

  async changes(since: ClockHead = []) {
    await this.ready
    return await clockChangesSince(this.blocks, this.clock.head, since)
  }

  async compact() {
    await this.ready
    return await doCompact(this.blocks, this.clock.head)
  }
}
