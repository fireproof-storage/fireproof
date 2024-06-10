import { Connection, MetaStore } from '@fireproof/encrypted-blockstore'
import { UploadDataFnParams, UploadMetaFnParams, DownloadDataFnParams, DownloadMetaFnParams, DBConnection, Store } from './types'

import { DataRecord, DataSQLRecordBuilder, DataStoreFactory } from './data-type';
import { MetaRecord, MetaRecordKey, MetaSQLRecordBuilder, MetaStoreFactory } from './meta-type';
import { SQLFactory } from './sql';



export class ConnectSQL extends Connection {
  // readonly ws?: WebSocket
  readonly decoder = new TextDecoder()

  readonly dbConn: DBConnection

  objectStore?: Store<DataRecord, string>
  metaStore?: Store<MetaRecord, MetaRecordKey>

  constructor(databaseURL: string) {
    console.log('sql constructor', databaseURL);
    super()
    this.dbConn = SQLFactory(new URL(databaseURL))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    console.log('sql dataUpload', params);
    await this.objectStore!.insert(
      DataSQLRecordBuilder.fromUploadParams(bytes, params).build()
    )
    return Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | null> {
    console.log('sql metaUpload', params);
    const ret = await this.metaStore!.insert(
      MetaSQLRecordBuilder.fromUploadMetaFnParams(bytes, params).build()
    )
    return Promise.resolve(null)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | null> {
    console.log('sql dataDownload', params);
    // const { type, name, car } = params
    // const fetchFromUrl = new URL(`${type}/${name}/${car}.car`, this.downloadUrl)
    // const response = await fetch(fetchFromUrl)
    // if (!response.ok) return null // throw new Error('failed to download data ' + response.statusText)
    // const bytes = new Uint8Array(await response.arrayBuffer())
    // return bytes
    return Promise.resolve(null)
  }

  async onConnect(): Promise<void> {
    if (!this.loader || !this.taskManager) {
      throw new Error('loader and taskManager must be set')
    }
    console.log('sql onConnect-1')
    await this.dbConn.connect()
    console.log('sql onConnect-2')
    this.objectStore = await DataStoreFactory(this.dbConn)
    console.log('sql onConnect-3')
    this.metaStore = await MetaStoreFactory(this.dbConn)
    console.log('sql onConnect-4')
    return Promise.resolve()
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | null> {
    console.log('sql metaDownload', params);
    return Promise.resolve(null)
    // const { name, branch } = params
    // const fetchUploadUrl = new URL(
    //   `?${new URLSearchParams({ type: 'meta', ...params }).toString()}`,
    //   this.uploadUrl
    // )
    // const data = await fetch(fetchUploadUrl)
    // let response = await data.json()
    // if (response.status != 200) throw new Error('Failed to download data')
    // response = JSON.parse(response.body).items
    // const events = await Promise.all(
    //   response.map(async (element: any) => {
    //     const base64String = element.data
    //     const bytes = Base64.toUint8Array(base64String)
    //     return { cid: element.cid, bytes }
    //   })
    // )
    // const cids = events.map(e => e.cid)
    // const uniqueParentsMap = new Map([...this.parents, ...cids].map(p => [p.toString(), p]))
    // this.parents = Array.from(uniqueParentsMap.values())
    // return events.map(e => e.bytes)
  }
}
