/* eslint-disable import/first */
// console.log('import store-s3')

import { AnyBlock, AnyLink, Connection, DbMeta, DownloadFnParamTypes, UploadDataFnParams, UploadMetaFnParams } from './types'
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from './store'
import type { Loader } from './loader'
// import type { Response } from 'cross-fetch'

export class RemoteDataStore extends DataStoreBase {
  tag: string = 'car-browser-s3'
  connection: Connection
  type: DownloadFnParamTypes

  constructor(loader: Loader, connection: Connection, type: DownloadFnParamTypes = 'data') {
    super(loader)
    this.connection = connection
    this.type = type
  }

  prefix() {
    return `fp.${this.loader.name}.${this.STORAGE_VERSION}.${this.loader.keyId}`
  }

  async load(carCid: AnyLink): Promise<AnyBlock> {
    const bytes = await this.connection.dataDownload({
      type: this.type,
      name: this.prefix(),
      car: carCid.toString()
    })
    if (!bytes) throw new Error(`missing remote car ${carCid.toString()}`)
    return { cid: carCid, bytes }
  }

  async save(car: AnyBlock): Promise<void> {
    const uploadParams: UploadDataFnParams = {
      type: this.type,
      name: this.prefix(),
      car: car.cid.toString(),
      size: car.bytes.length.toString()
    }
    await this.connection.dataUpload(car.bytes, uploadParams)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async remove(_cid: AnyLink): Promise<void> {
    throw new Error('not implemented')
  }
}

export class RemoteMetaStore extends MetaStoreBase {
  tag: string = 'header-browser-ls'
  connection: Connection

  constructor(name: string, connection: Connection) {
    super(name)
    this.connection = connection
  }

  prefix() {
    return `fp.${this.name}.${this.STORAGE_VERSION}`
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = 'main'): Promise<DbMeta[] | null> {
    try {
      // console.log('metaDownload')
      const byteHeads = await this.connection.metaDownload({
        name: this.prefix(),
        branch
      })
      // console.log('byteHeads', byteHeads?.length, byteHeads && byteHeads[0])
      if (!byteHeads) return null
      const dbMetas = byteHeads.map((bytes) => {
        const txt = new TextDecoder().decode(bytes)
        // console.log('txt', txt)
        return this.parseHeader(txt)
      })
      console.log('dbMetas', dbMetas.length, dbMetas)
      return dbMetas
    } catch (e) {
      return null
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = 'main'): Promise<void> {
    const bytes = new TextEncoder().encode(this.makeHeader(meta))
    const uploadParams: UploadMetaFnParams = {
      name: this.prefix(),
      branch
    }
    await this.connection.metaUpload(bytes, uploadParams)
  }
}
