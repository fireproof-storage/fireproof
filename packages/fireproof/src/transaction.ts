import { MemoryBlockstore } from '@alanshaw/pail/block'
import {
  BlockFetcher,
  AnyBlock,
  AnyLink,
  BulkResult,
  ClockHead,
  IdxMeta,
  CarCommit,
  CarMakeable,
  FireproofOptions,
  TransactionOpts,
  IdxMetaMap
} from './types'
import { DbLoader, IdxLoader } from './loaders'
// import { CID } from 'multiformats'
import { CRDT } from './crdt'
import { CRDTClock } from './crdt-clock'
import { Loader } from './loader'

export class Transaction extends MemoryBlockstore implements CarMakeable {
  parent: FireproofBlockstore
  constructor(parent: FireproofBlockstore) {
    super()
    parent.transactions.add(this)
    this.parent = parent
  }

  async get(cid: AnyLink): Promise<AnyBlock | undefined> {
    return this.parent.get(cid)
  }

  async superGet(cid: AnyLink): Promise<AnyBlock | undefined> {
    return super.get(cid)
  }
}

// this type can go away
export type LoaderFetcher = BlockFetcher & { loader: Loader | null }

const CarTransaction = Transaction

export { CarTransaction }

export class FireproofBlockstore implements LoaderFetcher {
  ready: Promise<void>
  name: string | null = null

  loader: Loader | null = null
  opts: FireproofOptions = {}
  tOpts: TransactionOpts

  transactions: Set<Transaction> = new Set()

  constructor(name: string | null, tOpts: TransactionOpts, opts?: FireproofOptions) {
    this.opts = opts || this.opts
    this.tOpts = tOpts
    if (name) {
      this.name = name
      this.loader = new Loader(name, this.tOpts, this.opts)
      this.ready = this.loader.ready
    } else {
      this.ready = Promise.resolve() // Promise.reject(new Error('implement default header in subclass'))
    }
  }

  async transaction(
    fn: (t: Transaction) => Promise<BulkResult | IdxMetaMap>,
    opts = { noLoader: false }
  ): Promise<BulkResultCar | IdxMetaCar> {
    const t = new Transaction(this)
    const done: BulkResult | IdxMetaMap = await fn(t)
    if (this.loader) {
      const car = await this.loader.commit(t, done, opts)
      if (car) return { ...done, car }
      throw new Error('failed to commit car')
    }
    return done
  }

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
    const did = await this.loader!.commit(t, { head }, { compact: true, noLoader: true })
    // todo uncomment this under load generation
    // this.transactions.clear()
    // this.transactions.add(t)
    return did
  }

  async *entries(): AsyncIterableIterator<AnyBlock> {
    const seen: Set<string> = new Set()
    for (const t of this.transactions) {
      for await (const blk of t.entries()) {
        if (seen.has(blk.cid.toString())) continue
        seen.add(blk.cid.toString())
        yield blk
      }
    }
  }
}

// export class IndexBlockstore extends FireproofBlockstore {
//   constructor(name: string | null, crdt: CRDT, opts?: FireproofOptions) {
//     if (name) {
//       super(name, new IdxLoader(name, crdt, opts), opts)
//     } else {
//       super(null)
//     }
//   }
//   async transaction(
//     fn: (t: Transaction) => Promise<IdxMeta>,
//     indexes: Map<string, IdxMeta>,
//     opts = { noLoader: false }
//   ): Promise<IdxMetaCar> {
//     const t = new Transaction(this)
//     const done: IdxMeta = await fn(t)
//     const { car, done: result } = await (async (t, done) => {
//       indexes.set(done.name, done)
//       const car = await this.loader?.commit(t, { indexes }, opts)
//       return { car, done }
//     })(t, done)
//     return car ? { ...result, car } : result
//   }
// }

// export class TransactionBlockstore extends FireproofBlockstore {
//   constructor(name: string | null, clock: CRDTClock, opts?: FireproofOptions) {
//     // todo this will be a map of headers by branch name
//     if (name) {
//       super(name, new DbLoader(name, clock, opts), opts)
//     } else {
//       super(null)
//     }
//   }

//   // async transaction(
//   //   fn: (t: Transaction) => Promise<BulkResult>,
//   //   _indexes?: undefined,
//   //   opts = { noLoader: false }
//   // ): Promise<BulkResultCar> {
//   //   const t = new Transaction(this)
//   //   const done: BulkResult = await fn(t)
//   //   const { car, done: result } = await (async (t, done) => {
//   //     const car = await this.loader?.commit(t, done, opts)
//   //     return { car, done }
//   //   })(t, done)
//   //   return car ? { ...result, car } : result
//   // }

//   // version that uses transactionCustomizer
//   // async transaction(opts = { noLoader: false }): Promise<BulkResultCar | IdxMetaCar> {
//   //   const t = new Transaction(this);
//   //   const done: BulkResult | IdxMeta = await this.transactionCustomizer(t);
//   //   const { car, done: result } = await (async (t, done) => {
//   //     const car = await this.loader?.commit(t, done, opts)
//   //     return { car, done }
//   //   })(t, done)
//   //   return car ? { ...result, car } : result
//   // }
// }

type IdxMetaCar = IdxMetaMap & CarCommit
type BulkResultCar = BulkResult & CarCommit

export class LoggingFetcher implements LoaderFetcher {
  blocks: FireproofBlockstore
  loader: Loader | null = null
  loggedBlocks: Transaction

  constructor(blocks: FireproofBlockstore) {
    this.blocks = blocks
    this.loader = blocks.loader
    this.loggedBlocks = new Transaction(blocks)
  }

  async get(cid: AnyLink) {
    const block = await this.blocks.get(cid)
    if (block) this.loggedBlocks.putSync(cid, block.bytes)
    return block
  }
}
