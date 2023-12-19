import { clockChangesSince } from './crdt-helpers'
import { TransactionBlockstore, Transaction } from './transaction'
import type { DocUpdate, BulkResult, ClockHead, BlockFetcher } from './types'
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

  async int_applyHead(newHead: ClockHead, prevHead: ClockHead) {
    const ogHead = sortClockHead(this.head)
    newHead = sortClockHead(newHead)
    await validateBlocks(newHead, this.blocks)
    if (compareClockHeads(ogHead, newHead)) {
      return
    }
    const ogPrev = sortClockHead(prevHead)
    if (compareClockHeads(ogHead, ogPrev)) {
      this.setHead(newHead)
      return
    }
    let head = this.head
    const noLoader = false
    if (!this.blocks) throw new Error('missing blocks')
    await this.blocks.transaction(
      async tblocks => {
        head = await advanceBlocks(newHead, tblocks, head)
        const result = await root(tblocks, head)
        for (const { cid, bytes } of [...result.additions, ...result.removals]) {
          tblocks.putSync(cid, bytes)
        }
        return { head }
      },
      undefined,
      { noLoader }
    )
    this.setHead(head)
  }
}

// Helper functions
function sortClockHead(clockHead: ClockHead) {
  return clockHead.sort((a, b) => a.toString().localeCompare(b.toString()))
}

async function validateBlocks(newHead: ClockHead, blocks: TransactionBlockstore | null) {
  newHead.map(async cid => {
    const got = await blocks!.get(cid)
    if (!got) {
      throw new Error('int_applyHead missing block: ' + cid.toString())
    }
  })
}

function compareClockHeads(head1: ClockHead, head2: ClockHead) {
  return head1.toString() === head2.toString()
}

async function advanceBlocks(newHead: ClockHead, tblocks: BlockFetcher, head: ClockHead) {
  for (const cid of newHead) {
    try {
      head = await advance(tblocks, head, cid)
    } catch (e) {
      console.error('failed to advance', cid.toString(), e)
      continue
    }
  }
  return head
}
