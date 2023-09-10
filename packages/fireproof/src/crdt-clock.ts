import { TransactionBlockstore, Transaction } from './transaction'
import type { DocUpdate, BulkResult, ClockHead } from './types'
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
      this.watchers.forEach((fn) => fn(updates))
      return
    }
    const ogPrev = prevHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    if (ogHead.toString() === ogPrev.toString()) {
      this.setHead(newHead)
      this.watchers.forEach((fn) => fn(updates))
      return
    }

    if (updates.length > 0) {
      throw new Error('if we are here we expected to be in a merge, and we should not have updates')
    }

    const withBlocks = async (tblocks: Transaction | null, fn: (blocks: Transaction) => Promise<BulkResult>) => {
      if (tblocks instanceof Transaction) return await fn(tblocks)
      if (!this.blocks) throw new Error('missing blocks')
      return await this.blocks.transaction(fn)
    }

    const { head } = await withBlocks(tblocks, async (tblocks) => {
      // handles case where a sync came in during a bulk update, or somehow concurrent bulk updates happened
      let head = this.head
      for (const cid of newHead) {
        head = await advance(tblocks, head, cid).catch((e) => {
          console.error('failed to advance', e)
          return head
        })
      }
      const result = await root(tblocks, head)
      for (const { cid, bytes } of [...result.additions, ...result.removals]) {
        tblocks.putSync(cid, bytes)
      }
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
