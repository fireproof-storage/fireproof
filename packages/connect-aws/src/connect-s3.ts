import { DownloadMetaFnParams, DownloadDataFnParams, UploadMetaFnParams, UploadDataFnParams } from './types'
import { Connection } from '@fireproof/encrypted-blockstore'
import fetch from "cross-fetch"
import { Base64 } from "js-base64"

export class ConnectS3 extends Connection {
  uploadUrl: URL
  downloadUrl: URL
  ws: WebSocket | undefined
  messagePromise: Promise<Uint8Array[]>
  messageResolve?: (value: Uint8Array[] | PromiseLike<Uint8Array[]>) => void

  constructor(upload: string, download: string, websocket?: string) {
    super()
    this.uploadUrl = new URL(upload)
    this.downloadUrl = new URL(download)
    if (websocket?.length != 0) {
      this.ws = new WebSocket(websocket!)
    } else {
      this.ws = undefined
    }
    this.messagePromise = new Promise<Uint8Array[]>((resolve, reject) => {
      this.messageResolve = resolve
    })
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    // console.log('s3 dataUpload', params.car.toString())
    const fetchUploadUrl = new URL(
      `?${new URLSearchParams({ cache: Math.random().toString(), ...params }).toString()}`,
      this.uploadUrl
    )
    const response = await fetch(fetchUploadUrl)
    if (!response.ok) {
      // console.log('failed to get upload url for data', params, response)
      throw new Error(
        'failed to get upload url for data ' + new Date().toISOString() + ' ' + response.statusText
      )
    }
    const { uploadURL } = (await response.json()) as { uploadURL: string }
    const done = await fetch(uploadURL, { method: 'PUT', body: bytes })
    // console.log('s3 dataUpload done', params.car.toString(), done)
    if (!done.ok) throw new Error('failed to upload data ' + done.statusText)
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    const event = await this.createEventBlock(bytes)
    const base64String = Base64.fromUint8Array(bytes)
    const crdtEntry = {
      cid: event.cid.toString(),
      data: base64String,
      parents: this.parents.map(p => p.toString())
    }
    const fetchUploadUrl = new URL(
      `?${new URLSearchParams({ type: 'meta', ...params }).toString()}`,
      this.uploadUrl
    )
    const done = await fetch(fetchUploadUrl, {
      method: 'PUT',
      body: JSON.stringify(crdtEntry)
    })
    const result = await done.json()
    if (result.status != 201) {
      throw new Error('failed to upload data ' + JSON.parse(result.body).message)
    }
    this.parents = [event.cid]
    return null
  }

  async dataDownload(params: DownloadDataFnParams) {
    const { type, name, car } = params
    const fetchFromUrl = new URL(`${type}/${name}/${car}.car`, this.downloadUrl)
    const response = await fetch(fetchFromUrl)
    if (!response.ok) return null // throw new Error('failed to download data ' + response.statusText)
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes
  }

  async onConnect() {
    if (!this.loader || !this.taskManager) {
      throw new Error('loader and taskManager must be set')
    }

    if (this.ws == undefined) {
      return
    }
    this.ws.addEventListener('message', async (event: any) => {
      const data = JSON.parse(event.data)
      const bytes = Base64.toUint8Array(data.items[0].data)
      const afn = async () => {
        const uint8ArrayBuffer = bytes as Uint8Array
        const eventBlock = await this.createEventBlock(uint8ArrayBuffer)
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

  /**
   * metaDownload Function
   *
   * This function downloads metadata for a specific name and branch.
   *
   * Proposed Algorithm for Efficient Reads:
   *
   * 1. Read the Directory:
   *    - Fetch the list of keys in the directory, sorted by their timestamp in descending order—newest to oldest.
   *
   * 2. Initialize a Skip List:
   *    - Create an empty set data structure to keep track of the parent nodes that can be skipped.
   *
   * 3. Iterate through Keys:
   *    - Start from the newest key and move towards the oldest.
   *    - If the key is in the skip list, skip the read and continue.
   *    - Read the node and add its parents to the skip list.
   *
   * 4. Idempotent Application:
   *    - Apply the nodes to your DAG. Given that your application is idempotent, there's no harm in reapplying nodes,
   *      but the skip list should minimize this.
   *
   * 5. State Tracking:
   *    - Keep track of the oldest key you've successfully processed. This becomes the starting point for your next read,
   *      adjusted for the safety window.
   *
   * 6. Retry Logic:
   *    - If a key is missing, you could either skip it (since the system is designed to be eventually consistent) or
   *      implement some kind of retry logic.
   *
   * By implementing this algorithm, we aim to minimize the number of reads and work with the most current snapshot
   * of the data. It also avoids the need to delete keys, thereby averting the read-modify-write race condition.
   *
   * Writes: https://chat.openai.com/share/5dd42b0e-cbb8-4006-823b-7269df05e9eb
   *
   * @param params - The parameters for the download, including the name and branch.
   * @returns - Returns the metadata bytes as a Uint8Array or null if the fetch is unsuccessful.
   */
  async metaDownload(params: DownloadMetaFnParams) {
    const { name, branch } = params
    const fetchUploadUrl = new URL(
      `?${new URLSearchParams({ type: 'meta', ...params }).toString()}`,
      this.uploadUrl
    )
    const data = await fetch(fetchUploadUrl)
    let response = await data.json()
    if (response.status != 200) throw new Error('Failed to download data')
    response = JSON.parse(response.body).items
    const events = await Promise.all(
      response.map(async (element: any) => {
        const base64String = element.data
        const bytes = Base64.toUint8Array(base64String)
        return { cid: element.cid, bytes }
      })
    )
    const cids = events.map(e => e.cid)
    const uniqueParentsMap = new Map([...this.parents, ...cids].map(p => [p.toString(), p]))
    this.parents = Array.from(uniqueParentsMap.values())
    return events.map(e => e.bytes)
  }
}
