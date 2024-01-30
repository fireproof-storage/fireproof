import { MemoryBlockstore } from '@web3-storage/pail/block'
// todo get these from multiformats?
import { BlockFetcher as BlockFetcherAPI } from '@web3-storage/pail/api'

import { AnyAnyBlock, AnyAnyLink, AnyBlock, AnyLink, CarMakeable, DbMeta, TransactionMeta as TM } from './types'

import { Loader } from './loader'
import type { CID } from 'multiformats'
import { CryptoOpts, StoreOpts } from './types'

export type BlockFetcher = BlockFetcherAPI
// = { get: (link: AnyLink) => Promise<AnyBlock | undefined> }

export type TransactionMeta = TM

export class CarTransaction extends MemoryBlockstore implements CarMakeable {
  parent: EncryptedBlockstore
  constructor(parent: EncryptedBlockstore) {
    super()
    parent.transactions.add(this)
    this.parent = parent
  }

  async get(cid: AnyAnyLink): Promise<AnyAnyBlock | undefined> {
    return this.parent.get(cid)
  }

  async superGet(cid: AnyLink): Promise<AnyBlock | undefined> {
    return super.get(cid)
  }
}

export class EncryptedBlockstore implements BlockFetcher {
  ready: Promise<void>
  name: string | null = null
  loader: Loader | null = null
  compacting = false
  ebOpts: BlockstoreOpts
  transactions: Set<CarTransaction> = new Set()

  constructor(ebOpts: BlockstoreOpts) {
    this.ebOpts = ebOpts
    const { name } = ebOpts
    if (name) {
      this.name = name
      this.loader = new Loader(name, this.ebOpts)
      this.ready = this.loader.ready
    } else {
      this.ready = Promise.resolve()
    }
  }

  async transaction(
    fn: (t: CarTransaction) => Promise<TransactionMeta>,
    opts = { noLoader: false }
  ): Promise<TransactionMeta> {
    const t = new CarTransaction(this)
    const done: TransactionMeta = await fn(t)
    if (this.loader) {
      const car = await this.loader.commit(t, done, opts)
      if (this.ebOpts.autoCompact && this.loader.carLog.length > this.ebOpts.autoCompact) {
        setTimeout(() => void this.compact(), 10)
      }
      if (car) {
        this.transactions.delete(t)
        return { ...done, car }
      }
      throw new Error('failed to commit car')
    }
    return done
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async put() {
    throw new Error('use a transaction to put')
  }

  async get(cid: AnyAnyLink): Promise<AnyAnyBlock | undefined> {
    if (!cid) throw new Error('required cid')
    for (const f of this.transactions) {
      // if (Math.random() < 0.001) console.log('get', cid.toString(), this.transactions.size)
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
    // @ts-ignore -- TODO: TypeScript does not like this casting
    const block = await reader.get(cid as CID)
    if (!block) throw new Error(`Missing block ${cid.toString()}`)
    return block.bytes
  }

  async compact() {
    await this.ready
    if (!this.loader) throw new Error('loader required to compact')
    if (this.loader.carLog.length < 2) return
    const compactFn = this.ebOpts.compact // todo add default compaction function
    if (!compactFn || this.compacting) return
    const blockLog = new CompactionFetcher(this)
    this.compacting = true
    const meta = await compactFn(blockLog)
    await this.loader!.commit(blockLog.loggedBlocks, meta, {
      compact: true,
      noLoader: true
    })
    this.compacting = false
  }

  async *entries(): AsyncIterableIterator<AnyBlock> {
    const seen: Set<string> = new Set()
    if (this.loader) {
      for await (const blk of this.loader.entries()) {
        // if (seen.has(blk.cid.toString())) continue
        // seen.add(blk.cid.toString())
        yield blk
      }
    } else {
      for (const t of this.transactions) {
        for await (const blk of t.entries()) {
          if (seen.has(blk.cid.toString())) continue
          seen.add(blk.cid.toString())
          yield blk
        }
      }
    }
  }
}

export class CompactionFetcher implements BlockFetcher {
  blockstore: EncryptedBlockstore
  // loader: Loader | null = null
  loggedBlocks: CarTransaction

  constructor(blocks: EncryptedBlockstore) {
    this.blockstore = blocks
    // this.loader = blocks.loader
    this.loggedBlocks = new CarTransaction(blocks)
  }

  async get(cid: AnyLink) {
    const block = await this.blockstore.get(cid)
    if (block) this.loggedBlocks.putSync(cid, block.bytes)
    return block
  }
}

export type CompactFn = (blocks: CompactionFetcher) => Promise<TransactionMeta>

export type BlockstoreOpts = {
  applyMeta: (meta: TransactionMeta, snap?: boolean) => Promise<void>
  compact?: CompactFn
  autoCompact?: number
  crypto: CryptoOpts
  store: StoreOpts
  public?: boolean
  meta?: DbMeta
  name?: string
}
