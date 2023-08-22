import { CarReader } from '@ipld/car'
import { clearMakeCarFile, parseCarFile } from './loader-helpers'
import { Transaction } from './transaction'
import type {
  AnyBlock, AnyCarHeader, AnyLink, BulkResult,
  CarCommit, Connection, DbCarHeader, DbMeta, FireproofOptions, IdxCarHeader,
  IdxMeta, IdxMetaMap
} from './types'
import { CID } from 'multiformats'
import { DataStore, MetaStore } from './store'
import { decodeEncryptedCar, encryptedMakeCarFile } from './encrypt-helpers'
import { getCrypto, randomBytes } from './encrypted-block'
import { RemoteDataStore, RemoteMetaStore } from './store-remote'
import { CRDT, CRDTClock } from './crdt'
import { index } from './index'

export function cidListIncludes(list: AnyLink[], cid: AnyLink) {
  return list.some(c => c.equals(cid))
}
export function uniqueCids(list: AnyLink[]): AnyLink[] {
  const byString = new Map<string, AnyLink>()
  for (const cid of list) {
    byString.set(cid.toString(), cid)
  }
  return [...byString.values()]
}

export abstract class Loader {
  name: string
  opts: FireproofOptions = {}

  remoteMetaLoading: Promise<void> | undefined
  remoteMetaStore: MetaStore | undefined
  remoteCarStore: DataStore | undefined
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
      if (!this.metaStore || !this.carStore) throw new Error('stores not initialized')
      const meta = await this.metaStore.load('main')
      if (meta) {
        await this.mergeMetaFromRemote(meta)
      }
    })
  }

  connectRemote(connection: Connection) {
    console.log('connectRemote')
    this.remoteMetaStore = new RemoteMetaStore(this.name, connection)
    this.remoteCarStore = new RemoteDataStore(this, connection)
    // eslint-disable-next-line @typescript-eslint/require-await
    this.remoteMetaLoading = this.remoteMetaStore.load('main').then(async (meta) => {
      if (meta) {
        await this.mergeMetaFromRemote(meta)
      }
    })
    // todo put this where it can be used by crdt bulk
    const loaderReady = this.ready
    connection.ready = Promise.all([loaderReady, this.remoteMetaLoading]).then(() => {
      console.log('connection ready')
    })
    // void this.ready.then(() => {
    //   setInterval(() => {
    //     void this.remoteMetaStore!.load('main').then(async (meta) => {
    //       if (meta) {
    //         await this.mergeMetaFromRemote(meta)
    //       }
    //     })
    //   }, 1000)
    // })
    return connection
  }

  async mergeMetaFromRemote(meta: DbMeta): Promise<void> {
    console.log('mergeMetaFromRemote', meta)
    if (meta.key) { await this.setKey(meta.key) }
    // todo we should use a this.longCarLog() method that loads beyond compactions
    if (cidListIncludes(this.carLog, meta.car)) {
      console.log('FF: this.carLog includes remote car')
      return
    }
    const carHeader = await this.loadCarHeaderFromMeta(meta)
    const remoteCarLog = [meta.car, ...carHeader.cars]
    if (this.carLog.length === 0 || cidListIncludes(remoteCarLog, this.carLog[0])) {
      // fast forward to remote
      console.log('FF: remoteCarLog includes local head car', this.carLog.map(c => c.toString()))
      this.carLog = [...uniqueCids([meta.car, ...this.carLog, ...carHeader.cars])]
      console.log('FF new carLog', this.carLog.map(c => c.toString()))
      void this.getMoreReaders(carHeader.cars)
      console.log('_applyCarHeader m1', meta, carHeader)
      await this._applyCarHeader(carHeader)
    } else {
      // throw new Error('remote car log does not include local car log')
      console.log('not ff, search for common ancestor', this.carLog.map(c => c.toString()))
      const newCarLog = [...uniqueCids([meta.car, ...this.carLog, ...carHeader.cars])]
      this.carLog = newCarLog
      console.log('not ff new carLog', this.carLog.map(c => c.toString()))

      void this.getMoreReaders(carHeader.cars)
      // console.log('local car log', this.carLog.map(c => c.toString()))
      // console.log('remote car log', remoteCarLog.map(c => c.toString()))
      // console.log('remote meta', meta)
      console.log('_applyCarHeader m2', meta)
      await this._applyCarHeader(carHeader)
    }
  }

  protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
    const { key } = meta
    if (key) {
      await this.setKey(key)
    }
  }

  async loadCarHeaderFromMeta(meta: DbMeta): Promise<AnyCarHeader> {
    const { car: cid } = meta
    const reader = await this.loadCar(cid)
    return await parseCarFile(reader)
  }

  // protected async ingestCarHeadFromMeta(meta: DbMeta): Promise < void > {
  //   const carHeader = await this.loadCarHeaderFromMeta(meta)
  //   this.carLog = [meta.car, ...carHeader.cars]
  //   void this.getMoreReaders(carHeader.cars)
  //   console.log('_applyCarHeader i', meta)
  //   await this._applyCarHeader(carHeader)
  //   // return carHeader
  // }

  protected async _applyCarHeader(_carHeader: AnyCarHeader) { }

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
        await this.setKey(randomBytes(32).toString('hex'))
      } else {
        console.warn('missing crypto module, using public mode')
      }
    }
    return this.key
  }

  async commit(t: Transaction, done: IndexerResult | BulkResult, compact: boolean = false): Promise < AnyLink > {
    await this.ready
    const fp = this.makeCarHeader(done, this.carLog, compact)
    const theKey = await this._getKey()
    const { cid, bytes } = theKey ? await encryptedMakeCarFile(theKey, fp, t) : await clearMakeCarFile(fp, t)
    await this.carStore!.save({ cid, bytes })
    await this.remoteCarStore?.save({ cid, bytes })
    if (compact) {
      for (const cid of this.carLog) {
        await this.carStore!.remove(cid)
      }
      this.carLog = [cid]
    } else {
      this.carLog.unshift(cid)
    }
    await this.metaStore!.save({ car: cid, key: theKey || null })
    await this.remoteMetaStore?.save({ car: cid, key: theKey || null })
    return cid
  }

  async getBlock(cid: AnyLink): Promise < AnyBlock | undefined > {
    await this.ready
    const sCid = cid.toString()
    if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid)
    const got = await Promise.any(this.carLog.map(async (carCid) => {
      const reader = await this.carReaders.get(carCid.toString())
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

  protected async initializeStores() {
    const isBrowser = typeof window !== 'undefined'
    // console.log('is browser?', isBrowser)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const module = isBrowser ? await require('./store-browser') : await require('./store-fs')
    if (module) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.metaStore = new module.MetaStore(this.name) as MetaStore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.carStore = new module.DataStore(this) as DataStore
    } else {
      throw new Error('Failed to initialize stores.')
    }
  }

  protected abstract makeCarHeader(_result: BulkResult | IndexerResult, _cars: AnyLink[], _compact: boolean): AnyCarHeader;

  protected async loadCar(cid: AnyLink): Promise < CarReader > {
    if (!this.carReaders.has(cid.toString())) {
      this.carReaders.set(cid.toString(), (async () => {
        if (!this.carStore) throw new Error('car store not initialized')
        let loadedCar: AnyBlock | null = null
        try {
          loadedCar = await this.carStore.load(cid)
        } catch (e) {
          if (this.remoteCarStore) {
            const remoteCar = await this.remoteCarStore.load(cid)
            if (remoteCar) {
              // todo test for this
              await this.carStore.save(remoteCar)
              loadedCar = remoteCar
            }
          }
        }
        if (!loadedCar) throw new Error(`missing car file ${cid.toString()}`)
        const readerP = this.ensureDecryptedReader(await CarReader.fromBytes(loadedCar.bytes)) as Promise<CarReader>
        this.carReaders.set(cid.toString(), readerP)
        return readerP
      })())
    }
    return this.carReaders.get(cid.toString()) as Promise<CarReader>
  }

  protected async ensureDecryptedReader(reader: CarReader) {
    const theKey = await this._getKey()
    if (!theKey) return reader
    const { blocks, root } = await decodeEncryptedCar(theKey, reader)
    return {
      getRoots: () => [root],
      get: blocks.get.bind(blocks)
    }
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

type IndexerResult = CarCommit & IdxMetaMap

export class DbLoader extends Loader {
  // declare ready: Promise<DbCarHeader> // todo this will be a map of headers by branch name

  static defaultHeader = { cars: [], compact: [], head: [] }
  defaultHeader = DbLoader.defaultHeader

  clock: CRDTClock

  constructor(name: string, clock: CRDTClock, opts?: FireproofOptions) {
    super(name, opts)
    this.clock = clock
  }

  protected async _applyCarHeader(carHeader: DbCarHeader) {
    await this.clock.applyHead(null, carHeader.head, [])
  }

  protected makeCarHeader({ head }: BulkResult, cars: AnyLink[], compact: boolean = false): DbCarHeader {
    return compact ? { head, cars: [], compact: cars } : { head, cars, compact: [] }
  }
}
