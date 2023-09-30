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
      party: 'fireproof',
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
      let binaryString = "";
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let padding = 0;
      for (let i = 0; i < base64String.length; i += 4) {
        const index1 = chars.indexOf(base64String[i]);
        const index2 = chars.indexOf(base64String[i + 1]);
        const index3 = chars.indexOf(base64String[i + 2]);
        const index4 = chars.indexOf(base64String[i + 3]);

        const bin = (index1 << 18) | (index2 << 12) | (index3 << 6) | index4;

        binaryString += String.fromCharCode((bin >> 16) & 255);
        if (base64String[i + 2] !== '=') binaryString += String.fromCharCode((bin >> 8) & 255);
        if (base64String[i + 3] !== '=') binaryString += String.fromCharCode(bin & 255);

        if (base64String[i + 2] === '=') padding++;
        if (base64String[i + 3] === '=') padding++;
      }
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
    let base64String = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const padding = bytes.length % 3;
    for (let i = 0; i < bytes.length; i += 3) {
      let combined = bytes[i] << 16 | (bytes[i + 1] || 0) << 8 | (bytes[i + 2] || 0);
      base64String += characters[combined >> 18] + characters[(combined >> 12) & 63] + (bytes[i + 1] ? characters[(combined >> 6) & 63] : '=') + (bytes[i + 2] ? characters[combined & 63] : '=');
    }
    if (padding === 2) base64String = base64String.substring(0, base64String.length - 2) + '==';
    else if (padding === 1) base64String = base64String.substring(0, base64String.length - 1) + '=';
    this.party.send(base64String);
    return null
  }

  async metaDownload(params: DownloadMetaFnParams) {
    validateMetaParams(params)
    const data = await this.messagePromise;
    return [data]
  }
}
