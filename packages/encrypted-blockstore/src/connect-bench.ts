import {
    DownloadMetaFnParams,
    DownloadDataFnParams,
    UploadMetaFnParams,
    UploadDataFnParams
} from './types'
import { Connection } from './connection'

export class ConnectBench extends Connection {
    data: Map<string, Uint8Array>
    meta: Map<string, string>

    constructor(other?: ConnectBench) {
        super()
        if (other !== undefined) {
            this.data = other.data
            this.meta = other.meta
        } else {
            this.data = new Map<string,Uint8Array>
            this.meta = new Map<string, string>
        }
    }

    async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
        const carCid = params.car.toString()
        this.data.set(carCid, bytes)
    }

    async dataDownload(params: DownloadDataFnParams) {
        const carCid = params.car.toString()
        return Promise.resolve(this.data.get(carCid)!)
    }

    async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
        const event = await this.createEventBlock(bytes)
        this.data.set(event.cid.toString(), bytes)
        this.meta.set('db', event.cid.toString())
        return null
    }

    async metaDownload(params: DownloadMetaFnParams) {
        let metaCID = this.meta.get('db')
        if (metaCID == undefined) {
            return Promise.resolve([])
        }
        const bytes = this.data.get(metaCID)
        const rv: Uint8Array[] = [bytes!]
        return Promise.resolve(rv)
    }
}
