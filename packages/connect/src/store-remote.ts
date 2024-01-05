/* eslint-disable import/first */
import { DownloadFnParamTypes, UploadDataFnParams } from './types'
import type { AnyBlock, AnyLink, DbMeta } from '@fireproof/encrypted-blockstore'
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from '@fireproof/encrypted-blockstore'
import { Connection } from './connection'
import { validateDataParams, validateMetaParams } from '.'

export type LoadHandler = (dbMetas: DbMeta[]) => Promise<void>

export class RemoteDataStore extends DataStoreBase {
  tag: string = 'remote-data'
  connection: Connection
  type: DownloadFnParamTypes

  constructor(name: string, connection: Connection, type: DownloadFnParamTypes = 'data') {
    super(name)
    this.connection = connection
    this.type = type
  }

  prefix() {
    return `fp.${this.name}`
  }

  async load(carCid: AnyLink): Promise<AnyBlock> {
    const params = {
      type: this.type,
      name: this.prefix(),
      car: carCid.toString()
    }
    validateDataParams(params)
    const bytes = await this.connection.dataDownload(params)
    if (!bytes) throw new Error(`missing remote car ${carCid.toString()}`)
    return { cid: carCid, bytes }
  }

  async save(car: AnyBlock, opts?: { public?: boolean }) {
    const uploadParams: UploadDataFnParams = {
      type: this.type,
      name: this.prefix(),
      car: car.cid.toString(),
      size: car.bytes.length.toString()
    }
    validateDataParams(uploadParams)
    return await this.connection.dataUpload(car.bytes, uploadParams, opts)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async remove(_cid: AnyLink): Promise<void> {
    throw new Error('not implemented')
  }
}

export class RemoteMetaStore extends MetaStoreBase {
  tag: string = 'remote-meta'
  connection: Connection
  subscribers: Map<string, LoadHandler[]> = new Map()

  constructor(name: string, connection: Connection) {
    super(name)
    this.connection = connection
  }

  onLoad(branch: string, loadHandler: LoadHandler): () => void {
    const subscribers = this.subscribers.get(branch) || []
    subscribers.push(loadHandler)
    this.subscribers.set(branch, subscribers)
    return () => {
      const subscribers = this.subscribers.get(branch) || []
      const idx = subscribers.indexOf(loadHandler)
      if (idx > -1) subscribers.splice(idx, 1)
    }
  }

  prefix() {
    return `fp.${this.name}.${this.STORAGE_VERSION}`
  }

  async handleByteHeads(byteHeads: Uint8Array[], branch: string = 'main') {
    const dbMetas = this.dbMetasForByteHeads(byteHeads)
    // console.log('dbMetasForByteHeads notify', dbMetas.map((m) => m.car.toString()))
    const subscribers = this.subscribers.get(branch) || []
    for (const subscriber of subscribers) {
      await subscriber(dbMetas)
    }
    return dbMetas
  }

  async load(branch: string = 'main'): Promise<DbMeta[] | null> {
    // console.log('remote load', branch)
    const params = {
      name: this.prefix(),
      branch
    }
    validateMetaParams(params)
    const byteHeads = await this.connection.metaDownload(params)
    if (!byteHeads) return null
    return this.handleByteHeads(byteHeads, branch)
  }

  async save(meta: DbMeta, branch: string = 'main') {
    // console.log('remote save', branch, meta.car.toString())
    const bytes = new TextEncoder().encode(this.makeHeader(meta))
    const params = { name: this.prefix(), branch }
    validateMetaParams(params)
    const byteHeads = await this.connection.metaUpload(bytes, params)
    if (!byteHeads) return null
    return this.handleByteHeads(byteHeads, branch)
  }

  dbMetasForByteHeads(byteHeads: Uint8Array[]) {
    // console.log('dbMetasForByteHeads', byteHeads)
    return byteHeads.map(bytes => {
      const txt = new TextDecoder().decode(bytes)
      return this.parseHeader(txt)
    })
  }
}
