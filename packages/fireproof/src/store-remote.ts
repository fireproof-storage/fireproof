/* eslint-disable import/first */
// console.log('import store-s3')

import { AnyBlock, AnyLink, Connection, DbMeta, UploadFnParams } from './types'
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from './store'

// import type { Response } from 'cross-fetch'

export class RemoteDataStore extends DataStoreBase {
  tag: string = 'car-browser-s3'
  connection: Connection

  prefix: string
  keyId: string = 'public' // faciliates removal of unreadable cars

  constructor(name: string, connection: Connection) {
    super(name)
    this.prefix = `fp.${this.name}.${this.STORAGE_VERSION}.${this.keyId}.`
    this.connection = connection
  }

  async load(carCid: AnyLink): Promise<AnyBlock> {
    const bytes = await this.connection.download({
      type: 'data',
      name: this.prefix,
      car: carCid.toString()
    })
    if (!bytes) throw new Error(`missing remote car ${carCid.toString()}`)
    return { cid: carCid, bytes }
  }

  async save(car: AnyBlock): Promise<void> {
    const uploadParams: UploadFnParams = {
      type: 'data',
      name: this.prefix,
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
  prefix: string

  constructor(name: string, connection: Connection) {
    super(name)
    this.prefix = `fp.${this.name}.${this.STORAGE_VERSION}`
    this.connection = connection
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = 'main'): Promise<DbMeta | null> {
    const bytes = await this.connection.download({
      type: 'meta',
      name: this.prefix,
      branch
    })
    if (!bytes) return null
    return this.parseHeader(new TextDecoder().decode(bytes))
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = 'main'): Promise<void> {
    const bytes = new TextEncoder().encode(this.makeHeader(meta))
    const uploadParams = {
      type: 'meta',
      name: this.prefix,
      branch,
      size: bytes.length.toString()
    }
    await this.connection.upload(bytes, uploadParams as UploadFnParams)
  }
}
