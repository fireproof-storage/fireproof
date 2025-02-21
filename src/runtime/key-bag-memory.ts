import { URI } from "@adviser/cement";
import { KeyBagProvider, KeysItem, V1StorageKeyItem } from "./key-bag.js";
import { SuperThis } from "../types.js";

const memoryKeyBag = new Map<string, Uint8Array>();

export class KeyBagProviderMemory implements KeyBagProvider {
  private readonly url: URI;
  readonly sthis: SuperThis;
  constructor(url: URI, sthis: SuperThis) {
    this.url = url;
    this.sthis = sthis;
  }
  key(id: string): string {
    return `${this.url.pathname}/${id}`;
  }

  // async _prepare(id: string): Promise<KeyBagCtx> {
  //   await this.sthis.start();
  //   const sysFS = await sysFileSystemFactory(this.url);
  //   const dirName = this.url.pathname;
  //   await sysFS.mkdir(dirName, { recursive: true });
  //   return {
  //     dirName,
  //     sysFS,
  //     fName: this.sthis.pathOps.join(dirName, `${id.replace(/[^a-zA-Z0-9]/g, "_")}.json`),
  //   };
  // }

  async get(id: string): Promise<KeysItem | V1StorageKeyItem | undefined> {
    const binKeyItem = memoryKeyBag.get(this.key(id));
    if (binKeyItem) {
      const ki = JSON.parse(this.sthis.txt.decode(binKeyItem));
      return ki;
    }
    return undefined;
  }

  async set(item: KeysItem): Promise<void> {
    const p = this.sthis.txt.encode(JSON.stringify(item, null, 2));
    memoryKeyBag.set(this.key(item.name), p);
  }
}
