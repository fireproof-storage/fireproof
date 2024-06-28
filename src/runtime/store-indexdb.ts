import { format, parse, ToString } from "@ipld/dag-json";
import { openDB, IDBPDatabase } from "idb";
import { AnyBlock, AnyLink, DbMeta } from "../storage-engine/types.js";
import { DataStore as DataStoreBase, Loadable, MetaStore as MetaStoreBase, STORAGE_VERSION } from "../storage-engine/index.js";
import { RemoteWAL as RemoteWALBase, WALState } from "../storage-engine/remote-wal.js";
import { Falsy } from "../types.js";
import { uuidv4 } from "uuidv7";
import { ResolveOnce } from "../storage-engine/resolve-once.js";

export interface DbName {
  readonly fullDb: string;
  readonly type: "data" | "meta" | "wal";
  readonly dbName: string;
}

export function getIndexDBName(url: URL, type: "data" | "meta" | "wal", branch?: string): DbName {
  const fullDb = url.pathname.replace(/^\/+/, ""); // cut leading slashes
  const dbName = fullDb.replace(new RegExp(`^fp.${STORAGE_VERSION}.`), ""); // cut fp prefix
  let result: string;
  switch (type) {
    case "data":
      result = `fp.${STORAGE_VERSION}.${dbName}`;
      break;
    case "meta":
      result = `fp.${STORAGE_VERSION}.${dbName}`;
      break;
    case "wal":
      result = `fp.${STORAGE_VERSION}.${dbName}`;
      break;
    default:
      throw new Error(`invalid type ${type}`);
  }
  if (branch) {
    result += `.${branch}`;
  }
  // console.log("getIndexDBName:", { fullDb: result, dbName, });
  return {
    fullDb: result,
    type,
    dbName,
  };
}

export interface SimpleDb {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export class EnsureDB {
  readonly url: URL;
  readonly type: "data" | "meta" | "wal";

  readonly id = uuidv4();

  constructor(url: URL, type: "data" | "meta" | "wal") {
    this.url = url;
    this.type = type;
  }
  readonly getOnce = new ResolveOnce<{ db: IDBPDatabase<unknown>; dbName: DbName }>();
  async get<T>(dbWorkFun: (arg0: SimpleDb) => Promise<T>): Promise<T> {
    console.log(`get:${this.id}`);
    const once = await this.getOnce.once(async () => {
      console.log(`get:${this.id}:once`);
      const dbName = getIndexDBName(this.url, this.type); // `fp.${this.STORAGE_VERSION}.${this.name}`;
      // console.log(`openDB:pre:${this.id}`, dbName);
      const db = await openDB(dbName.fullDb, 1, {
        upgrade(db) {
          for (const name of ["data", "meta", "wal"]) {
            db.createObjectStore(name, {
              autoIncrement: false,
            });
          }
        },
      });
      // console.log(`openDB:post:${this.id}`, dbName);
      return { db, dbName };
    });
    // console.log(`get:${this.id}:once-done`);
    return await dbWorkFun({
      get: async (key: string) => {
        const tx = once.db.transaction([once.dbName.type], "readonly");
        const bytes = await tx.objectStore(once.dbName.type).get(key);
        await tx.done;
        return bytes;
      },
      put: async (key: string, value: unknown) => {
        // console.log("put", dbName, key, value);
        const tx = once.db.transaction([once.dbName.type], "readwrite");
        await tx.objectStore(once.dbName.type).put(value, key);
        await tx.done;
      },
      delete: async (key: string) => {
        const tx = once.db.transaction([once.dbName.type], "readwrite");
        await tx.objectStore(once.dbName.type).delete(key);
        await tx.done;
      },
    });
  }
  async close() {
    if (this.getOnce._once) {
      this.getOnce._once.db.close();
    }
  }
}

export class IndexDBDataStore extends DataStoreBase {
  readonly tag: string = "car-web-idb";

  readonly ensureDB: EnsureDB;

  constructor(name: string, url: URL) {
    super(name, url);
    this.ensureDB = new EnsureDB(this.url, "data");
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    return await this.ensureDB.get(async (db) => {
      const bytes = (await db.get(cid.toString())) as Uint8Array;
      // const tx = db.transaction([dbName.type], "readonly");
      // const bytes = (await tx.objectStore(dbName.type).get(cid.toString())) as Uint8Array;
      // await tx.done
      if (!bytes) throw new Error(`ENOENT: missing idb block ${cid.toString()}`);
      return { cid, bytes };
    });
  }

