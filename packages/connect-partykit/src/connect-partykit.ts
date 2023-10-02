import { decodeEventBlock, EventBlock } from '@alanshaw/pail/clock';
import { Base64 } from 'js-base64';
import { DownloadMetaFnParams, DownloadDataFnParams, UploadMetaFnParams, UploadDataFnParams } from './types'
import { Connection, validateDataParams, validateMetaParams } from '@fireproof/connect'
import PartySocket from "partysocket";
import { AnyLink, Loader } from '@fireproof/core';

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
  taskManager: TaskManager = new TaskManager();

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

      await this.taskManager.handleEvent(eventBlock as DbMetaEventBlock, this.loader!);


      // once our task is done, resolve the promise:
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

type DbMetaEventBlock = EventBlock<{ dbMeta: Uint8Array }>

class TaskManager {
  private eventsWeHandled: Set<string> = new Set();
  private queue: any[] = [];
  private isProcessing: boolean = false;

  async handleEvent(eventBlock: DbMetaEventBlock, loader: Loader) {
    const cid = eventBlock.cid.toString();
    const parents = eventBlock.value.parents.map((cid: AnyLink) => cid.toString());
    console.log('partns', cid, parents)
    // Remove parent events
    for (const parent of parents) {
      this.eventsWeHandled.add(parent);
    }

    // Add event to queue
    this.queue.push({ cid, eventBlock, loader });

    // Start processing queue if not already doing so
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
  private async processQueue() {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const { cid, eventBlock, loader } = this.queue.shift();

      if (this.eventsWeHandled.has(cid)) {
        console.log('sckip event', cid.toString())
        continue;
      }

      // Handle event
      // @ts-ignore
      console.log('handle clock event', cid.toString())
      await loader?.remoteMetaStore?.handleByteHeads([eventBlock.value.data.dbMeta as Uint8Array]);
      
      this.eventsWeHandled.add(cid);
    }

    this.isProcessing = false;
  }
}