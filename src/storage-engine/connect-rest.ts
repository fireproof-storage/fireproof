import { DownloadMetaFnParams, DownloadDataFnParams, UploadMetaFnParams, UploadDataFnParams } from "./types";
import { Connection } from "./connection";

export class ConnectREST extends Connection {
  readonly baseUrl: URL;

  constructor(base: string) {
    super();
    this.baseUrl = new URL(base);
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    // console.log('s3 dataUpload', params.car.toString())
    const carCid = params.car.toString();
    const uploadURL = new URL(`/cars/${carCid}.car`, this.baseUrl);

    const done = await fetch(uploadURL, { method: "PUT", body: bytes });
    // console.log('rest dataUpload done', params.car.toString(), done)
    if (!done.ok) {
      throw new Error("failed to upload data " + done.statusText);
    }
  }

  async dataDownload(params: DownloadDataFnParams) {
    const { car } = params;
    const fetchFromUrl = new URL(`/cars/${car.toString()}.car`, this.baseUrl);
    const response = await fetch(fetchFromUrl);
    if (!response.ok) {
      return undefined; // throw new Error('failed to download data ' + response.statusText)
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    // const event = await this.createEventBlock(bytes)
    // const base64String = Base64.fromUint8Array(bytes)
    // const crdtEntry = {
    //   cid: event.cid.toString(),
    //   data: base64String,
    //   parents: this.parents.map(p => p.toString())
    // }
    // const fetchUploadUrl = new URL(
    //   `?${new URLSearchParams({ type: 'meta', ...params }).toString()}`,
    //   this.uploadUrl
    // )
    // const done = await fetch(fetchUploadUrl, {
    //   method: 'PUT',
    //   body: JSON.stringify(crdtEntry)
    // })
    // const result = await done.json()
    // if (result.status != 201) {
    //   throw new Error('failed to upload data ' + JSON.parse(result.body).message)
    // }
    // this.parents = [event.cid]
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async metaDownload(params: DownloadMetaFnParams) {
    // const { name, branch } = params
    // const fetchUploadUrl = new URL(`?${new URLSearchParams({ type: "meta", ...params }).toString()}`,this.uploadUrl)
    // const data = await fetch(fetchUploadUrl)
    // let response = await data.json()
    // if (response.status != 200) throw new Error("Failed to download data")
    // response = JSON.parse(response.body).items
    // const events = await Promise.all(
    //   response.map(async (element: any) => {
    //     const base64String = element.data
    //     const bytes = Base64.toUint8Array(base64String)
    //     return { cid: element.cid, bytes }
    //   })
    // )
    // const cids = events.map((e) => e.cid)
    // const uniqueParentsMap = new Map([...this.parents, ...cids].map((p) => [p.toString(), p]))
    // this.parents = Array.from(uniqueParentsMap.values())
    // return events.map((e) => e.bytes)
    return [];
  }
}
