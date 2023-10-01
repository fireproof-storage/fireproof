import { clockChangesSince } from './crdt-helpers'
import { uniqueCids } from './loader'
import { TransactionBlockstore, Transaction } from './transaction'
import type { DocUpdate, BulkResult, ClockHead } from './types'
import { advance } from '@alanshaw/pail/clock'
import { root } from '@alanshaw/pail/crdt'
import { applyHeadQueue, ApplyHeadQueue } from './apply-head-queue';

export class CRDTClock {
  // todo: keep the clock of remote and local changes separate, merge on read
  // that way we can drop the whole remote if we need to
  // should go with making sure the local clock only references locally available blocks on write
  head: ClockHead = []

  zoomers: Set<(() => void)> = new Set()
  watchers: Set<((updates: DocUpdate[]) => void)> = new Set()

  blocks: TransactionBlockstore | null = null

  applyHeadQueue: ApplyHeadQueue;

  constructor() {
    this.applyHeadQueue = applyHeadQueue(this.int_applyHead.bind(this));
  }


  setHead(head: ClockHead) {
    this.head = head
  }

  async applyHead(tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null = null) {
    console.log('applyHead', updates?.length, 'new', newHead.toString(), 'prev', prevHead.toString())
    for await (const { updates: updatesAcc, all } of this.applyHeadQueue.push({ tblocks, newHead, prevHead, updates })) {
      if (this.watchers.size && !all) {
        const changes = await clockChangesSince(this.blocks!, this.head, prevHead, {})
        updates = changes.result
      } else {
        updates = updatesAcc
      }
      this.zoomers.forEach((fn) => fn())
      this.watchers.forEach((fn) => fn(updates || []))
    }
  }
  async int_applyHead(tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null = null) {
    const ogHead = this.head.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead = newHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    console.log('applyHead int', updates?.length, 'og', ogHead.toString(), 'new', newHead.toString(), 'prev', prevHead.toString())
    if (ogHead.toString() === newHead.toString()) {
      this.watchers.forEach((fn) => fn(updates || []))
      return
    }
    const ogPrev = prevHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    if (ogHead.toString() === ogPrev.toString()) {
      this.setHead(newHead)
      this.watchers.forEach((fn) => fn(updates || []))
      return
    }
    let head = this.head
    const withBlocks = async (tblocks: Transaction | null, fn: (blocks: Transaction) => Promise<BulkResult>) => {
      if (tblocks instanceof Transaction) return await fn(tblocks)
      if (!this.blocks) throw new Error('missing blocks')
      return await this.blocks.transaction(fn, undefined, { noLoader: true })
    }
    await withBlocks(tblocks, async (tblocks) => {
      for (const cid of newHead) {
        head = await advance(tblocks, head, cid)
      }
      // const result = await root(tblocks, head)
      // for (const { cid, bytes } of [...result.additions, ...result.removals]) {
      //   tblocks.putSync(cid, bytes)
      // }
      return { head }
    })
    this.setHead(head)
  }

  onTick(fn: (updates: DocUpdate[]) => void) {
    this.watchers.add(fn)
  }

  onZoom(fn: () => void) {
    this.zoomers.add(fn)
  }
}

