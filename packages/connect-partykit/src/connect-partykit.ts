import { Base64 } from 'js-base64'
import {
  DownloadMetaFnParams,
  DownloadDataFnParams,
  UploadMetaFnParams,
  UploadDataFnParams
} from './types'
import { Connection } from '@fireproof/connect'
import PartySocket from 'partysocket'
import type { Loader } from '@fireproof/encrypted-blockstore'

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
    
  }

  async onConnect() {
    console.log('onConnect')
    if (!this.loader || !this.taskManager) { throw new Error('loader and taskManager must be set') }
    this.party.addEventListener('message', (event: MessageEvent<string>) => {
      console.log('Received message', event.data.length)
      const afn = async () => {
        const base64String = event.data
        const uint8ArrayBuffer = Base64.toUint8Array(base64String)
        const eventBlock = await this.decodeEventBlock(uint8ArrayBuffer)
        console.log('Received event', this.loader?.ready, this.loader)
        // await this.loader?.ready
        console.log('Handling event', eventBlock.cid.toString(), this.taskManager, this.loader)
        await this.taskManager!.handleEvent(eventBlock)

        // @ts-ignore
        this.messageResolve?.([eventBlock.value.data.dbMeta as Uint8Array])

        // add the cid to our parents so we delete it when we send the update
        this.parents.push(eventBlock.cid)

        setTimeout(() => {
        this.messagePromise = new Promise<Uint8Array[]>((resolve, reject) => {
          this.messageResolve = resolve
        })
      }, 0)
      }
      void afn()
    })
  }

  // async connectMeta({ loader }: { loader: Loader }) {
  //   super({ loader })
  // }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    // const base64String = Base64.fromUint8Array(bytes)
    let uploadUrl = `${this.host}/parties/fireproof/${this.name}?car=${params.car}`
    const response = await fetch(uploadUrl, { method: 'PUT', body: bytes })
    if (response.status === 404) {
      throw new Error('Failure in uploading data!')
    }
  }

  async dataDownload(params: DownloadDataFnParams) {
    let uploadUrl = `${this.host}/parties/fireproof/${this.name}?car=${params.car}`
    const response = await fetch(uploadUrl, { method: 'GET' })
    if (response.status === 404) {
      throw new Error('Failure in downloading data!')
    }
    const data = await response.arrayBuffer()
    // const data = Base64.toUint8Array(base64String)
    return new Uint8Array(data)
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
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
    console.log('metaDownload', this.messagePromise)
    const datas = await this.messagePromise
    console.log('metaDownload', datas)
    return datas
  }
}
