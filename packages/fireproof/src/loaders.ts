import type {
  AnyLink, BulkResult,
  CarCommit, DbCarHeader, FileCarHeader, FileResult, FireproofOptions, IdxCarHeader,
  IdxMeta, IdxMetaMap
} from './types'
import type { CRDT } from './crdt'
import type { CRDTClock } from './crdt-clock'
import { Loader } from './loader'
import { index } from './index'

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

  constructor(name: string, clock: CRDTClock, opts?: FireproofOptions) {
    super(name, opts)
    this.clock = clock
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
      throw new Error('DbLoader.makeCarHeader: not implemented for FileResult')
    } else {
      const { head } = result
      return compact ? { head, cars: [], compact: cars } : { head, cars, compact: [] }
    }
  }
}

function isFileResult(result: BulkResult|FileResult): result is FileResult {
  return result && (result as FileResult).root !== undefined
}
