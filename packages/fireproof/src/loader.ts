import pLimit from 'p-limit'
import { CarReader } from '@ipld/car'
import { CID } from 'multiformats'

import type {
  AnyBlock,
  AnyCarHeader,
  AnyLink,
  CarHeader,
  CarLoaderHeader,
  CommitOpts,
  DbMeta,
  FileCarHeader,
  FileResult,
  FireproofOptions,
  TransactionMeta,
  TransactionOpts
} from './types'

import { encodeCarFile, encodeCarHeader, parseCarFile } from './loader-helpers'
import { decodeEncryptedCar, encryptedEncodeCarFile } from './encrypt-helpers'
import { getCrypto, randomBytes } from './crypto-web'
import { DataStore, MetaStore, RemoteWAL } from './store-browser'
import { DataStore as AbstractDataStore, MetaStore as AbstractMetaStore } from './store'
import { CompactFn, LoggingFetcher, type Transaction } from './transaction'
import { CommitQueue } from './commit-queue'

// ts-unused-exports:disable-next-line
export function cidListIncludes(list: AnyLink[], cid: AnyLink) {
  return list.some(c => c.equals(cid))
}
export function uniqueCids(list: AnyLink[], remove: Set<string> = new Set()): AnyLink[] {
  const byString = new Map<string, AnyLink>()
  for (const cid of list) {
    if (remove.has(cid.toString())) continue
    byString.set(cid.toString(), cid)
  }
  return [...byString.values()]
}

