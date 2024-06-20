import { format, parse, ToString } from "@ipld/dag-json";
import { openDB, IDBPDatabase } from "idb";
import { AnyBlock, AnyLink, DbMeta } from "../storage-engine/types";
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from "../storage-engine";
import { RemoteWAL as RemoteWALBase, WALState } from "../storage-engine/remote-wal";
import type { Loadable, Loader } from "../storage-engine/loader";

export const makeDataStore = (name: string) => new DataStore(name);
export const makeMetaStore = (loader: Loader) => new MetaStore(loader.name);
export const makeRemoteWAL = (loader: Loadable) => new RemoteWAL(loader);

export class DataStore extends DataStoreBase {
  readonly tag: string = "car-web-idb";
  idb?: IDBPDatabase<unknown>;

  async _withDB<T>(dbWorkFun: (arg0: IDBPDatabase<unknown>) => T): Promise<T> {
    if (!this.idb) {
      const dbName = `fp.${this.STORAGE_VERSION}.${this.name}`;
      this.idb = await openDB(dbName, 1, {
        upgrade(db): void {
          db.createObjectStore("cars");
        },
      });
    }
    return await dbWorkFun(this.idb);
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    return await this._withDB(async (db: IDBPDatabase<unknown>) => {
      const tx = db.transaction(["cars"], "readonly");
      const bytes = (await tx.objectStore("cars").get(cid.toString())) as Uint8Array;
      if (!bytes) throw new Error(`missing idb block ${cid.toString()}`);
      return { cid, bytes };
    });
  }

  async save(car: AnyBlock): Promise<void> {
    return await this._withDB(async (db: IDBPDatabase<unknown>) => {
      const tx = db.transaction(["cars"], "readwrite");
      await tx.objectStore("cars").put(car.bytes, car.cid.toString());
      return await tx.done;
    });
  }

  async remove(cid: AnyLink): Promise<void> {
    return await this._withDB(async (db: IDBPDatabase<unknown>) => {
      const tx = db.transaction(["cars"], "readwrite");
      await tx.objectStore("cars").delete(cid.toString());
      return await tx.done;
    });
  }
}

export class RemoteWAL extends RemoteWALBase {
  readonly tag: string = "wal-web-ls";

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.wal.${this.loader.name}.${branch}`;
  }

  async load(branch = "main"): Promise<WALState | null> {
    try {
      const bytesString = localStorage.getItem(this.headerKey(branch));
      if (!bytesString) return null;
      return parse<WALState>(bytesString);
    } catch (e) {
      return null;
    }
  }

  async save(state: WALState, branch = "main"): Promise<void> {
    try {
      const encoded: ToString<WALState> = format(state);
      localStorage.setItem(this.headerKey(branch), encoded);
    } catch (e) {
      console.error("error saving wal", e);
      throw e;
    }
  }
}

export class MetaStore extends MetaStoreBase {
  readonly tag: string = "header-web-ls";

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.meta.${this.name}.${branch}`;
  }

  async load(branch = "main"): Promise<DbMeta[] | null> {
    try {
      const bytesString = localStorage.getItem(this.headerKey(branch));
      if (!bytesString) return null;
      // browser assumes a single writer process
      // to support concurrent updates to the same database across multiple tabs
      // we need to implement the same kind of mvcc.crdt solution as in store-fs and connect-s3
      return [this.parseHeader(bytesString)];
    } catch (e) {
      return null;
    }
  }

  async save(meta: DbMeta, branch = "main") {
    try {
      const headerKey = this.headerKey(branch);
      const bytes = this.makeHeader(meta);
      localStorage.setItem(headerKey, bytes);
      return null;
    } catch (e) {
      return null;
    }
  }
}
