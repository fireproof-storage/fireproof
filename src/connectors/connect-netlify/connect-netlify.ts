import { Base64 } from "js-base64";
import { Connection } from "../../storage-engine";
import { DownloadDataFnParams, DownloadMetaFnParams, UploadDataFnParams, UploadMetaFnParams } from "../../storage-engine/types";

export class ConnectNetlify extends Connection {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  async dataUpload(bytes: Uint8Array, { car }: UploadDataFnParams) {
    const fetchUploadUrl = new URL(`/fireproof?car=${car}`, document.location.origin);
    const base64String = Base64.fromUint8Array(bytes);
    const done = await fetch(fetchUploadUrl, { method: "PUT", body: base64String });
    if (!done.ok) throw new Error("failed to upload data " + done.statusText);
  }

  async dataDownload({ car }: DownloadDataFnParams) {
    const fetchDownloadUrl = new URL(`/fireproof?car=${car}`, document.location.origin);
    const response = await fetch(fetchDownloadUrl);
    if (!response.ok) throw new Error("failed to download data " + response.statusText);
    const base64String = await response.text();
    const data = Base64.toUint8Array(base64String);
    return data;
  }

  async metaUpload(bytes: Uint8Array, { name }: UploadMetaFnParams): Promise<Uint8Array[] | null> {
    const event = await this.createEventBlock(bytes);
    const base64String = Base64.fromUint8Array(bytes);
    const crdtEntry = {
      cid: event.cid.toString(),
      data: base64String,
      parents: this.parents.map((p) => p.toString()),
    };
    const fetchUploadUrl = new URL(`/fireproof?meta=${name}`, document.location.origin);
    const done = await fetch(fetchUploadUrl, { method: "PUT", body: JSON.stringify(crdtEntry) });
    if (!done.ok) throw new Error("failed to upload meta " + done.statusText);
    this.parents = [event.cid];
    return null;
  }

  async metaDownload({ name }: DownloadMetaFnParams) {
    const fetchDownloadUrl = new URL(`/fireproof?meta=${name}`, document.location.origin);
    const response = await fetch(fetchDownloadUrl);
    if (!response.ok) throw new Error("failed to download meta " + response.statusText);
    const crdtEntries = await response.json();
    const events = await Promise.all(
      crdtEntries.map(async (entry: any) => {
        const base64String = entry.data;
        const bytes = Base64.toUint8Array(base64String);
        // const event = await this.createEventBlock(bytes)
        return { cid: entry.cid, bytes };
      }),
    );
    const cids = events.map((e) => e.cid);
    const uniqueParentsMap = new Map([...this.parents, ...cids].map((p) => [p.toString(), p]));
    this.parents = Array.from(uniqueParentsMap.values());
    return events.map((e) => e.bytes);
  }
}
