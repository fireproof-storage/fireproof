import { decodeEventBlock } from '@alanshaw/pail/clock'
import { Base64 } from 'js-base64'
import {
  DownloadMetaFnParams,
  DownloadDataFnParams,
  UploadMetaFnParams,
  UploadDataFnParams
} from './types'
import { Connection, validateDataParams, validateMetaParams } from '@fireproof/connect'
import PartySocket from 'partysocket'
import { TaskManager, DbMetaEventBlock } from './task-manager'

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
  taskManager: TaskManager = new TaskManager()

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
        const base64String = event.data
        const uint8ArrayBuffer = Base64.toUint8Array(base64String)
        const eventBlock = await decodeEventBlock(uint8ArrayBuffer)
        await this.loader?.ready

        await this.taskManager.handleEvent(eventBlock as DbMetaEventBlock, this.loader!)

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
    // throw new Error('not implemented')
    //Implementing data upload so that it uses partykit server's persistent storage
    //This is different from meta upload in the sense that here we are not using a websocket connection instead using HTTP requests

    //Step-1 Prepare the data
    //This step is taken from the connect-netlify script
    //Maybe try putting the bytes through instead of encoding it into Base64
    const base64String = Base64.fromUint8Array(bytes)

    //Step-2 Find the right URL
    const protocol = this.host.startsWith("localhost") ? "http" : null;
    let uploadUrl=`${this.host}/parties/fireproof/${this.name}?car=${params.car}`

    //Step-3 Send the data using fetch API's PUT request
    const done = await fetch(uploadUrl, { method: 'PUT', body: base64String })
    if(done.status===404)
    {
      throw new Error('Failure in uploading data!');
    }

  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    // throw new Error('not implemented')
    // return null

    //For downloading again we make use of the same URL to make a GET request
    const protocol = this.host.startsWith("localhost") ? "http" : "https";
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
