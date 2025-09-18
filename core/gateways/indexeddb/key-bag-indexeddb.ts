import { Logger, ResolveOnce, URI } from "@adviser/cement";
import { KeyBagProvider, KeyedV2StorageKeyItem, type SuperThis } from "@fireproof/core-types-base";
import { getPath } from "@fireproof/core-gateways-base";
import { Dexie, Table } from "dexie";

class KeyBagDB extends Dexie {
  readonly bag!: Table<KeyedV2StorageKeyItem>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      bag: "id",
    });
  }
}

export class KeyBagProviderIndexedDB implements KeyBagProvider {
  readonly #db = new ResolveOnce<KeyBagDB>();
  readonly dbName: string;
  readonly url: URI;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  constructor(url: URI, sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = sthis.logger;
    this.url = url;
    this.dbName = getPath(this.url, this.sthis);
  }

  async _prepare(): Promise<KeyBagDB> {
    return this.#db.once(async () => {
      const db = new KeyBagDB(this.dbName);
      // db.version(1).stores({
      //   blockLogs: "seq, car, type",
      //   cidSets: "cid, peers, type",
      //   cars: "carCid, peers, type",
      //   peers: "peerId, type",
      // });
      return db.open().then(() => db);
    });
  }

  async del(id: string): Promise<void> {
    const db = await this._prepare();
    return db.bag.delete(id);
    // const tx = db.transaction(["bag"], "readwrite");
    // await tx.objectStore("bag").delete(id);
    // await tx.done;
  }

  async get(id: string): Promise<NonNullable<unknown> | undefined> {
    const db = await this._prepare();
    return db.bag.get(id);
    // const tx = db.transaction(["bag"], "readonly");
    // const keyItem = await tx.objectStore("bag").get(id);
    // await tx.done;
    // if (!keyItem) {
    //   return undefined;
    // }
    // return keyItem;
  }

  async set(id: string, item: KeyedV2StorageKeyItem): Promise<void> {
    const db = await this._prepare();
    return db.bag.put(item);
    // const tx = db.transaction(["bag"], "readwrite");
    // await tx.objectStore("bag").put(item, id);
    // await tx.done;
  }
}
