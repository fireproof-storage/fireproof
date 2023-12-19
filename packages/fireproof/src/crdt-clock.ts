import { clockChangesSince } from './crdt-helpers'
import { TransactionBlockstore, Transaction } from './transaction'
import type { DocUpdate, BulkResult, ClockHead } from './types'
import { advance } from '@alanshaw/pail/clock'
import { root } from '@alanshaw/pail/crdt'
import { applyHeadQueue, ApplyHeadQueue } from './apply-head-queue'

export class CRDTClock {
  // todo: track local and remote clocks independently, merge on read
  // that way we can drop the whole remote if we need to
  // should go with making sure the local clock only references locally available blocks on write
  head: ClockHead = []

  zoomers: Set<() => void> = new Set()
  watchers: Set<(updates: DocUpdate[]) => void> = new Set()
  emptyWatchers: Set<() => void> = new Set()

  blocks: TransactionBlockstore | null = null

  applyHeadQueue: ApplyHeadQueue

  constructor() {
    this.applyHeadQueue = applyHeadQueue(this.int_applyHead.bind(this))
  }

  setHead(head: ClockHead) {
    this.head = head
  }

  async applyHead(newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null = null) {
    for await (const { updates: updatesAcc, all } of this.applyHeadQueue.push({
      newHead,
      prevHead,
      updates
    })) {
      ;((updatesAcc, all) => {
        void Promise.resolve().then(async () => {
          let intUpdates = updatesAcc
          if (this.watchers.size && !all) {
            const changes = await clockChangesSince(this.blocks!, this.head, prevHead, {})
            intUpdates = changes.result
          }
          this.zoomers.forEach(fn => fn())
          this.notifyWatchers(intUpdates || [])
        })
      })([...updatesAcc], all)
    }
  }

  async int_applyHead(newHead: ClockHead, prevHead: ClockHead) {
    const ogHead = this.head.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead = newHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead.map(async cid => {
      const got = await this.blocks!.get(cid)
      if (!got) {
        throw new Error('int_applyHead missing block: ' + cid.toString())
      }
    })
    if (ogHead.toString() === newHead.toString()) {
      return
    }
    const ogPrev = prevHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    if (ogHead.toString() === ogPrev.toString()) {
      this.setHead(newHead)
      return
    }
    let head = this.head
    // const noLoader = this.head.length === 1 && !updates?.length
    const noLoader = false
    const withBlocks = async (fn: (blocks: Transaction) => Promise<BulkResult>) => {
      if (!this.blocks) throw new Error('missing blocks')
      return await this.blocks.transaction(fn, undefined, { noLoader })
    }
    await withBlocks(async tblocks => {
      for (const cid of newHead) {
        try {
          head = await advance(tblocks, head, cid)
        } catch (e) {
          console.error('failed to advance', cid.toString(), e)
          continue
        }
      }
      const result = await root(tblocks, head)
      for (const { cid, bytes } of [...result.additions, ...result.removals]) {
        tblocks.putSync(cid, bytes)
      }
      return { head }
    })
    this.setHead(head)
  }

  notifyWatchers(updates: DocUpdate[]) {
    this.emptyWatchers.forEach(fn => fn())
    this.watchers.forEach(fn => fn(updates || []))
  }

  onTick(fn: (updates: DocUpdate[]) => void) {
    this.watchers.add(fn)
  }

  onTock(fn: () => void) {
    this.emptyWatchers.add(fn)
  }

  onZoom(fn: () => void) {
    this.zoomers.add(fn)
  }
}
