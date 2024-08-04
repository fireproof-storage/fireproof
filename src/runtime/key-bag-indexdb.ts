import { IDBPDatabase, openDB } from "idb";
import { KeyBagProvider, KeyItem } from "./key-bag.js";
import { getPath } from "./gateways/file/utils.js";
import { Logger, ResolveOnce, URI } from "@adviser/cement";

export class KeyBagProviderIndexDB implements KeyBagProvider {
  readonly _db = new ResolveOnce<IDBPDatabase<unknown>>();

  readonly dbName: string;
  constructor(
    readonly url: URI,
    readonly logger: Logger,
  ) {
    this.dbName = getPath(this.url, this.logger);
  }

  async _prepare() {
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

  async get(id: string): Promise<KeyItem | undefined> {
    const db = await this._prepare();
    const tx = db.transaction(["bag"], "readonly");
    const keyItem = await tx.objectStore("bag").get(id);
    await tx.done;
    if (!keyItem) {
      return undefined;
    }
    return keyItem;
  }

  async set(id: string, item: KeyItem): Promise<void> {
    const db = await this._prepare();
    const tx = db.transaction(["bag"], "readwrite");
    await tx.objectStore("bag").put(item, id);
    await tx.done;
  }
}
