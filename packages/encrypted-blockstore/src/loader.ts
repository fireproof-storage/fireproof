import pLimit from 'p-limit'
import { CarReader } from '@ipld/car'
import { CID } from 'multiformats'

import type {
  AnyBlock,
  AnyLink,
  CarHeader,
  CommitOpts,
  DbMeta,
  TransactionMeta,
  CarGroup,
  CarLog
} from './types'
import type { BlockstoreOpts } from './transaction'

import { encodeCarFile, encodeCarHeader, parseCarFile } from './loader-helpers'
import { decodeEncryptedCar, encryptedEncodeCarFile } from './encrypt-helpers'

import { getCrypto, randomBytes } from './crypto-web'
import { DataStore, MetaStore } from './store'
import { RemoteWAL } from './remote-wal'

import { DataStore as AbstractDataStore, MetaStore as AbstractMetaStore } from './store'
import type { CarTransaction } from './transaction'
import { CommitQueue } from './commit-queue'

export function cidListIncludes(list: CarLog, cids: CarGroup) {
  return list.some((arr: CarGroup) => {
    return arr.toString() === cids.toString()
  })
}

// this works for car groups because toString looks like bafy,bafy
function uniqueCids(list: CarLog, remove: Set<string> = new Set()): CarLog {
  const byString = new Map<string, CarGroup>()
  for (const cid of list) {
    if (remove.has(cid.toString())) continue
    byString.set(cid.toString(), cid)
  }
  return [...byString.values()]
}

