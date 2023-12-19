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
    const event = await this.createEventBlock(bytes)
    const base64String = Base64.fromUint8Array(event.bytes)

    const crdtEntry = {
      cid: event.cid.toString(),
      data: base64String,
      parents: this.parents.map((p) => p.toString())
    }
    const fetchUploadUrl = new URL(`/fireproof?meta=${params.name}`, document.location.origin)

    const done = await fetch(fetchUploadUrl, { method: 'PUT', body: JSON.stringify(crdtEntry) })

    if (!done.ok) throw new Error('failed to upload meta ' + done.statusText)

    this.parents = [event.cid]

    return null
  }

  async metaDownload(params: DownloadMetaFnParams) {
    validateMetaParams(params)
    const fetchDownloadUrl = new URL(`/fireproof?meta=${params.name}`, document.location.origin)
    const response = await fetch(fetchDownloadUrl)
    if (!response.ok) throw new Error('failed to download meta ' + response.statusText)
    const crdtEntries = await response.json()

    const events = await Promise.all(
      crdtEntries.map(async (entry: any) => {
        const base64String = entry.data
        const bytes = Base64.toUint8Array(base64String)
        const event = this.decodeEventBlock(bytes)
        return event
      })
    )
    const cids = events.map((e) => e.cid)
    this.parents = [...new Set([...this.parents, ...cids])]
    return null
  }
}
