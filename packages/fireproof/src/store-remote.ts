/* eslint-disable import/first */
// console.log('import store-s3')

import { AnyBlock, AnyLink, DbMeta, DownloadFn, UploadFn, UploadFnParams } from './types'
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from './store'

import fetch from 'cross-fetch'
// import type { Response } from 'cross-fetch'

export class DataStore extends DataStoreBase {
  tag: string = 'car-browser-s3'
  upload: UploadFn
  download: DownloadFn
  prefix: string
  keyId: string = 'public' // faciliates removal of unreadable cars

  constructor(name: string, { upload, download }: { upload: UploadFn, download: DownloadFn }) {
    super(name)
    this.prefix = `fp.${this.name}.${this.STORAGE_VERSION}.${this.keyId}.`
    this.upload = upload
    this.download = download
  }

  async load(carCid: AnyLink): Promise<AnyBlock> {
    const response = await fetch(new URL(`data/${this.prefix}/${carCid.toString()}.car`, this.download))
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { cid: carCid, bytes }
  }

  async save(car: AnyBlock): Promise<void> {
    const uploadParams: UploadFnParams = {
      type: 'data',
      name: this.prefix,
      car: car.cid.toString(),
      size: car.bytes.length.toString()
    }
    await this.upload(car.bytes, uploadParams)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async remove(_cid: AnyLink): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    throw new Error('not implemented')
  }
}

export class MetaStore extends MetaStoreBase {
  tag: string = 'header-browser-ls'
  upload: URL
  download: URL
  prefix: string

  constructor(name: string, { upload, download }: { upload: string, download: string }) {
    super(name)
    this.prefix = `fp.${this.name}.${this.STORAGE_VERSION}`
    this.upload = new URL(upload)
    this.download = new URL(download)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = 'main'): Promise<DbMeta | null> {
    const response = await fetch(new URL(`meta/${this.prefix}/${branch}.json`, this.download))
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
    const response = await fetch(new URL(`${this.upload.toString()}?${new URLSearchParams(uploadParams).toString()}`))
    const { uploadURL } = await response.json() as { uploadURL: string }
    await fetch(uploadURL, { method: 'PUT', body: bytes })
  }
}
