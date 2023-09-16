import { CarReader } from '@ipld/car'
import { encodeCarFile, encodeCarHeader, parseCarFile } from './loader-helpers'
import { decodeEncryptedCar, encryptedEncodeCarFile } from './encrypt-helpers'
import { getCrypto, randomBytes } from './crypto-web'
import { RemoteDataStore, RemoteMetaStore } from './store-remote'

import { DataStore, MetaStore, RemoteWAL } from './store-browser'
import type { DataStore as AbstractDataStore } from './store'

import { CID } from 'multiformats'
import type { Transaction } from './transaction'
import type {
  AnyBlock, AnyCarHeader, AnyLink, BulkResult,
  CarLoaderHeader,
  CommitOpts,
  DbMeta, FileCarHeader, FileResult, FireproofOptions
} from './types'
import type { Connection } from './connection'
// import type { DataStore, MetaStore, RemoteWAL } from './store'
import { isFileResult, type DbLoader, type IndexerResult } from './loaders'

// ts-unused-exports:disable-next-line
export function cidListIncludes(list: AnyLink[], cid: AnyLink) {
  return list.some(c => c.equals(cid))
}
function uniqueCids(list: AnyLink[], remove: AnyLink[] = []): AnyLink[] {
  const byString = new Map<string, AnyLink>()
  for (const cid of list) {
    if (cidListIncludes(remove, cid)) continue
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

export abstract class Loader {
  name: string
  opts: FireproofOptions = {}

  remoteMetaLoading: Promise<void> | undefined
  remoteMetaStore: RemoteMetaStore | undefined
  remoteCarStore: RemoteDataStore | undefined
  remoteWAL: RemoteWAL | undefined
  metaStore: MetaStore | undefined
  carStore: DataStore | undefined
  carLog: AnyLink[] = []
  carReaders: Map<string, Promise<CarReader>> = new Map()
  ready: Promise<void>
  key: string | undefined
  keyId: string | undefined

  private getBlockCache: Map<string, AnyBlock> = new Map()

  static defaultHeader: AnyCarHeader
  abstract defaultHeader: AnyCarHeader

  constructor(name: string, opts?: FireproofOptions) {
    this.name = name
    this.opts = opts || this.opts
    this.ready = this.initializeStores().then(async () => {
      if (!this.metaStore || !this.carStore || !this.remoteWAL) throw new Error('stores not initialized')
      const metas = this.opts.meta ? [this.opts.meta] : await this.metaStore.load('main')
      if (metas) {
        await this.handleDbMetasFromStore(metas)
      }
    })
  }

  _connectRemoteMeta(connection: Connection) {
    const remote = new RemoteMetaStore(this.name, connection)
    remote.onLoad('main', async (metas) => {
      if (metas) {
        await this.handleDbMetasFromStore(metas)
      }
    })
    this.remoteMetaStore = remote
    return connection
  }

  _connectRemoteStorage(connection: Connection) {
    this.remoteCarStore = new RemoteDataStore(this, connection)
    return connection
  }

  connectRemote(connection: Connection) {
    connection.loader = this
    this._connectRemoteMeta(connection)
    this._connectRemoteStorage(connection)

    this.remoteMetaLoading = this.remoteMetaStore!.load('main').then(() => {})

    connection.loaded = Promise.all([this.ready, this.remoteMetaLoading]).then(() => {
      void this.remoteWAL?._process()
    })

    // this.remoteMetaLoading = Promise.all([this.ready, this.remoteMetaStore!.load('main')]).then(() => {
    //   void this.remoteWAL?._process()
    // })

    return connection
  }

  async snapToCar(carCid: AnyLink | string) {
    await this.ready
    if (typeof carCid === 'string') {
      carCid = CID.parse(carCid)
    }
    const carHeader = await this.loadCarHeaderFromMeta({ car: carCid, key: this.key || null })
    this.carLog = [carCid, ...carHeader.cars]
    await this.getMoreReaders(carHeader.cars)
    await this._applyCarHeader(carHeader, true)
  }

  async handleDbMetasFromStore(metas: DbMeta[]): Promise<void> {
    for (const meta of metas) {
      await this.mergeDbMetaIntoClock(meta)
    }
  }

  async mergeDbMetaIntoClock(meta: DbMeta): Promise<void> {
    if (meta.key) { await this.setKey(meta.key) }
    // todo we should use a this.longCarLog() method that loads beyond compactions
    if (cidListIncludes(this.carLog, meta.car)) {
      return
    }
    const carHeader = await this.loadCarHeaderFromMeta(meta)
    this.carLog = [...uniqueCids([meta.car, ...this.carLog, ...carHeader.cars], carHeader.compact)]
    await this.getMoreReaders(carHeader.cars)
    await this._applyCarHeader(carHeader)
  }

  protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
    const { key } = meta
    if (key) {
      await this.setKey(key)
    }
  }

  async loadCarHeaderFromMeta({ car: cid }: DbMeta): Promise<CarLoaderHeader> {
    const reader = await this.loadCar(cid)
    return await parseCarFile(reader) as CarLoaderHeader
  }

  protected abstract _applyCarHeader(_carHeader: CarLoaderHeader, snap?: boolean): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/require-await
  async _getKey() {
    if (this.key) return this.key
    // if (this.remoteMetaLoading) {
    //   const meta = await this.remoteMetaLoading
    //   if (meta && meta.key) {
    //     await this.setKey(meta.key)
    //     return this.key
    //   }
    // }
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

  private committing: Promise<AnyLink> | undefined
  async commit(t: Transaction, done: IndexerResult | BulkResult | FileResult,
    opts: CommitOpts = { noLoader: false, compact: false }): Promise<AnyLink> {
    if (this.committing) {
      await this.committing
    }
    this.committing = this._commitInternal(t, done, opts)
    const result = await this.committing
    this.committing = undefined
    return result
  }

  async _commitInternal(t: Transaction, done: IndexerResult | BulkResult | FileResult, opts: CommitOpts = { noLoader: false, compact: false }): Promise<AnyLink> {
    await this.ready
    // console.trace('_commitInternal', opts)
    const fp = this.makeCarHeader(done, this.carLog, !!opts.compact)
    let roots: AnyLink[] = []
    // @ts-ignore
    if (fp.files) {
      // @ts-ignore
      roots = fp.files as AnyLink[]
    } else {
      const header = await encodeCarHeader(fp)
      await t.put(header.cid, header.bytes)
      roots = [header.cid]
    }

    const theKey = opts.public ? null : await this._getKey()
    const { cid, bytes } = theKey ? await encryptedEncodeCarFile(theKey, roots[0], t) : await encodeCarFile(roots, t)

    // save the car locally and remote

    if (isFileResult(done)) { // move to the db loader?
      const dbLoader = this as unknown as DbLoader
      await dbLoader.fileStore!.save({ cid, bytes })
      await this.remoteWAL!.enqueueFile(cid, opts.public)
      return cid
    }

    await this.carStore!.save({ cid, bytes })

    const newDbMeta = { car: cid, key: theKey || null } as DbMeta
    await this.remoteWAL!.enqueue(newDbMeta, opts)

    await this.metaStore!.save(newDbMeta)

    if (opts.compact) {
      const fpCar = fp as CarLoaderHeader
      for (const cid of fpCar.compact) {
        await this.carStore!.remove(cid)
      }
      this.carLog = [...uniqueCids([cid, ...this.carLog], fpCar.compact)]
    } else {
      this.carLog.unshift(cid)
    }
    return cid
  }

  async getBlock(cid: AnyLink): Promise<AnyBlock | undefined> {
    await this.ready
    const sCid = cid.toString()
    if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid)
    const got = await Promise.any(this.carLog.map(async (carCid) => {
      const reader = await this.loadCar(carCid)
      if (!reader) {
        throw new Error(`missing car reader ${carCid.toString()}`)
      }
      const block = await reader.get(cid as CID)
      if (block) {
        return block
      }
      throw new Error(`block not in reader: ${cid.toString()}`)
    })).catch(() => undefined)
    if (got) {
      this.getBlockCache.set(sCid, got)
    }
    return got
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async initializeStores() {
    // const isBrowser = typeof window !== 'undefined'
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    // const module = isBrowser ? await require('./store-browser') : await require('./store-fs')
    // if (module) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    // this.metaStore = new module.MetaStore(this.name) as MetaStore
    this.metaStore = new MetaStore(this.name)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    // this.carStore = new module.DataStore(this) as DataStore
    this.carStore = new DataStore(this)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    // this.remoteWAL = new module.RemoteWAL(this) as RemoteWAL
    this.remoteWAL = new RemoteWAL(this)
    // } else {
    // throw new Error('Failed to initialize stores.')
    // }
  }

  protected abstract makeCarHeader(_result: BulkResult | IndexerResult | FileResult, _cars: AnyLink[], _compact: boolean): AnyCarHeader | FileCarHeader;

  protected async loadCar(cid: AnyLink): Promise<CarReader> {
    if (!this.carStore) throw new Error('car store not initialized')
    return await this.storesLoadCar(cid, this.carStore, this.remoteCarStore)
  }

  protected async storesLoadCar(cid: AnyLink, local: AbstractDataStore, remote?: AbstractDataStore, publicFiles?: boolean): Promise<CarReader> {
    const cidString = cid.toString()
    if (!this.carReaders.has(cidString)) {
      this.carReaders.set(cidString, (async () => {
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
        const readerP = publicFiles ? Promise.resolve(rawReader) : this.ensureDecryptedReader(rawReader)
        this.carReaders.set(cidString, readerP)
        return readerP
      })().catch((e) => {
        this.carReaders.delete(cidString)
        throw e
      }))
    }
    return this.carReaders.get(cidString) as Promise<CarReader>
  }

  protected async ensureDecryptedReader(reader: CarReader) {
    const theKey = await this._getKey()
    if (!theKey) return reader
    const { blocks, root } = await decodeEncryptedCar(theKey, reader)
    return {
      getRoots: () => [root],
      get: blocks.get.bind(blocks)
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
    await Promise.all(cids.map(cid => this.loadCar(cid)))
  }
}
