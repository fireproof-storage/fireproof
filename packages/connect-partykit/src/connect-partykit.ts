import { decodeEventBlock } from '@alanshaw/pail/clock';
import { Base64 } from 'js-base64';
import { DownloadMetaFnParams, DownloadDataFnParams, UploadMetaFnParams, UploadDataFnParams } from './types'
import { Connection, validateDataParams, validateMetaParams } from '@fireproof/connect'
import PartySocket from "partysocket";

export interface ConnectPartyKitParams {
  name: string;
  host: string;
}

export class ConnectPartyKit extends Connection {
  name: string;
  host: string;
  party: PartySocket;
  messagePromise: Promise<Uint8Array[]>;
  messageResolve?: (value: Uint8Array[] | PromiseLike<Uint8Array[]>) => void;

  constructor(params: ConnectPartyKitParams) {
    super()
    this.name = params.name;
    this.host = params.host;
    this.party = new PartySocket({
      party: 'fireproof',
      host: params.host,
      room: `fireproof:${params.name}`
    });
    this.ready = new Promise<void>((resolve, reject) => {
      this.party.addEventListener("open", () => {
        resolve();
      });

    });
    this.messagePromise = new Promise<Uint8Array[]>((resolve, reject) => {
      this.messageResolve = resolve;
    });
    this.party.addEventListener("message", async (event) => {
      const base64String = event.data;
      const uint8ArrayBuffer = Base64.toUint8Array(base64String);
      const eventBlock = await decodeEventBlock(uint8ArrayBuffer);
      await this.loader?.ready
      // @ts-ignore
      this.loader?.remoteMetaStore?.handleByteHeads([eventBlock.value.data.dbMeta as Uint8Array])
      // @ts-ignore
      this.messageResolve?.([eventBlock.value.data.dbMeta as Uint8Array])
      this.messagePromise = new Promise<Uint8Array[]>((resolve, reject) => {
        this.messageResolve = resolve;
      });
    });
  }

  async connectStorage() {
    throw new Error('not implemented')
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    validateDataParams(params)
    throw new Error('not implemented')
  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    throw new Error('not implemented')
    return null
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    validateMetaParams(params)
    await this.ready
    const event = await this.createEventBlock(bytes)
    let base64String = Base64.fromUint8Array(event.bytes);
    this.party.send(base64String);
    this.parents = [event.cid]
    return null
  }

  async metaDownload(params: DownloadMetaFnParams) {
    validateMetaParams(params)
    const datas = await this.messagePromise;
    return datas
  }
}
