import { MemoryBlockstore } from '@alanshaw/pail/block'
import {
  BlockFetcher, AnyBlock, AnyLink, BulkResult, ClockHead,
  IdxMeta, CarCommit, CarMakeable, FireproofOptions
} from './types'
import { DbLoader, IdxLoader } from './loaders'
// import { CID } from 'multiformats'
import { CRDT } from './crdt'
import { CRDTClock } from './crdt-clock'

export class Transaction extends MemoryBlockstore implements CarMakeable {
  parent: BlockFetcher
  constructor(parent: BlockFetcher) {
    super()
    this.parent = parent
  }

  async get(cid: AnyLink): Promise<AnyBlock | undefined> {
    return this.parent.get(cid)
  }

  async superGet(cid: AnyLink): Promise<AnyBlock | undefined> {
    return super.get(cid)
  }
}

abstract class FireproofBlockstore implements BlockFetcher {
  ready: Promise<void>
  name: string | null = null

  loader: DbLoader | IdxLoader | null = null
  opts: FireproofOptions = {}

  transactions: Set<Transaction> = new Set()

  constructor(name: string | null, loader?: DbLoader | IdxLoader, opts?: FireproofOptions) {
    this.opts = opts || this.opts
    if (name) {
      this.name = name
      if (!loader) throw new Error('missing loader')
      this.loader = loader
      this.ready = this.loader.ready
    } else {
      this.ready = Promise.resolve() // Promise.reject(new Error('implement default header in subclass'))
    }
  }

  abstract transaction(fn: (t: Transaction) => Promise<IdxMeta | BulkResult>, indexes?: Map<string, IdxMeta>, opts?: { noLoader: boolean}): Promise<BulkResultCar | IdxMetaCar>

  // eslint-disable-next-line @typescript-eslint/require-await
  async put() {
    throw new Error('use a transaction to put')
  }

  async get(cid: AnyLink): Promise<AnyBlock | undefined> {
    if (!cid) throw new Error('required cid')
    for (const f of this.transactions) {
      const v = await f.superGet(cid)
      if (v) return v
    }
    if (!this.loader) return
    return await this.loader.getBlock(cid)
  }

  async commitCompaction(t: Transaction, head: ClockHead) {
    this.transactions.clear()
    this.transactions.add(t)
    return await this.loader?.commit(t, { head }, true)
  }

  async * entries(): AsyncIterableIterator<AnyBlock> {
    const seen: Set<string> = new Set()
    for (const t of this.transactions) {
      for await (const blk of t.entries()) {
        if (seen.has(blk.cid.toString())) continue
        seen.add(blk.cid.toString())
        yield blk
      }
    }
  }

  protected async executeTransaction<T, R>(
    fn: (t: Transaction) => Promise<T>,
    commitHandler: (t: Transaction, done: T) => Promise<{ car?: AnyLink, done: R }>
  ): Promise<R> {
    const t = new Transaction(this)
    this.transactions.add(t)
    const done: T = await fn(t)
    const { car, done: result } = await commitHandler(t, done)
    // this.transactions.delete(t)
    return car ? { ...result, car } : result
  }
}

export class IndexBlockstore extends FireproofBlockstore {
  // declare ready: Promise<IdxCarHeader>

  constructor(name: string | null, crdt: CRDT, opts?: FireproofOptions) {
    if (name) {
      super(name, new IdxLoader(name, crdt, opts), opts)
    } else {
      super(null)
      // this.ready = Promise.resolve(IdxLoader.defaultHeader as IdxCarHeader)
    }
  }

  async transaction(fn: (t: Transaction) => Promise<IdxMeta>, indexes: Map<string, IdxMeta>): Promise<IdxMetaCar> {
    return this.executeTransaction(fn, async (t, done) => {
      indexes.set(done.name, done)
      const car = await this.loader?.commit(t, { indexes })
      return { car, done }
    })
  }
}

export class TransactionBlockstore extends FireproofBlockstore {
  // declare ready: Promise<DbCarHeader>

  constructor(name: string | null, clock: CRDTClock, opts?: FireproofOptions) {
    // todo this will be a map of headers by branch name
    if (name) {
      super(name, new DbLoader(name, clock, opts), opts)
    } else {
      super(null)
      // this.ready = Promise.resolve(DbLoader.defaultHeader as DbCarHeader)
    }
  }

  async transaction(fn: (t: Transaction) => Promise<BulkResult>, _indexes?: undefined, opts = { noLoader: false }): Promise<BulkResultCar> {
    return this.executeTransaction(fn, async (t, done) => {
      if (opts.noLoader) return { done }
      const car = await this.loader?.commit(t, done)
      return { car, done }
    })
  }
}

type IdxMetaCar = IdxMeta & CarCommit
type BulkResultCar = BulkResult & CarCommit
