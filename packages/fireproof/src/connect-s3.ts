import { Connection, DownloadMetaFnParams, DownloadDataFnParams, UploadMetaFnParams, UploadDataFnParams } from './types'
import fetch from 'cross-fetch'
import { validateDataParams, validateMetaParams } from './connect'

export class ConnectS3 implements Connection {
  uploadUrl: URL
  downloadUrl: URL
  ready: Promise<any> = Promise.resolve()

  constructor(upload: string, download: string) {
    this.uploadUrl = new URL(upload)
    this.downloadUrl = new URL(download)
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    validateDataParams(params)
    console.log('s3 uploading', params)
    const fetchUploadUrl = new URL(`${this.uploadUrl.toString()}?${new URLSearchParams(params).toString()}`)
    const response = await fetch(fetchUploadUrl)
    const { uploadURL } = await response.json() as { uploadURL: string }
    await fetch(uploadURL, { method: 'PUT', body: bytes })
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    validateMetaParams(params)
    console.log('s3 uploading', params)
    const fetchUploadUrl = new URL(`${this.uploadUrl.toString()}?${new URLSearchParams(params).toString()}`)
    const response = await fetch(fetchUploadUrl)
    const { uploadURL } = await response.json() as { uploadURL: string }
    await fetch(uploadURL, { method: 'PUT', body: bytes })
    return null
  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    console.log('s3 downloading', params)
    const { type, name, car } = params
    const fetchFromUrl = new URL(`${type}/${name}/${car}.car`, this.downloadUrl)
    const response = await fetch(fetchFromUrl)
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes
  }

  async metaDownload(params: DownloadMetaFnParams) {
    validateMetaParams(params)
    console.log('s3 downloading', params)
    const { name, branch } = params
    const fetchFromUrl = new URL(`meta/${name}/${branch + '.json?cache=' + Math.floor(Math.random() * 1000000)}`, this.downloadUrl)
    const response = await fetch(fetchFromUrl)
    const bytes = new Uint8Array(await response.arrayBuffer())
    // todo we could use a range list to make mvcc / crdt logic work in the s3 bucket
    // we would name the meta files with a timestamp, eg using our UUIDv7 library
    return [bytes]
  }
}
