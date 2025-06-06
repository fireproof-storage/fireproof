import { IDBPDatabase, openDB } from "idb";
import { Logger, ResolveOnce, URI } from "@adviser/cement";
import { type SuperThis, rt } from "@fireproof/core";

export class KeyBagProviderIndexedDB implements rt.kb.KeyBagProvider {
  readonly _db: ResolveOnce<IDBPDatabase<unknown>> = new ResolveOnce<IDBPDatabase<unknown>>();

  readonly dbName: string;
  readonly url: URI;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  constructor(url: URI, sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = sthis.logger;
    this.url = url;
    this.dbName = rt.getPath(this.url, this.sthis);
  }

  async _prepare(): Promise<IDBPDatabase<unknown>> {
    return this._db.once(async () => {
      return await openDB(this.dbName, 1, {
        upgrade(db) {
          // console.log('upgrade:', dbName);
          ["bag"].map((store) => {
            db.createObjectStore(store, {
              autoIncrement: false,
            });
          });
        },
      });
    });
  }

  async del(id: string): Promise<void> {
    const db = await this._prepare();
    const tx = db.transaction(["bag"], "readwrite");
    await tx.objectStore("bag").delete(id);
    await tx.done;
  }

  async get(id: string): Promise<rt.kb.KeysItem | rt.kb.V1StorageKeyItem | undefined> {
    const db = await this._prepare();
    const tx = db.transaction(["bag"], "readonly");
    const keyItem = await tx.objectStore("bag").get(id);
    await tx.done;
    if (!keyItem) {
      return undefined;
    }
    return keyItem;
  }

  async set(item: rt.kb.KeysItem): Promise<void> {
    const db = await this._prepare();
    const tx = db.transaction(["bag"], "readwrite");
    await tx.objectStore("bag").put(item, item.name);
    await tx.done;
  }
}
