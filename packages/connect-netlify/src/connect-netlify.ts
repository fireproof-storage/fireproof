import { Base64 } from 'js-base64'
import {
  DownloadMetaFnParams,
  DownloadDataFnParams,
  UploadMetaFnParams,
  UploadDataFnParams
} from './types'
import { Connection, validateDataParams, validateMetaParams } from '@fireproof/connect'

export interface ConnectNetlifyParams {
  name: string
}

export class ConnectNetlify extends Connection {
  name: string

  constructor(params: ConnectNetlifyParams) {
    super()
    this.name = params.name
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    validateDataParams(params)
    const fetchUploadUrl = new URL(`/fireproof?car=${params.car}`, document.location.origin)
    const base64String = Base64.fromUint8Array(bytes)
    const done = await fetch(fetchUploadUrl, { method: 'PUT', body: base64String })
    if (!done.ok) throw new Error('failed to upload data ' + done.statusText)
  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    const fetchDownloadUrl = new URL(`/fireproof?car=${params.car}`, document.location.origin)
    const response = await fetch(fetchDownloadUrl)
    if (!response.ok) throw new Error('failed to download data ' + response.statusText)
    const base64String = await response.text()
    const data = Base64.toUint8Array(base64String)
    return data
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | null> {
    validateMetaParams(params)
    // Implement your logic here
    throw new Error('not implemented')
  }

  async metaDownload(params: DownloadMetaFnParams) {
    validateMetaParams(params)
    throw new Error('not implemented')
    return null
  }
}
