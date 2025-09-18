import { KeyedResolvOnce, Lazy, URI } from "@adviser/cement";
import { BlockLog, Cars, CidSet, Peers, FPIndexedDB, DBTable } from "@fireproof/core-types-blockstore";
import { Dexie } from "dexie";
import { WrapDexieTable } from "./wrap-dexie.js";

export class FPIndexedDBImpl implements FPIndexedDB {
  readonly #db: Dexie;
  constructor(uri: URI) {
    // console.log("FPIndexedDBImpl", uri.pathname);
    this.#db = new Dexie(uri.pathname);
    this.#db.version(0.1).stores({
      version: "",
      data: "",
      wal: "",
      meta: "",
      "idx.data": "",
      "idx.wal": "",
      "idx.meta": "",
      blockLogs: "seq",
      cidSets: "cid",
      cars: "carCid",
      peers: "peerId",
    });
  }

  close(): Promise<void> {
    return Promise.resolve(this.#db.close());
  }
  destroy(): Promise<void> {
    return this.#db.delete();
  }

  #wrappedTables = new KeyedResolvOnce<DBTable<unknown>>();
  objectStore<T = Uint8Array>(name: string): DBTable<T> {
    return this.#wrappedTables.get(name).once(() => new WrapDexieTable<T>(this.#db, this.#db.table(name), ""));
  }
  readonly version = Lazy((): DBTable<{ version: string }> => new WrapDexieTable(this.#db, this.#db.table("version"), ""));
  readonly fpSync = {
    blockLogs: Lazy((): DBTable<BlockLog> => new WrapDexieTable(this.#db, this.#db.table("blockLogs"), "seq")),
    cidSets: Lazy((): DBTable<CidSet> => new WrapDexieTable(this.#db, this.#db.table("cidSets"), "cid")),
    cars: Lazy((): DBTable<Cars> => new WrapDexieTable(this.#db, this.#db.table("cars"), "carCid")),
    peers: Lazy((): DBTable<Peers> => new WrapDexieTable(this.#db, this.#db.table("peers"), "peerId")),
  };

  // async open(): Promise<void> {
  //   await this.#db.open();
  // }

  // async close(): Promise<void> {
  //   await this.#db.close();
  // }
}
