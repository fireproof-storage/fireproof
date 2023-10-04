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
import { TransactionBlockstore } from './transaction'

export class IdxLoader extends Loader {
  // declare ready: Promise<IdxCarHeader>
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
    { indexes }: IndexerResult,
    cars: AnyLink[],
    compact: boolean = false
  ): IdxCarHeader {
    return compact ? { indexes, cars: [], compact: cars } : { indexes, cars, compact: [] }
  }
}
export type IndexerResult = CarCommit & IdxMetaMap

export class DbLoader extends Loader {
  // declare ready: Promise<DbCarHeader> // todo this will be a map of headers by branch name
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
    this.fileStore = new DataStore(this)
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

  async compact(blocks: TransactionBlockstore) {
    await this.ready
    if (this.carLog.length < 2) return
    if (this.awaitingCompact) return
    this.awaitingCompact = true
    const compactingFn = async () => {
      // await this.writing
      if (this.isCompacting) {
        return
      }

      if (this.isWriting) {
        return
      }

      this.isCompacting = true
      const compactHead = this.clock.head
      const compactingResult = await doCompact(blocks, this.clock.head)
      await this.clock.applyHead(null, compactHead, compactHead, null)
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
      await this.clock.applyHead(null, carHeader.head, this.clock.head)
    } else {
      await this.clock.applyHead(null, carHeader.head, [])
    }
  }

  protected makeCarHeader(
    result: BulkResult | FileResult,
    cars: AnyLink[],
    compact: boolean = false
  ): DbCarHeader | FileCarHeader {
    if (isFileResult(result)) {
      const files = [] as AnyLink[]

      for (const [, meta] of Object.entries(result.files)) {
        files.push(meta.cid)
      }
      return { files } as FileCarHeader
    } else {
      const { head } = result
      return compact ? { head, cars: [], compact: cars } : { head, cars, compact: [] }
    }
  }
}

export function isFileResult(
  result: IndexerResult | BulkResult | FileResult
): result is FileResult {
  return result && (result as FileResult).files !== undefined
}
