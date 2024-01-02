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
import { index } from './index'
import type { DataStore as AbstractDataStore } from './store'

import { DataStore } from './store-browser'
import { doCompact } from './crdt-helpers'
import { FireproofBlockstore } from './transaction'

export class IdxLoader extends Loader {
  crdt: CRDT

  static defaultHeader = { cars: [], compact: [], indexes: new Map() as Map<string, IdxMeta> }
  defaultHeader = IdxLoader.defaultHeader

  constructor(name: string, crdt: CRDT, opts?: FireproofOptions) {
    super(name, opts)
    this.crdt = crdt
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async _applyCarHeader(header: IdxCarHeader) {
    for (const [name, idx] of Object.entries(header.indexes)) {
      index({ _crdt: this.crdt }, name, undefined, idx as IdxMeta)
    }
  }

  protected makeCarHeader(
    result: IndexerResult,
    cars: AnyLink[],
    compact: boolean = false
  ): IdxCarHeader {
    const { indexes } = result
    const carHeader = super.makeCarHeader(result, cars, compact)
    return { ...carHeader, indexes }
  }
}
export type IndexerResult = CarCommit & IdxMetaMap

export class DbLoader extends Loader {
  static defaultHeader = { cars: [], compact: [], head: [] }
  defaultHeader = DbLoader.defaultHeader

  clock: CRDTClock
  awaitingCompact = false
  compacting: Promise<AnyLink | void> = Promise.resolve()
  writing: Promise<BulkResult | void> = Promise.resolve()

  remoteFileStore: AbstractDataStore | undefined
  fileStore: DataStore

  constructor(name: string, clock: CRDTClock, opts?: FireproofOptions) {
    super(name, opts)
    this.fileStore = new DataStore(this.name)
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

  async loadFileCar(cid: AnyLink, isPublic = false): Promise<CarReader> {
    return await this.storesLoadCar(cid, this.fileStore, this.remoteFileStore, isPublic)
  }

  protected async _applyCarHeader(carHeader: DbCarHeader, snap = false) {
    if (snap) {
      await this.clock.applyHead(carHeader.head, this.clock.head)
    } else {
      await this.clock.applyHead(carHeader.head, [])
    }
  }

  protected makeCarHeader(
    result: BulkResult,
    cars: AnyLink[],
    compact: boolean = false
  ): DbCarHeader {
    const { head } = result
    const carHeader = super.makeCarHeader(result, cars, compact)
    return { ...carHeader, head }
  }
}