  async save(car: AnyBlock): Promise<void> {
    return await this.ensureDB.get(async (db: SimpleDb) => {
      // console.log("save", car.cid.toString())
      db.put(car.cid.toString(), car.bytes);
      // const tx = db.transaction([dbName.type], "readwrite");
      // await tx.objectStore(dbName.type).put(car.bytes, car.cid.toString());
      // await tx.done
      return;
    });
  }

  async remove(cid: AnyLink): Promise<void> {
    return await this.ensureDB.get(async (db: SimpleDb) => {
      // const tx = db.transaction([dbName.type], "readwrite");
      // await tx.objectStore(dbName.type).delete(cid.toString());
      // await tx.done
      db.delete(cid.toString());
      return;
    });
  }
  async close() {
    this.ensureDB.close();
  }
}

export class IndexDBRemoteWAL extends RemoteWALBase {
  readonly tag: string = "wal-web-ls";

  readonly ensureDB: EnsureDB;

  constructor(loader: Loadable, url: URL) {
    super(loader, url);
    this.ensureDB = new EnsureDB(this.url, "wal");
  }

  headerKey(branch: string) {
    // return `fp.${this.STORAGE_VERSION}.wal.${this.loader.name}.${branch}`;
    // return getIndexDBName(this.url, "wal", branch).fullDb;
    return branch;
  }

  async _load(branch = "main"): Promise<WALState | Falsy> {
    // console.trace("IndexDBRemoteWAL:load", branch);
    console.log("IndexDBRemoteWAL:load", branch);
    return await this.ensureDB.get(async (db: SimpleDb) => {
      try {
        const bytesString = (await db.get(this.headerKey(branch))) as string;
        if (!bytesString) return undefined;
        return parse<WALState>(bytesString);
      } catch (e) {
        console.error("error WebRemoteWAL:load:", e);
        return undefined;
      }
    });
  }

  async _save(state: WALState, branch = "main"): Promise<void> {
    console.log("IndexDBRemoteWAL:save", branch);
    return await this.ensureDB.get(async (db: SimpleDb) => {
      try {
        const encoded: ToString<WALState> = format(state);
        db.put(encoded, this.headerKey(branch));
        // const tx = db.transaction([dbName.type], "readwrite");
        // await tx.objectStore(dbName.type).put(encoded, this.headerKey(branch));
        // await tx.done
        // localStorage.setItem(this.headerKey(branch), encoded);
      } catch (e) {
        console.error("error WebRemoteWAL:save:", e);
        throw e;
      }
    });
  }
  async _close() {
    this.ensureDB.close();
  }
}

export class IndexDBMetaStore extends MetaStoreBase {
  readonly tag: string = "header-web-ls";

  readonly ensureDB: EnsureDB;

  constructor(name: string, url: URL) {
    super(name, url);
    this.ensureDB = new EnsureDB(this.url, "meta");
  }

  headerKey(branch: string) {
    // return `fp.${this.STORAGE_VERSION}.meta.${this.name}.${branch}`;
    return branch; // getIndexDBName(this.url, "meta").fullDb;
  }

  async load(branch = "main"): Promise<DbMeta[] | Falsy> {
    return await this.ensureDB.get(async (db: SimpleDb) => {
      try {
        const bytesString = (await db.get(this.headerKey(branch))) as string;
        // localStorage.getItem(this.headerKey(branch));
        if (!bytesString) return undefined;
        // browser assumes a single writer process
        // to support concurrent updates to the same database across multiple tabs
        // we need to implement the same kind of mvcc.crdt solution as in store-fs and connect-s3
        return [this.parseHeader(bytesString)];
      } catch (e) {
        console.error("error WebMetaStore:load:", e);
        return undefined;
      }
    });
  }

  async save(meta: DbMeta, branch = "main") {
    return await this.ensureDB.get(async (db: SimpleDb) => {
      try {
        const headerKey = this.headerKey(branch);
        const bytes = this.makeHeader(meta);
        await db.put(headerKey, bytes);
        // const tx = db.transaction([dbName.type], "readwrite");
        // await tx.objectStore(dbName.type).put(bytes, headerKey);
        // await tx.done
        // const tx = db.transaction([dbName.type], "readwrite");
        // await tx.objectStore(dbName.type).put(bytes, headerKey);
      } catch (e) {
        console.error("error WebMetaStore:save:", e);
        //
      }
      return undefined;
    });
  }
  async close() {
    this.ensureDB.close();
  }
}
