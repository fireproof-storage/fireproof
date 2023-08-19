/* eslint-disable import/first */
// console.log('import store-s3')

import { AnyBlock, AnyLink, DbMeta } from './types'
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from './store'

import fetch from 'cross-fetch'
// import type { Response } from 'cross-fetch'

export class DataStore extends DataStoreBase {
  tag: string = 'car-browser-s3'
  put: URL
  get: URL
  prefix: string
  keyId: string = 'public' // faciliates removal of unreadable cars

  constructor(name: string, { put, get }: { put: string, get: string }) {
    super(name)
    this.prefix = `fp.${this.name}.${this.STORAGE_VERSION}.${this.keyId}.`
    this.put = new URL(put)
    this.get = new URL(get)
  }

  async load(carCid: AnyLink): Promise<AnyBlock> {
    const response = await fetch(new URL(`data/${this.prefix}/${carCid.toString()}.car`, this.get))
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { cid: carCid, bytes }
  }

  async save(car: AnyBlock): Promise<void> {
    const uploadParams = {
      type: 'data',
      name: this.prefix,
      car: car.cid.toString(),
      size: car.bytes.length.toString()
    }
    const response = await fetch(new URL(`${this.put.toString()}?${new URLSearchParams(uploadParams).toString()}`))
    const { uploadURL } = await response.json() as { uploadURL: string}
    await fetch(uploadURL, { method: 'PUT', body: car.bytes })
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async remove(_cid: AnyLink): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    throw new Error('not implemented')
  }
}

export class MetaStore extends MetaStoreBase {
  tag: string = 'header-browser-ls'
  put: URL
  get: URL
  prefix: string

  constructor(name: string, { put, get }: { put: string, get: string }) {
    super(name)
    this.prefix = `fp.${this.name}.${this.STORAGE_VERSION}`
    this.put = new URL(put)
    this.get = new URL(get)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = 'main'): Promise<DbMeta | null> {
    const response = await fetch(new URL(`meta/${this.prefix}/${branch}.json`, this.get))
    const bytes = await response.text()
    if (!bytes) return null
    return this.parseHeader(bytes)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = 'main'): Promise<void> {
    const bytes = this.makeHeader(meta)
    const uploadParams = {
      type: 'meta',
      name: this.prefix,
      branch,
      size: bytes.length.toString()
    }
    const response = await fetch(new URL(`${this.put.toString()}?${new URLSearchParams(uploadParams).toString()}`))
    const { uploadURL } = await response.json() as { uploadURL: string}
    await fetch(uploadURL, { method: 'PUT', body: bytes })
  }
}
