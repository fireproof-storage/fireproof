import { Base64 } from 'js-base64'
import {
  DownloadMetaFnParams,
  DownloadDataFnParams,
  UploadMetaFnParams,
  UploadDataFnParams
} from './types'
import { Connection, validateDataParams, validateMetaParams } from '@fireproof/connect'
import PartySocket from 'partysocket'

export interface ConnectPartyKitParams {
  name: string
  host: string
}

export class ConnectPartyKit extends Connection {
  name: string
  host: string
  party: PartySocket
  messagePromise: Promise<Uint8Array[]>
  messageResolve?: (value: Uint8Array[] | PromiseLike<Uint8Array[]>) => void

  constructor(params: ConnectPartyKitParams) {
    super()
    this.name = params.name
    this.host = params.host
    this.party = new PartySocket({
      party: 'fireproof',
      host: params.host,
      room: params.name
    })
    
    this.ready = new Promise<void>((resolve, reject) => {
      this.party.addEventListener('open', () => {
        resolve()
      })
    })
    this.messagePromise = new Promise<Uint8Array[]>((resolve, reject) => {
      this.messageResolve = resolve
    })
    // this.ready = this.messagePromise.then(() => {})
    this.party.addEventListener('message', (event: MessageEvent<string>) => {
      const afn = async () => {
        const base64String = JSON.parse(event.data).data
        const uint8ArrayBuffer = Base64.toUint8Array(base64String)
        const eventBlock = await this.decodeEventBlock(uint8ArrayBuffer)
        await this.loader?.ready

        await this.taskManager!.handleEvent(eventBlock)

        // @ts-ignore
        this.messageResolve?.([eventBlock.value.data.dbMeta as Uint8Array])

        // add the cid to our parents so we delete it when we send the update
        this.parents.push(eventBlock.cid)

        this.messagePromise = new Promise<Uint8Array[]>((resolve, reject) => {
          this.messageResolve = resolve
        })
      }
      void afn()
    })
  }

  // async connectStorage() {
  //   throw new Error('not implemented')
  // }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    validateDataParams(params)
    const base64String = Base64.fromUint8Array(bytes)
    let uploadUrl=`${this.host}/parties/fireproof/${this.name}?car=${params.car}`
    const response = await fetch(uploadUrl, { method: 'PUT', body: base64String })
    if(response.status===404)
    {
      throw new Error('Failure in uploading data!')
    }
  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    let uploadUrl=`${this.host}/parties/fireproof/${this.name}?car=${params.car}`
    const response = await fetch(uploadUrl, { method: 'GET'})
    if(response.status===404)
    {
      throw new Error('Failure in downloading data!');
    }
    const base64String = await response.text()
    const data = Base64.toUint8Array(base64String)
    return data
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    validateMetaParams(params)
    await this.ready
    const event = await this.createEventBlock(bytes)
    const base64String = Base64.fromUint8Array(event.bytes)
    const partyMessage = {
      data: base64String,
      cid: event.cid.toString(),
      parents: this.parents.map(p => p.toString())
    }
    // console.log('Sending message', partyMessage)
    this.party.send(JSON.stringify(partyMessage))
    this.parents = [event.cid]
    return null
  }

  async metaDownload(params: DownloadMetaFnParams) {
    validateMetaParams(params)
    const datas = await this.messagePromise
    return datas
  }
}
