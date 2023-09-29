import { DownloadMetaFnParams, DownloadDataFnParams, UploadMetaFnParams, UploadDataFnParams } from './types'
import { validateDataParams, validateMetaParams } from '.'
import { Connection } from './connection'
import fetch from 'cross-fetch'

export class ConnectS3 extends Connection {
  uploadUrl: URL
  downloadUrl: URL

  constructor(upload: string, download: string) {
    super()
    this.uploadUrl = new URL(upload)
    this.downloadUrl = new URL(download)
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    validateDataParams(params)
    // console.log('s3 dataUpload', params.car.toString())
    const fetchUploadUrl = new URL(`${this.uploadUrl.toString()}?${new URLSearchParams({ cache: Math.random().toString(), ...params }).toString()}`)
    const response = await fetch(fetchUploadUrl)
    if (!response.ok) {
      console.log('failed to get upload url for data', params, response)
      throw new Error('failed to get upload url for data ' + new Date().toISOString() + ' ' + response.statusText)
    }
    const { uploadURL } = await response.json() as { uploadURL: string }
    const done = await fetch(uploadURL, { method: 'PUT', body: bytes })
    // console.log('s3 dataUpload done', params.car.toString(), done)
    if (!done.ok) throw new Error('failed to upload data ' + done.statusText)
  }

  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    validateMetaParams(params)
    const fetchUploadUrl = new URL(`${this.uploadUrl.toString()}?${new URLSearchParams({ type: 'meta', ...params }).toString()}`)
    const response = await fetch(fetchUploadUrl)
    if (!response.ok) {
      console.log('failed to get upload url for meta', params, response)
      throw new Error('failed to get upload url for meta')
    }
    const { uploadURL } = await response.json() as { uploadURL: string }
    if (!uploadURL) throw new Error('missing uploadURL')
    const done = await fetch(uploadURL, { method: 'PUT', body: bytes })
    if (!done.ok) throw new Error('failed to upload data ' + done.statusText)
    return null
  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    const { type, name, car } = params
    const fetchFromUrl = new URL(`${type}/${name}/${car}.car`, this.downloadUrl)
    const response = await fetch(fetchFromUrl)
    if (!response.ok) return null // throw new Error('failed to download data ' + response.statusText)
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes
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
    validateMetaParams(params)
    const { name, branch } = params
    const fetchFromUrl = new URL(`meta/${name}/${branch + '.json?cache=' + Math.floor(Math.random() * 1000000)}`, this.downloadUrl)
    const response = await fetch(fetchFromUrl)
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    // todo we could use a range list to make mvcc / crdt logic work in the s3 bucket
    // we would name the meta files with a timestamp, eg using our UUIDv7 library
    return [bytes]
  }
}