export function toHexString(byteArray: Uint8Array) {
  return Array.from(byteArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

abstract class AbstractRemoteMetaStore extends AbstractMetaStore {
  abstract handleByteHeads(byteHeads: Uint8Array[], branch?: string): Promise<DbMeta[]>
}

export abstract class Loadable {
  name: string = ''
  remoteCarStore?: DataStore
  carStore?: DataStore
  carLog: CarLog = new Array<CarGroup>()
  remoteMetaStore?: AbstractRemoteMetaStore
  remoteFileStore?: AbstractDataStore
  fileStore?: DataStore
}

export class Loader implements Loadable {
  name: string
  ebOpts: BlockstoreOpts
  commitQueue: CommitQueue<CarGroup> = new CommitQueue<CarGroup>()
  isCompacting = false
  isWriting = false
  remoteMetaStore?: AbstractRemoteMetaStore
  remoteCarStore?: AbstractDataStore
  fileStore: DataStore
  remoteFileStore?: AbstractDataStore
  remoteWAL: RemoteWAL
  metaStore?: MetaStore
  carStore: DataStore
  //Make this a 2d array - done
  carLog: CarLog = new Array<CarGroup>()
  carReaders: Map<string, Promise<CarReader>> = new Map()
  ready: Promise<void>
  key?: string
  keyId?: string
  seenCompacted: Set<string> = new Set()
  processedCars: Set<string> = new Set()
  writing: Promise<TransactionMeta | void> = Promise.resolve()

  private getBlockCache: Map<string, AnyBlock> = new Map()
  //Try to make it a set of array of strings
  private seenMeta: Set<string> = new Set()

  constructor(name: string, ebOpts: BlockstoreOpts) {
    this.name = name
    this.ebOpts = ebOpts

    this.carStore = ebOpts.store.makeDataStore(this.name)
    this.fileStore = ebOpts.store.makeDataStore(this.name)
    this.remoteWAL = ebOpts.store.makeRemoteWAL(this)
    this.ready = Promise.resolve().then(async () => {
      this.metaStore = ebOpts.store.makeMetaStore(this)
      if (!this.metaStore || !this.carStore || !this.remoteWAL)
        throw new Error('stores not initialized')
      const metas = this.ebOpts.meta ? [this.ebOpts.meta] : await this.metaStore!.load('main')
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
    if (this.isCompacting) {
      throw new Error('cannot merge while compacting')
    }

    //We don't have to loop over meta.cars because we are converting it into a string representation
    if (this.seenMeta.has(meta.cars.toString())) return
    this.seenMeta.add(meta.cars.toString())

    if (meta.key) {
      await this.setKey(meta.key)
    }
    if (cidListIncludes(this.carLog, meta.cars)) {
      return
    }
    const carHeader = (await this.loadCarHeaderFromMeta(meta)) as CarHeader
    // fetch other cars down the compact log?
    // todo we should use a CID set for the compacted cids (how to expire?)
    // console.log('merge carHeader', carHeader.head.length, carHeader.head.toString(), meta.car.toString())
    carHeader.compact.map(c => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted)
    await this.getMoreReaders(carHeader.cars.flat())
    this.carLog = [
      ...uniqueCids([meta.cars, ...this.carLog, ...carHeader.cars], this.seenCompacted)
    ]
    await this.ebOpts.applyMeta(carHeader.meta)
  }

  protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
    const { key } = meta
    if (key) {
      await this.setKey(key)
    }
  }

  async loadCarHeaderFromMeta({ cars: cids }: DbMeta): Promise<CarHeader> {
    //Call loadCar for every cid
    const reader = await this.loadCar(cids[0])
    return await parseCarFile(reader)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async _getKey(): Promise<string | undefined> {
    if (this.key) return this.key
    // generate a random key
    if (!this.ebOpts.public) {
      if (getCrypto()) {
        await this.setKey(toHexString(randomBytes(32)))
      } else {
        console.warn('missing crypto module, using public mode')
      }
    }
    return this.key
  }

  async commitFiles(
    t: CarTransaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<CarGroup> {
    return this.commitQueue.enqueue(() => this._commitInternalFiles(t, done, opts))
  }
  // can these skip the queue? or have a file queue?
  async _commitInternalFiles(
    t: CarTransaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<CarGroup> {
    await this.ready
    const { files: roots } = this.makeFileCarHeader(done) as {
      files: AnyLink[]
    }
    const { cid, bytes } = await this.prepareCarFile(roots[0], t, !!opts.public)
    await this.fileStore!.save({ cid, bytes })
    await this.remoteWAL!.enqueueFile(cid, !!opts.public)
    return [cid]
  }

  async loadFileCar(cid: AnyLink, isPublic = false): Promise<CarReader> {
    return await this.storesLoadCar(cid, this.fileStore, this.remoteFileStore, isPublic)
  }

  async commit(
    t: CarTransaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<CarGroup> {
    return this.commitQueue.enqueue(() => this._commitInternal(t, done, opts))
  }

  async cacheTransaction(t: CarTransaction) {
    for await (const block of t.entries()) {
      const sBlock = block.cid.toString()
      if (!this.getBlockCache.has(sBlock)) {
        this.getBlockCache.set(sBlock, block)
      }
    }
  }

  async cacheCarReader(carCidStr: string, reader: CarReader) {
    if (this.processedCars.has(carCidStr)) return
    this.processedCars.add(carCidStr)
    for await (const block of reader.blocks()) {
      const sBlock = block.cid.toString()
      if (!this.getBlockCache.has(sBlock)) {
        this.getBlockCache.set(sBlock, block)
      }
    }
  }

  async _commitInternal(
    t: CarTransaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false }
  ): Promise<CarGroup> {
    await this.ready
    const fp = this.makeCarHeader(done, this.carLog, !!opts.compact) as CarHeader
    let roots: AnyLink[] = await this.prepareRoots(fp, t)
    //We need to split the data inside the prepareCarFile?
    //While splitting every CAR file should have a copy of root[0] meaning it should have a copy of fp
    // Maximum size of each CAR file as 1mb?
    const { cid, bytes } = await this.prepareCarFile(roots[0], t, !!opts.public)
    await this.carStore!.save({ cid, bytes })
    await this.cacheTransaction(t)
    const newDbMeta = { cars: [cid], key: this.key || null } as DbMeta
    await this.remoteWAL!.enqueue(newDbMeta, opts)
    await this.metaStore!.save(newDbMeta)
    await this.updateCarLog([cid], fp, !!opts.compact)
    return [cid]
  }

  async prepareRoots(fp: CarHeader, t: CarTransaction): Promise<AnyLink[]> {
    const header = await encodeCarHeader(fp)
    await t.put(header.cid, header.bytes)
    // const got = await t.get(header.cid)
    // if (!got) throw new Error('missing header block: ' + header.cid.toString())
    return [header.cid]
  }

  async prepareCarFile(
    root: AnyLink,
    t: CarTransaction,
    isPublic: boolean
  ): Promise<{ cid: AnyLink; bytes: Uint8Array }> {
    const theKey = isPublic ? null : await this._getKey()
    return theKey && this.ebOpts.crypto
      ? await encryptedEncodeCarFile(this.ebOpts.crypto, theKey, root, t)
      : await encodeCarFile([root], t)
  }

  protected makeFileCarHeader(result: TransactionMeta): TransactionMeta {
    const files: AnyLink[] = []
    for (const [, meta] of Object.entries(result.files!)) {
      if (meta && typeof meta === 'object' && 'cid' in meta && meta !== null) {
        files.push(meta.cid as AnyLink)
      }
    }
    return { files }
  }

  //This needs more testing?
  async updateCarLog(cids: CarGroup, fp: CarHeader, compact: boolean): Promise<void> {
    if (compact) {
      const previousCompactCid = fp.compact[fp.compact.length - 1]
      fp.compact.map(c => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted)
      //Made the change here from uniqueCids to uniqueCarCids
      this.carLog = [...uniqueCids([...this.carLog, ...fp.cars, cids], this.seenCompacted)]
      void this.removeCidsForCompact(previousCompactCid[0])
    } else {
      //Work on this and make sure the tests pass
      this.carLog.unshift(cids)
    }
  }

  async removeCidsForCompact(cid: AnyLink) {
    const carHeader = await this.loadCarHeaderFromMeta({
      cars: [cid]
    } as unknown as DbMeta)
    for (const cids of carHeader.compact) {
      for (const cid of cids) {
        await this.carStore!.remove(cid)
      }
    }
  }

  // async flushCars() {
  //   await this.ready
  //   // for each cid in car log, make a dbMeta
  //   for (const cid of this.carLog) {
  //     const dbMeta = { car: cid, key: this.key || null } as DbMeta
  //     await this.remoteWAL!.enqueue(dbMeta, { public: false })
  //   }
  // }

  async *entries(cache = true): AsyncIterableIterator<AnyBlock> {
    await this.ready
    if (cache) {
      for (const [, block] of this.getBlockCache) {
        yield block
      }
    } else {
      for (const [, block] of this.getBlockCache) {
        yield block
      }
      for (const cids of this.carLog) {
        for (const cid of cids) {
          const reader = await this.loadCar(cid)
          if (!reader) throw new Error(`missing car reader ${cid.toString()}`)
          for await (const block of reader.blocks()) {
            const sCid = block.cid.toString()
            if (!this.getBlockCache.has(sCid)) {
              yield block
            }
          }
        }
      }
    }
  }

  async getBlock(cid: AnyLink): Promise<AnyBlock | undefined> {
    await this.ready
    const sCid = cid.toString()
    if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid)

    const getCarCid = async (carCid: AnyLink) => {
      const reader = await this.loadCar(carCid)
      if (!reader) {
        throw new Error(`missing car reader ${carCid.toString()}`)
      }
      await this.cacheCarReader(carCid.toString(), reader).catch(e => {})
      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid)
      throw new Error(`block not in reader: ${cid.toString()}`)
    }

    const getCompactCarCids = async (carCid: AnyLink) => {
      const reader = await this.loadCar(carCid)
      if (!reader) {
        throw new Error(`missing car reader ${carCid.toString()}`)
      }

      const header = await parseCarFile(reader)

      const compacts = header.compact

      let got: AnyBlock | undefined
      const batchSize = 5
      for (let i = 0; i < compacts.length; i += batchSize) {
        const promises: Promise<AnyBlock | undefined>[] = []
        for (let j = i; j < Math.min(i + batchSize, compacts.length); j++) {
          for (const cid of compacts[j]) {
            promises.push(getCarCid(cid))
          }
        }
        try {
          got = await Promise.any(promises)
        } catch {
          // Ignore the error and continue with the next iteration
        }
        if (got) break
      }

      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid)
      throw new Error(`block not in compact reader: ${cid.toString()}`)
    }

    let got
    const batchSize = 5
    for (let i = 0; i < this.carLog.length; i += batchSize) {
      const promises: Promise<AnyBlock | undefined>[] = []
      for (let j = i; j < Math.min(i + batchSize, this.carLog.length); j++) {
        for (const cid of this.carLog[j]) {
          promises.push(getCarCid(cid))
        }
      }
      try {
        got = await Promise.any(promises)
      } catch {
        // Ignore the error and continue with the next iteration
      }
      if (got) break
    }

    if (!got) {
      for (let i = 0; i < this.carLog.length; i += batchSize) {
        const promises: Promise<AnyBlock | undefined>[] = []
        for (let j = i; j < Math.min(i + batchSize, this.carLog.length); j++) {
          for (const cid of this.carLog[j]) {
            promises.push(getCarCid(cid))
          }
        }
        try {
          got = await Promise.any(promises)
        } catch {
          // Ignore the error and continue with the next iteration
        }
        if (got) break
      }
    }
    return got
  }

  protected makeCarHeader(
    result: TransactionMeta,
    cars: CarLog,
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

  //What if instead it returns an Array of CarHeader
  protected async storesLoadCar(
    cid: AnyLink,
    local: AbstractDataStore,
    remote?: AbstractDataStore,
    publicFiles?: boolean
  ): Promise<CarReader> {
    const cidsString = cid.toString()
    if (!this.carReaders.has(cidsString)) {
      this.carReaders.set(
        cidsString,
        (async () => {
          let loadedCar: AnyBlock | null = null
          try {
            //loadedCar now is an array of AnyBlocks
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
          if (!loadedCar) throw new Error(`missing car files ${cidsString}`)
          //This needs a fix as well as the fromBytes function expects a Uint8Array
          //Either we can merge the bytes or return an array of rawReaders
          const rawReader = await CarReader.fromBytes(loadedCar.bytes)
          const readerP = publicFiles
            ? Promise.resolve(rawReader)
            : this.ensureDecryptedReader(rawReader)
          this.carReaders.set(cidsString, readerP)
          return readerP
        })().catch(e => {
          this.carReaders.delete(cidsString)
          throw e
        })
      )
    }
    return this.carReaders.get(cidsString) as Promise<CarReader>
  }

  protected async ensureDecryptedReader(reader: CarReader): Promise<CarReader> {
    const theKey = await this._getKey()
    if (this.ebOpts.public || !(theKey && this.ebOpts.crypto)) return reader
    const { blocks, root } = await decodeEncryptedCar(this.ebOpts.crypto, theKey, reader)
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

  async _setWaitForWrite(_writingFn: () => Promise<any>): Promise<void> {
    const wr = this.writing
    this.writing = wr.then(async () => {
      await _writingFn()
      return wr
    })
    return this.writing.then(() => {})
  }
}

// duplicated in @fireproof/connect
export type UploadMetaFnParams = {
  name: string
  branch: string
}

export type UploadDataFnParams = {
  type: 'data' | 'file'
  name: string
  car: string
  size: string
}

export type DownloadFnParamTypes = 'data' | 'file'

export type DownloadDataFnParams = {
  type: DownloadFnParamTypes
  name: string
  car: string
}

export type DownloadMetaFnParams = {
  name: string
  branch: string
}

export interface Connection {
  loader: Loader
  loaded: Promise<void>
  connectMeta({ loader }: { loader: Loader }): void
  connectStorage({ loader }: { loader: Loader }): void

  metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | null>
  dataUpload(
    bytes: Uint8Array,
    params: UploadDataFnParams,
    opts?: { public?: boolean }
  ): Promise<void | AnyLink>
  metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | null>
  dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | null>
}