// ts-unused-exports:disable-next-line
export function toHexString(byteArray: Uint8Array) {
  return Array.from(byteArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

abstract class AbstractRemoteMetaStore extends AbstractMetaStore {
  abstract handleByteHeads(byteHeads: Uint8Array[], branch?: string): Promise<DbMeta[]>
}

export class Loader {
  name: string
  opts: FireproofOptions = {}
  tOpts: TransactionOpts
  commitQueue = new CommitQueue<AnyLink>()
  isCompacting = false
  isWriting = false
  remoteMetaStore: AbstractRemoteMetaStore | undefined
  remoteCarStore: AbstractDataStore | undefined
  fileStore: DataStore
  remoteFileStore: AbstractDataStore | undefined
  remoteWAL: RemoteWAL
  metaStore: MetaStore
  carStore: DataStore
  carLog: AnyLink[] = []
  carReaders: Map<string, Promise<CarReader>> = new Map()
  ready: Promise<void>
  key: string | undefined
  keyId: string | undefined
  seenCompacted: Set<string> = new Set()

  private getBlockCache: Map<string, AnyBlock> = new Map()
  private seenMeta: Set<string> = new Set()

  constructor(name: string, tOpts: TransactionOpts, opts?: FireproofOptions) {
    this.name = name
    this.tOpts = tOpts
    this.opts = opts || this.opts
    this.metaStore = new MetaStore(this.name)
    this.carStore = new DataStore(this.name)
    this.fileStore = new DataStore(this.name)
    this.remoteWAL = new RemoteWAL(this)
    this.ready = Promise.resolve().then(async () => {
      if (!this.metaStore || !this.carStore || !this.remoteWAL)
        throw new Error('stores not initialized')
      const metas = this.opts.meta ? [this.opts.meta] : await this.metaStore.load('main')
      if (metas) {
        await this.handleDbMetasFromStore(metas)
      }
    })
  }

  // async snapToCar(carCid: AnyLink | string) {
  //   await this.ready
  //   if (typeof carCid === 'string') {
  //     carCid = CID.parse(carCid)
  //   }
  //   const carHeader = await this.loadCarHeaderFromMeta({ car: carCid, key: this.key || null })
  //   this.carLog = [carCid, ...carHeader.cars]
  //   await this.getMoreReaders(carHeader.cars)
  //   await this._applyCarHeader(carHeader, true)
  // }

  async handleDbMetasFromStore(metas: DbMeta[]): Promise<void> {
    for (const meta of metas) {
      const writingFn = async () => {
        this.isWriting = true
        await this.mergeDbMetaIntoClock(meta)
        this.isWriting = false
      }
      this._setWaitForWrite(writingFn)
      await writingFn()
    }
  }

  async mergeDbMetaIntoClock(meta: DbMeta): Promise<void> {
    // const ld = this
    // await ld.compacting
    if (this.isCompacting) {
      throw new Error('cannot merge while compacting')
    }
    if (this.seenMeta.has(meta.car.toString())) return
    this.seenMeta.add(meta.car.toString())

    if (meta.key) {
      await this.setKey(meta.key)
    }
    if (cidListIncludes(this.carLog, meta.car)) {
      return
    }
    const carHeader = (await this.loadCarHeaderFromMeta(meta)) as CarHeader
    // fetch other cars down the compact log?
    // todo we should use a CID set for the compacted cids (how to expire?)
    // console.log('merge carHeader', carHeader.head.length, carHeader.head.toString(), meta.car.toString())
    carHeader.compact.map(c => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted)
    await this.getMoreReaders(carHeader.cars)
    this.carLog = [...uniqueCids([meta.car, ...this.carLog, ...carHeader.cars], this.seenCompacted)]
    // await this._applyCarHeader(carHeader)
    await this.tOpts.applyCarHeaderCustomizer(carHeader)
  }

  protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
    const { key } = meta
    if (key) {
      await this.setKey(key)
    }
  }

  async loadCarHeaderFromMeta({ car: cid }: DbMeta): Promise<CarHeader> {
    const reader = await this.loadCar(cid)
    return await parseCarFile(reader)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async _getKey() {
    if (this.key) return this.key
    // generate a random key
    if (!this.opts.public) {
      if (getCrypto()) {
        await this.setKey(toHexString(randomBytes(32)))
      } else {
        console.warn('missing crypto module, using public mode')
      }
    }
    return this.key
  }

  async commitFiles(
    t: Transaction,
    done: FileResult,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<AnyLink> {
    return this.commitQueue.enqueue(() => this._commitInternalFiles(t, done, opts))
  }
  // can these skip the queue? or have a file queue?
  async _commitInternalFiles(
    t: Transaction,
    done: FileResult,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<AnyLink> {
    await this.ready
    const { files: roots } = this.makeFileCarHeader(done, this.carLog, !!opts.compact)
    const { cid, bytes } = await this.prepareCarFile(roots[0], t, !!opts.public)
    await this.fileStore!.save({ cid, bytes })
    await this.remoteWAL!.enqueueFile(cid, !!opts.public)
    return cid
  }

  async loadFileCar(cid: AnyLink, isPublic = false): Promise<CarReader> {
    return await this.storesLoadCar(cid, this.fileStore, this.remoteFileStore, isPublic)
  }

  async commit(
    t: Transaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<AnyLink> {
    return this.commitQueue.enqueue(() => this._commitInternal(t, done, opts))
  }

  async _commitInternal(
    t: Transaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<AnyLink> {
    await this.ready
    const header = this.tOpts.makeCarHeaderCustomizer(done)
    const fp = this.makeCarHeader(header, this.carLog, !!opts.compact) as AnyCarHeader
    let roots: AnyLink[] = await this.prepareRoots(fp, t)
    const { cid, bytes } = await this.prepareCarFile(roots[0], t, !!opts.public)
    await this.carStore!.save({ cid, bytes })
    const newDbMeta = { car: cid, key: this.key || null } as DbMeta
    await this.remoteWAL!.enqueue(newDbMeta, opts)
    await this.metaStore!.save(newDbMeta)
    await this.updateCarLog(cid, fp, !!opts.compact)
    return cid
  }

  async prepareRoots(fp: AnyCarHeader | FileCarHeader, t: Transaction): Promise<AnyLink[]> {
    const header = await encodeCarHeader(fp)
    await t.put(header.cid, header.bytes)
    // const got = await t.get(header.cid)
    // if (!got) throw new Error('missing header block: ' + header.cid.toString())
    return [header.cid]
  }

  async prepareCarFile(
    root: AnyLink,
    t: Transaction,
    isPublic: boolean
  ): Promise<{ cid: AnyLink; bytes: Uint8Array }> {
    const theKey = isPublic ? null : await this._getKey()
    return theKey ? await encryptedEncodeCarFile(theKey, root, t) : await encodeCarFile([root], t)
  }

  protected makeFileCarHeader(
    result: FileResult,
    cars: AnyLink[],
    compact: boolean = false
  ): FileCarHeader {
    const files = [] as AnyLink[]
    for (const [, meta] of Object.entries(result.files)) {
      files.push(meta.cid)
    }
    return { files } as FileCarHeader
  }

  async updateCarLog(
    cid: AnyLink,
    fp: AnyCarHeader | FileCarHeader,
    compact: boolean
  ): Promise<void> {
    if (compact) {
      const fpCar = fp as CarLoaderHeader
      const previousCompactCid = this.carLog[this.carLog.length - 1]
      fpCar.compact.map(c => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted)
      this.carLog = [...uniqueCids([cid, ...this.carLog], this.seenCompacted)]
      void this.removeCidsForCompact(previousCompactCid)
    } else {
      this.carLog.unshift(cid)
    }
  }

  async removeCidsForCompact(cid: AnyLink) {
    const carHeader = await this.loadCarHeaderFromMeta({
      car: cid
    } as unknown as DbMeta)
    for (const cid of carHeader.compact) {
      await this.carStore!.remove(cid)
    }
  }

  async flushCars() {
    await this.ready
    // for each cid in car log, make a dbMeta
    for (const cid of this.carLog) {
      const dbMeta = { car: cid, key: this.key || null } as DbMeta
      await this.remoteWAL!.enqueue(dbMeta, { public: false })
    }
  }

  async *entries(): AsyncIterableIterator<AnyBlock> {
    await this.ready
    for (const cid of this.carLog) {
      const reader = await this.loadCar(cid)
      if (!reader) throw new Error(`missing car reader ${cid.toString()}`)
      for await (const block of reader.blocks()) {
        yield block
      }
    }
  }

  async getBlock(cid: AnyLink): Promise<AnyBlock | undefined> {
    await this.ready
    const sCid = cid.toString()
    if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid)
    const got = await Promise.any(
      this.carLog.map(async carCid => {
        const reader = await this.loadCar(carCid)
        if (!reader) {
          throw new Error(`missing car reader ${carCid.toString()}`)
        }
        const block = await reader.get(cid as CID)
        if (block) {
          return block
        }
        throw new Error(`block not in reader: ${cid.toString()}`)
      })
    ).catch(() => undefined)
    if (got) {
      this.getBlockCache.set(sCid, got)
    }
    return got
  }

  protected makeCarHeader(
    result: TransactionMeta,
    cars: AnyLink[],
    compact: boolean = false
  ): CarHeader {
    const coreHeader = compact ? { cars: [], compact: cars } : { cars, compact: [] }
    return { ...coreHeader, meta: result }
  }

  protected async loadCar(cid: AnyLink): Promise<CarReader> {
    if (!this.carStore) throw new Error('car store not initialized')
    const loaded = await this.storesLoadCar(cid, this.carStore, this.remoteCarStore)
    return loaded
  }

  protected async storesLoadCar(
    cid: AnyLink,
    local: AbstractDataStore,
    remote?: AbstractDataStore,
    publicFiles?: boolean
  ): Promise<CarReader> {
    const cidString = cid.toString()
    if (!this.carReaders.has(cidString)) {
      this.carReaders.set(
        cidString,
        (async () => {
          let loadedCar: AnyBlock | null = null
          try {
            loadedCar = await local.load(cid)
          } catch (e) {
            if (remote) {
              const remoteCar = await remote.load(cid)
              if (remoteCar) {
                // todo test for this
                await local.save(remoteCar)
                loadedCar = remoteCar
              }
            }
          }
          if (!loadedCar) throw new Error(`missing car file ${cidString}`)
          const rawReader = await CarReader.fromBytes(loadedCar.bytes)
          const readerP = publicFiles
            ? Promise.resolve(rawReader)
            : this.ensureDecryptedReader(rawReader)
          this.carReaders.set(cidString, readerP)
          return readerP
        })().catch(e => {
          this.carReaders.delete(cidString)
          throw e
        })
      )
    }
    return this.carReaders.get(cidString) as Promise<CarReader>
  }

  protected async ensureDecryptedReader(reader: CarReader) {
    const theKey = await this._getKey()
    if (!theKey) return reader
    const { blocks, root } = await decodeEncryptedCar(theKey, reader)
    return {
      getRoots: () => [root],
      get: blocks.get.bind(blocks),
      blocks: blocks.entries.bind(blocks)
    } as unknown as CarReader
  }

  protected async setKey(key: string) {
    if (this.key && this.key !== key) throw new Error('key mismatch')
    this.key = key
    const crypto = getCrypto()
    if (!crypto) throw new Error('missing crypto module')
    const subtle = crypto.subtle
    const encoder = new TextEncoder()
    const data = encoder.encode(key)
    const hashBuffer = await subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    this.keyId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  protected async getMoreReaders(cids: AnyLink[]) {
    const limit = pLimit(5)
    const missing = cids.filter(cid => !this.carReaders.has(cid.toString()))
    await Promise.all(missing.map(cid => limit(() => this.loadCar(cid))))
  }

  // compaction
  awaitingCompact = false
  compacting: Promise<AnyLink | void> = Promise.resolve()
  writing: Promise<TransactionMeta | void> = Promise.resolve()

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

  // async compact(compactFn: CompactFn) {
  //   const blocks = this.blocks
  //   await this.ready
  //   if (this.carLog.length < 2) return
  //   if (this.awaitingCompact) return
  //   this.awaitingCompact = true
  //   const compactingFn = async () => {
  //     if (this.isCompacting) {
  //       return
  //     }

  //     if (this.isWriting) {
  //       return
  //     }

  //     this.isCompacting = true

  //     const blockLog = new LoggingFetcher(blocks)

  //     // these three lines are different for indexes and dbs
  //     // file compaction would be different than both because you crawl the db to determine which files are still referenced
  //     // const compactHead = this.clock.head
  //     const compactingResult = await compactFn(blockLog)

  //     //  call the new head callback...
  //     await this.tOpts.applyCarHeaderCustomizer(compactHead)
  //     // await this.clock.applyHead(compactHead, compactHead, null)

  //     return compactingResult
  //   }
  //   this.compacting = this._setWaitForWrite(compactingFn)
  //   this.compacting.finally(() => {
  //     this.isCompacting = false
  //     this.awaitingCompact = false
  //   })
  //   await this.compacting
  // }
}

export interface Connection {
  loader: Loader
  loaded: Promise<void>
}
