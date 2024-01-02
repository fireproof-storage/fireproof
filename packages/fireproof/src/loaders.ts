import type { CarReader } from '@ipld/car'
import type {
  AnyLink,
  BulkResult,
  CarCommit,
  DbCarHeader,
  FileCarHeader,
  FileResult,
  FireproofOptions,
  IdxCarHeader,
  IdxMeta,
  IdxMetaMap
} from './types'
import type { CRDT } from './crdt'
import type { CRDTClock } from './crdt-clock'
import { Loader, Connection } from './loader'
import type { DataStore as AbstractDataStore } from './store'

import { DataStore } from './store-browser'
import { doCompact } from './crdt-helpers'
import { FireproofBlockstore } from './transaction'

export type IndexerResult = CarCommit & IdxMetaMap

export class DbLoader extends Loader {
  static defaultHeader = { cars: [], compact: [], head: [] }
  defaultHeader = DbLoader.defaultHeader

  clock: CRDTClock
  awaitingCompact = false
  compacting: Promise<AnyLink | void> = Promise.resolve()
  writing: Promise<BulkResult | void> = Promise.resolve()


  constructor(name: string, clock: CRDTClock, opts?: FireproofOptions) {
    super(name, opts)
    this.clock = clock
  }

  async _readyForMerge() {
    // await this.ready
    await this.compacting
  }

  async _setWaitForWrite(_writingFn: () => Promise<any>) {
    const wr = this.writing
    this.writing = wr.then(async () => {
      await _writingFn()
      return wr
    })
    return this.writing.then(() => {})
  }

  async compact(blocks: FireproofBlockstore) {
    await this.ready
    if (this.carLog.length < 2) return
    if (this.awaitingCompact) return
    this.awaitingCompact = true
    const compactingFn = async () => {
      if (this.isCompacting) {
        return
      }

      if (this.isWriting) {
        return
      }

      this.isCompacting = true

      // these three lines are different for indexes and dbs
      // file compaction would be different than both because you crawl the db to determine which files are still referenced
      const compactHead = this.clock.head
      const compactingResult = await doCompact(blocks, this.clock.head)
      await this.clock.applyHead(compactHead, compactHead, null)

      return compactingResult
    }
    this.compacting = this._setWaitForWrite(compactingFn)
    this.compacting.finally(() => {
      this.isCompacting = false
      this.awaitingCompact = false
    })
    await this.compacting
  }


}
