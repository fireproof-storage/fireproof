import { clockChangesSince } from './crdt-helpers'
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

  async applyHead(tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null = null) {
    const ogHead = this.head.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead = newHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    console.log('applyHead', updates?.length,
      'og', ogHead.toString(), 'new', newHead.toString(), 'prev', prevHead.toString())
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
    console.log('applyHead...')
    const withBlocks = async (tblocks: Transaction | null, fn: (blocks: Transaction) => Promise<BulkResult>) => {
      if (tblocks instanceof Transaction) return await fn(tblocks)
      if (!this.blocks) throw new Error('missing blocks')
      return await this.blocks.transaction(fn, undefined, { noLoader: true })
    }

    const { head } = await withBlocks(tblocks, async (tblocks) => {
      let head = this.head
      for (const cid of newHead) {
        console.log('applyHead', 'advance', cid.toString())
        head = await advance(tblocks, head, cid)
        console.log('applyHead', 'advanced', head.toString())
      }
      const result = await root(tblocks, head)
      for (const { cid, bytes } of [...result.additions, ...result.removals]) {
        tblocks.putSync(cid, bytes)
      }
      return { head }
    })
    console.log('applyHead!', 'new', head.toString(), 'og', ogHead.toString())

    if (this.watchers.size && !updates) {
      const changes = await clockChangesSince(this.blocks!, head, prevHead, {})
      updates = changes.result
    }

    this.setHead(head)
    this.zoomers.forEach((fn) => fn())
    this.watchers.forEach((fn) => fn(updates || []))
  }

  onTick(fn: (updates: DocUpdate[]) => void) {
    this.watchers.add(fn)
  }

  onZoom(fn: () => void) {
    this.zoomers.add(fn)
  }
}
