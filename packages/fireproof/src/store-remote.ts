/* eslint-disable import/first */
// console.log('import store-s3')

import { AnyBlock, AnyLink, Connection, DbMeta, UploadFnParams } from './types'
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from './store'
import type { Loader } from './loader'
// import type { Response } from 'cross-fetch'

export class RemoteDataStore extends DataStoreBase {
  tag: string = 'car-browser-s3'
  connection: Connection

  constructor(loader: Loader, connection: Connection) {
    super(loader)
    this.connection = connection
  }

  prefix() {
    return `fp.${this.loader.name}.${this.STORAGE_VERSION}.${this.loader.keyId}`
  }

  async load(carCid: AnyLink): Promise<AnyBlock> {
    console.log('load car', carCid.toString())
    const bytes = await this.connection.download({
      type: 'data',
      name: this.prefix(),
      car: carCid.toString()
    })
    if (!bytes) throw new Error(`missing remote car ${carCid.toString()}`)
    return { cid: carCid, bytes }
  }

  async save(car: AnyBlock): Promise<void> {
    const uploadParams: UploadFnParams = {
      type: 'data',
      name: this.prefix(),
      car: car.cid.toString(),
      size: car.bytes.length.toString()
    }
    await this.connection.upload(car.bytes, uploadParams)
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
  async load(branch: string = 'main'): Promise<DbMeta | null> {
    const bytes = await this.connection.download({
      type: 'meta',
      name: this.prefix(),
      branch
    })
    if (!bytes) return null
    try {
      return this.parseHeader(new TextDecoder().decode(bytes))
    } catch (e) {
      return null
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = 'main'): Promise<void> {
    const bytes = new TextEncoder().encode(this.makeHeader(meta))
    const uploadParams = {
      type: 'meta',
      name: this.prefix(),
      branch,
      size: bytes.length.toString()
    }
    await this.connection.upload(bytes, uploadParams as UploadFnParams)
  }
}
