import { MemoryBlockstore } from '@alanshaw/pail/block'
import {
  BlockFetcher,
  AnyBlock,
  AnyLink,
  BulkResult,
  ClockHead,
  CarCommit,
  CarMakeable,
  FireproofOptions,
  TransactionOpts,
  IdxMetaMap,
  DocFragment,
  TransactionMeta
} from './types'

import { Loader } from './loader'
import { CID } from 'multiformats'

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
    fn: (t: Transaction) => Promise<TransactionMeta>,
    opts = { noLoader: false }
  ): Promise<TransactionMeta> {
    const t = new Transaction(this)
    const done: TransactionMeta = await fn(t)
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

  async getFile(car: AnyLink, cid: AnyLink, isPublic = false) {
    await this.ready
    if (!this.loader) throw new Error('loader required to get file')
    const reader = await this.loader.loadFileCar(car, isPublic)
            const block = await reader.get(cid as CID)
            if (!block) throw new Error(`Missing block ${cid.toString()}`)
            return block.bytes
  }


  async commitCompaction(t: Transaction, head: ClockHead) {
    // todo this should use the customizer to get head or indexes
    const did = await this.loader!.commit(t, { head } as unknown as TransactionMeta, { compact: true, noLoader: true })
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
