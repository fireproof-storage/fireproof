import { clockChangesSince } from './crdt-helpers'
// import { uniqueCids } from './loader'
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
  emptyWatchers: Set<(() => void)> = new Set()

  blocks: TransactionBlockstore | null = null

  applyHeadQueue: ApplyHeadQueue;

  constructor() {
    this.applyHeadQueue = applyHeadQueue(this.int_applyHead.bind(this));
  }

  setHead(head: ClockHead) {
    this.head = head
  }

  async applyHead(tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null = null) {
    const taskId = Math.random().toString().slice(2, 8)
    // console.log('applyHead', taskId, updates?.length, 'og', this.head.sort((a, b) => a.toString().localeCompare(b.toString())).toString(), 'new', newHead.toString(), 'prev', prevHead.toString())
    for await (const { updates: updatesAcc, all } of this.applyHeadQueue.push({ id: taskId, tblocks, newHead, prevHead, updates })) {
      Promise.resolve().then(async () => {
        if (this.watchers.size && !all) {
          const changes = await clockChangesSince(this.blocks!, this.head, prevHead, {})
          updates = changes.result
        } else {
          updates = updatesAcc
        }
        this.zoomers.forEach((fn) => fn())
        this.notifyWatchers(updates || [])
      });
    }
  }
  async int_applyHead(taskId: string, tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null = null) {
    const ogHead = this.head.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead = newHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    newHead.map((cid) => {
      const got = this.blocks!.get(cid)
      if (!got) {
        throw new Error('int_applyHead missing block: '+ cid.toString())
      }
    })
    if (ogHead.toString() === newHead.toString()) {
      this.notifyWatchers(updates || [])
      return
    }
    const ogPrev = prevHead.sort((a, b) => a.toString().localeCompare(b.toString()))
    if (ogHead.toString() === ogPrev.toString()) {
      this.setHead(newHead)
      this.notifyWatchers(updates || [])
      return
    }
    let head = this.head
    // const noLoader = this.head.length === 1 && !updates?.length
    const noLoader = false
    const withBlocks = async (tblocks: Transaction | null, fn: (blocks: Transaction) => Promise<BulkResult>) => {
      if (!this.blocks) throw new Error('missing blocks')
      return await this.blocks.transaction(fn, undefined, { noLoader })
    }
    await withBlocks(tblocks, async (tblocks) => {
      for (const cid of newHead) {
        try {
          head = await advance(tblocks, head, cid)
        } catch (e) {
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
    this.emptyWatchers.forEach((fn) => fn())
    this.watchers.forEach((fn) => fn(updates || []))
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

