import { URI } from "@adviser/cement";
import { KeyBagProvider, KeyItem } from "./key-bag.js";
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

  async get(id: string): Promise<KeyItem | undefined> {
    const binKeyItem = memoryKeyBag.get(this.key(id));
    if (binKeyItem) {
      const ki = JSON.parse(this.sthis.txt.decode(binKeyItem)) as KeyItem;
      return ki;
    }
    return undefined;
  }

  async set(id: string, item: KeyItem): Promise<void> {
    const p = this.sthis.txt.encode(JSON.stringify(item, null, 2));
    memoryKeyBag.set(this.key(id), p);
  }
}
