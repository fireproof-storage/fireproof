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
  messagePromise: Promise<Uint8Array>;
  messageResolve?: (value: Uint8Array | PromiseLike<Uint8Array>) => void;

  constructor(params: ConnectPartyKitParams) {
    super()
    this.name = params.name;
    this.host = params.host;
    this.party = new PartySocket({
      host: params.host,
      room: `fireproof:${params.name}`
    });
    this.ready = new Promise<void>((resolve, reject) => {
      this.party.addEventListener("open", () => {
        resolve();
      });

    });
    this.messagePromise = new Promise<Uint8Array>((resolve, reject) => {
      this.messageResolve = resolve;
    });
    this.party.addEventListener("message", (event) => {
      const base64String = event.data;
      const binaryString = atob(base64String);
      const len = binaryString.length;
      const uint8version = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        uint8version[i] = binaryString.charCodeAt(i);
      }
      this.loader?.remoteMetaStore?.handleByteHeads([uint8version])
      this.messageResolve?.(uint8version)
      this.messagePromise = new Promise<Uint8Array>((resolve, reject) => {
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
    let base64String = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    this.party.send(base64String);
    return null
  }

  async metaDownload(params: DownloadMetaFnParams) {
    validateMetaParams(params)
    const data = await this.messagePromise;
    return [data]
  }
}
