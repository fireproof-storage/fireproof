import type { CarReader } from '@ipld/car'
import type {
  AnyLink, BulkResult,
  CarCommit, Connection, DbCarHeader, FileCarHeader, FileResult, FireproofOptions, IdxCarHeader,
  IdxMeta, IdxMetaMap
} from './types'
import type { CRDT } from './crdt'
import type { CRDTClock } from './crdt-clock'
import { Loader } from './loader'
import { index } from './index'
import { DataStore } from './store'
import { RemoteDataStore } from './store-remote'

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

  protected makeCarHeader({ indexes }: IndexerResult, cars: AnyLink[], compact: boolean = false): IdxCarHeader {
    return compact ? { indexes, cars: [], compact: cars } : { indexes, cars, compact: [] }
  }
}
export type IndexerResult = CarCommit & IdxMetaMap;

export class DbLoader extends Loader {
  // declare ready: Promise<DbCarHeader> // todo this will be a map of headers by branch name
  static defaultHeader = { cars: [], compact: [], head: [] }
  defaultHeader = DbLoader.defaultHeader

  clock: CRDTClock

  remoteFileStore: DataStore | undefined
  fileStore: DataStore | undefined

  constructor(name: string, clock: CRDTClock, opts?: FireproofOptions) {
    super(name, opts)
    this.clock = clock
  }

  protected async initializeStores(): Promise<void> {
    await super.initializeStores()

    const isBrowser = typeof window !== 'undefined'
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const module = isBrowser ? await require('./store-browser') : await require('./store-fs')
    if (module) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.fileStore = new module.DataStore(this) as DataStore
    } else {
      throw new Error('Failed to initialize stores.')
    }
  }

  connectRemote(connection: Connection) {
    super.connectRemote(connection)
    this.remoteFileStore = new RemoteDataStore(this, connection, 'file')
    return connection
  }

  async loadFileCar(cid: AnyLink): Promise<CarReader> {
    if (!this.fileStore) throw new Error('missing fileStore')
    return await this.storesLoadCar(cid, this.fileStore, this.remoteFileStore)
  }

  protected async _applyCarHeader(carHeader: DbCarHeader, snap = false) {
    if (snap) {
      await this.clock.applyHead(null, carHeader.head, this.clock.head)
    } else {
      await this.clock.applyHead(null, carHeader.head, [])
    }
  }

  protected makeCarHeader(result: BulkResult|FileResult, cars: AnyLink[], compact: boolean = false): DbCarHeader | FileCarHeader {
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

export function isFileResult(result: IndexerResult|BulkResult|FileResult): result is FileResult {
  return result && (result as FileResult).files !== undefined
}
