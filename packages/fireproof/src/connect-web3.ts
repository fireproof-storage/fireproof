/* eslint-disable import/first */
// console.log('import store-s3')

import { Connection, DownloadFnParams, UploadFnParams } from './types'
import { validateParams } from './connect'

export class ConnectWeb3 implements Connection {
  email: string
  ready: Promise<any>

  constructor(email: string) {
    this.email = email
    this.ready = this.initializeClient()
  }

  async initializeClient() {

  }

  async upload(bytes: Uint8Array, params: UploadFnParams) {
    validateParams(params)
    // const fetchUploadUrl = new URL(`${this.uploadUrl.toString()}?${new URLSearchParams(params).toString()}`)
    // const response = await fetch(fetchUploadUrl)
    // const { uploadURL } = await response.json() as { uploadURL: string }
    // await fetch(uploadURL, { method: 'PUT', body: bytes })
  }

  async download(params: DownloadFnParams) {
    validateParams(params)
    const { type, name, car, branch } = params
    // const fetchFromUrl = new URL(`${type}/${name}/${type === 'meta'
    //   ? branch + '.json?cache=' + Math.floor(Math.random() * 1000000)
    //   : car + '.car'}`, this.downloadUrl)
    // const response = await fetch(fetchFromUrl)
    // const bytes = new Uint8Array(await response.arrayBuffer())
    // return bytes
    return new Uint8Array()
  }
}
