/* eslint-disable import/first */
// console.log('import store-s3')

import { Connection, DownloadFnParams, UploadFnParams } from './types'
import fetch from 'cross-fetch'
import { validateParams } from './connect'

export class ConnectS3 implements Connection {
  uploadUrl: URL
  downloadUrl: URL
  ready: Promise<any> = Promise.resolve()

  constructor(upload: string, download: string) {
    this.uploadUrl = new URL(upload)
    this.downloadUrl = new URL(download)
  }

  async upload(bytes: Uint8Array, params: UploadFnParams) {
    validateParams(params)
    const fetchUploadUrl = new URL(`${this.uploadUrl.toString()}?${new URLSearchParams(params).toString()}`)
    const response = await fetch(fetchUploadUrl)
    const { uploadURL } = await response.json() as { uploadURL: string }
    await fetch(uploadURL, { method: 'PUT', body: bytes })
  }

  async download(params: DownloadFnParams) {
    validateParams(params)
    const { type, name, car, branch } = params
    const fetchFromUrl = new URL(`${type}/${name}/${type === 'meta'
      ? branch + '.json?cache=' + Math.floor(Math.random() * 1000000)
      : car + '.car'}`, this.downloadUrl)
    const response = await fetch(fetchFromUrl)
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes
  }
}
