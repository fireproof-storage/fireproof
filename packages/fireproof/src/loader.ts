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
import { CRDTClock } from './crdt'

export abstract class Loader {
  name: string
  opts: FireproofOptions = {}

  remoteMetaLoading: Promise<void> | undefined
  remoteMetaStore: MetaStore | undefined
  remoteCarStore: DataStore | undefined
  metaStore: MetaStore | undefined
  carStore: DataStore | undefined
  carLog: AnyLink[] = []
  carReaders: Map<string, CarReader> = new Map()
  ready: Promise<AnyCarHeader>
  key: string | undefined
  keyId: string | undefined

  static defaultHeader: AnyCarHeader
  abstract defaultHeader: AnyCarHeader

  constructor(name: string, opts?: FireproofOptions) {
    this.name = name
    this.opts = opts || this.opts
    this.ready = this.initializeStores().then(async () => {
      if (!this.metaStore || !this.carStore) throw new Error('stores not initialized')
      const meta = await this.metaStore.load('main')
      if (!meta) {
        // await this._getKey() // generate a random key
        return this.defaultHeader
      }
      await this.ingestKeyFromMeta(meta)
      return await this.ingestCarHeadFromMeta(meta)
    })
  }

  connectRemote(connection: Connection) {
    this.remoteMetaStore = new RemoteMetaStore(this.name, connection)
    this.remoteCarStore = new RemoteDataStore(this, connection)
    this.remoteMetaLoading = this.remoteMetaStore.load('main').then(async (meta) => {
      console.log('remoteMeta', meta)
      if (meta) {
        await this.ingestKeyFromMeta(meta)
        await this.ingestCarHeadFromMeta(meta, { merge: true })
      }
    })
    connection.ready = Promise.all([this.ready, this.remoteMetaLoading])
  }

  protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
    const { key } = meta
    if (key) {
      await this.setKey(key)
    }
  }

  protected async ingestCarHeadFromMeta(meta: DbMeta, opts = { merge: false }): Promise<AnyCarHeader> {
    const { car: cid } = meta
    const reader = await this.loadCar(cid)
    this.carLog = opts.merge ? [cid, ...this.carLog] : [cid]
    // this.carLog = opts.merge ? [...new Set([cid, ...this.carLog])] : [cid] // this.carLog.push(cid)
    const carHeader = await parseCarFile(reader)
    await this.getMoreReaders(carHeader.cars)
    this._applyHeader(carHeader)
    return carHeader
  }

  protected _applyHeader(carHeader: AnyCarHeader) {
    console.log('applyHeader', carHeader)
  }

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

  async commit(t: Transaction, done: IndexerResult | BulkResult, compact: boolean = false): Promise<AnyLink> {
    await this.ready
    const fp = this.makeCarHeader(done, this.carLog, compact)
    const theKey = await this._getKey()
    const { cid, bytes } = theKey ? await encryptedMakeCarFile(theKey, fp, t) : await clearMakeCarFile(fp, t)
    await this.carStore!.save({ cid, bytes })
    console.log('remoteCarStore?.save', cid.toString())
    await this.remoteCarStore?.save({ cid, bytes })
    if (compact) {
      for (const cid of this.carLog) {
        await this.carStore!.remove(cid)
      }
      this.carLog.splice(0, this.carLog.length, cid)
    } else {
      this.carLog.push(cid)
    }
    await this.metaStore!.save({ car: cid, key: theKey || null })
    console.log('remoteMetaStore?.save', cid.toString(), theKey)
    await this.remoteMetaStore?.save({ car: cid, key: theKey || null })
    return cid
  }

  async getBlock(cid: CID): Promise<AnyBlock | undefined> {
    await this.ready
    for (const [, reader] of [...this.carReaders]) {
      const block = await reader.get(cid)
      if (block) {
        return block
      }
    }
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

  protected async loadCar(cid: AnyLink): Promise<CarReader> {
    if (!this.metaStore || !this.carStore) throw new Error('stores not initialized')
    if (this.carReaders.has(cid.toString())) return this.carReaders.get(cid.toString()) as CarReader
    const car = await this.carStore.load(cid)
    // const car = await Promise.any([this.carStore.load(cid), this.remoteCarStore?.load(cid)])
    if (!car) throw new Error(`missing car file ${cid.toString()}`)
    const reader = await this.ensureDecryptedReader(await CarReader.fromBytes(car.bytes)) as CarReader
    this.carReaders.set(cid.toString(), reader)
    this.carLog.push(cid)
    return reader
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
    if (this.key && this.key !== key) throw new Error('key already set')
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
  declare ready: Promise<IdxCarHeader>

  static defaultHeader = { cars: [], compact: [], indexes: new Map() as Map<string, IdxMeta> }
  defaultHeader = IdxLoader.defaultHeader

  protected makeCarHeader({ indexes }: IndexerResult, cars: AnyLink[], compact: boolean = false): IdxCarHeader {
    return compact ? { indexes, cars: [], compact: cars } : { indexes, cars, compact: [] }
  }
}

type IndexerResult = CarCommit & IdxMetaMap

export class DbLoader extends Loader {
  declare ready: Promise<DbCarHeader> // todo this will be a map of headers by branch name

  static defaultHeader = { cars: [], compact: [], head: [] }
  defaultHeader = DbLoader.defaultHeader

  clock: CRDTClock

  constructor(name: string, clock: CRDTClock, opts?: FireproofOptions) {
    super(name, opts)
    this.clock = clock
  }

  protected _applyHeader(carHeader: DbCarHeader) {
    this.clock.applyHead(carHeader.head)
    // this.clock.head = carHeader.head
  }

  protected makeCarHeader({ head }: BulkResult, cars: AnyLink[], compact: boolean = false): DbCarHeader {
    return compact ? { head, cars: [], compact: cars } : { head, cars, compact: [] }
  }
}
