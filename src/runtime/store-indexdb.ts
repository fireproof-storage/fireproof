import { format, parse, ToString } from "@ipld/dag-json";
import { openDB, IDBPDatabase } from "idb";
import { uuidv4 } from "uuidv7";
import { Logger, ResolveOnce } from "@adviser/cement";

import { AnyBlock, AnyLink, DbMeta, TestStore } from "../blockstore/types.js";
import { DataStore as DataStoreBase, Loadable, MetaStore as MetaStoreBase } from "../blockstore/index.js";
import { RemoteWAL as RemoteWALBase, WALState } from "../blockstore/remote-wal.js";
import { Falsy } from "../types.js";
import { INDEXDB_VERSION } from "./store-indexdb-version.js";
import { ensureLogger } from "../utils.js";

function ensureVersion(url: URL): URL {
  const ret = new URL(url.toString());
  ret.searchParams.set("version", url.searchParams.get("version") || INDEXDB_VERSION);
  return ret;
}

const onceIndexDB = new Map<string, ResolveOnce<{ db: IDBPDatabase<unknown>; dbName: DbName }>>();

function sanitzeKey(key: string | string[]): string | string[] {
  if (key.length === 1) {
    key = key[0];
  }
  return key;
}

async function connectIdb<T>(url: URL, logger: Logger, dbWorkFun: (arg0: SimpleDb) => Promise<T>): Promise<T> {
  const dbName = getIndexDBName(url, logger); // `fp.${this.STORAGE_VERSION}.${this.name}`;
  // const urlStr = url.toString().replace(/\?.*$/, "");
  let ro = onceIndexDB.get(dbName.fullDb);
  if (!ro) {
    ro = new ResolveOnce();
    onceIndexDB.set(dbName.fullDb, ro);
  }
  // console.log(`get:${this.id}`);
  // console.log(`connectIdb:pre:`, dbName, url.toString());
  const once = await ro.once(async () => {
    // console.log(`connectIdb:once:`, dbName, url.toString());
    const db = await openDB(dbName.fullDb, 1, {
      upgrade(db) {
        // console.log('upgrade:', dbName);
        ["version", "data", "wal", "meta", "idx.data", "idx.wal", "idx.meta"].map((store) => {
          db.createObjectStore(store, {
            autoIncrement: false,
          });
        });
      },
    });
    const found = await db.get("version", "version");
    const version = url.searchParams.get("version");
    if (!found) {
      await db.put("version", { version }, "version");
    } else if (found.version !== version) {
      logger
        .Warn()
        .Str("url", url.toString())
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .Str("version", version!)
        .Str("found", found.version)
        .Msg("version mismatch");
    }
    // console.log("connectIdb-7");
    return { db, dbName };
  });

  const type = getStore(url, logger);

  // console.log("connectIdb-9", { type }, dbName);
  // console.log(`get:${this.id}:once-done`);
  const ret = await dbWorkFun({
    type,
    get: async (key: string | string[]) => {
      // console.log("get", dbName, key);
      const tx = once.db.transaction([type], "readonly");
      const bytes = await tx.objectStore(type).get(sanitzeKey(key));
      await tx.done;
      return bytes;
    },
    put: async (value: unknown, key: string[]) => {
      // console.log("put", dbName, key, value);
      const tx = once.db.transaction([type], "readwrite");
      await tx.objectStore(type).put(value, sanitzeKey(key));
      await tx.done;
    },
    delete: async (key: string[]) => {
      const tx = once.db.transaction([type], "readwrite");
      await tx.objectStore(type).delete(sanitzeKey(key));
      await tx.done;
    },
    idb: () => once.db,
  });
  // console.log("connectIdb-10");
  return ret;
}

export interface DbName {
  readonly fullDb: string;
  readonly objStore: string;
  readonly connectionKey: string;
  // readonly version: number;
  // readonly type: "data" | "meta" | "wal";
  readonly dbName: string;
}

function getStore(url: URL, logger: Logger): string {
  let result = url.searchParams.get("store");
  if (!result) throw logger.Error().Str("url", url.toString()).Msg(`store not found`).AsError();
  if (url.searchParams.has("index")) {
    result = joinDBName(url.searchParams.get("index") || "idx", result);
  }
  return result;
}

function joinDBName(...names: string[]): string {
  return names
    .map((i) => i.replace(/^[^a-zA-Z0-9]+/g, "").replace(/[^a-zA-Z0-9]+/g, "_"))
    .filter((i) => i.length)
    .join(".");
}

// const schemaVersion = new Map<string, number>();
export function getIndexDBName(iurl: URL, logger: Logger): DbName {
  const url = ensureVersion(iurl);
  const fullDb = url.pathname.replace(/^\/+/, "").replace(/\?.*$/, ""); // cut leading slashes
  // const type = getStore(url);
  // const storageVersion = url.searchParams.get("version");
  // not nice but we need to pass the version to the db name
  // url.searchParams.set("version", storageVersion);
  // console.log("getIndexDBName:", url.toString(), { fullDb, type, branch });
  // const dbName = fullDb.replace(new RegExp(`^fp.${storageVersion}.`), ""); // cut fp prefix
  const dbName = url.searchParams.get("name");
  if (!dbName) throw logger.Error().Str("url", url.toString()).Msg(`name not found`).AsError();
  const result = joinDBName(fullDb, dbName);
  const objStore = getStore(url, logger);
  // if (url.searchParams.has("index")) {
  //   objStore = joinDBName(url.searchParams.get("index") || "idx", objStore);
  // }
  /*
  let result: string;
  switch (type) {
    case "data":
      break;
    case "meta":
      result = `fp.${storageVersion}.${dbName}`;
      break;
    case "wal":
      result = `fp.${storageVersion}.${dbName}`;
      break;
    default:
      throw new Error(`invalid type ${type}`);
  }
  if (branch) {
    result += `.${branch}`;
  }
    */
  // console.log("getIndexDBName:", { fullDb: result, dbName, });
  const connectionKey = [result, objStore].join(":");
  // const version = 0;
  // if (schemaVersion.has(result)) {
  //   // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  //   version = schemaVersion.get(result)!;
  // }
  // version = version + 1;
  // schemaVersion.set(result, version);
  return {
    fullDb: result,
    objStore,
    connectionKey,
    // version,
    // type,
    dbName,
  };
}

export interface SimpleDb {
  readonly type: string;
  get(key: string[]): Promise<unknown>;
  put(value: unknown, key: string[]): Promise<void>;
  delete(key: string[]): Promise<void>;
  idb: () => IDBPDatabase<unknown>;
}

export class EnsureDB {
  readonly url: URL;

  readonly id = uuidv4();
  readonly logger: Logger;

  constructor(url: URL, logger: Logger) {
    this.url = url;
    this.logger = ensureLogger(logger, "EnsureDB", {
      id: this.id,
      url: url,
    });
  }
  async get<T>(dbWorkFun: (arg0: SimpleDb) => Promise<T>): Promise<T> {
    return connectIdb(this.url, this.logger, dbWorkFun);
  }
  async close() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    await this.get(async (db) => {
      this.logger.Debug().Str("id", this.id).Msg(`close:${this.id}:${this.url.toString()}`);
      console.log(`close:${this.id}:${this.url.toString()}`);
      // await db.idb().close();
    });
  }
}

export class IndexDBDataStore extends DataStoreBase {
  readonly tag: string = "car-web-idb";

  readonly ensureDB: EnsureDB;

  constructor(name: string, url: URL, logger: Logger) {
    super(
      name,
      ensureVersion(url),
      ensureLogger(logger, "IndexDBDataStore", {
        name,
        url,
      }),
    );
    this.ensureDB = new EnsureDB(this.url, this.logger);
  }

  async start(): Promise<void> {
    // no-op
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    return await this.ensureDB.get(async (db) => {
      console.log("IndexDBDataStore:load", db.type, cid.toString());
      const bytes = (await db.get([cid.toString()])) as Uint8Array;
      // const tx = db.transaction([dbName.type], "readonly");
      // const bytes = (await tx.objectStore(dbName.type).get(cid.toString())) as Uint8Array;
      // await tx.done
      if (!bytes) {
        throw this.logger.Debug().Str("cid", cid.toString()).Msg(`ENOENT: missing idb block`).AsError();
      }
      return { cid, bytes };
    });
  }

  async save(car: AnyBlock): Promise<void> {
    return await this.ensureDB.get(async (db: SimpleDb) => {
      console.log("IndexDBDataStore:save", db.type, car.cid.toString());
      // await db.idb().put(getStore(this.url), car.bytes, car.cid.toString());
      // await db.put(car.bytes, [car.cid.toString()]);
      const tx = db.idb().transaction(getStore(this.url, this.logger), "readwrite");
      await tx.objectStore(getStore(this.url, this.logger)).put(car.bytes, car.cid.toString());
      await tx.done;
      return;
    });
  }

  async remove(cid: AnyLink): Promise<void> {
    return await this.ensureDB.get(async (db: SimpleDb) => {
      console.log("IndexDBDataStore:remove", db.type, cid.toString());
      // const tx = db.transaction([dbName.type], "readwrite");
      // await tx.objectStore(dbName.type).delete(cid.toString());
      // await tx.done
      await db.delete([cid.toString()]);
      return;
    });
  }
  async close() {
    // return this.ensureDB.close();
  }

  async destroy() {
    // return deleteDB(getIndexDBName(this.url).fullDb);
    await this.ensureDB.get(async (db) => {
      const type = db.type;
      // console.log("IndexDBDataStore:destroy", type);
      const idb = db.idb();
      const trans = idb.transaction(type, "readwrite");
      const object_store = trans.objectStore(type);
      const toDelete = [];
      for (let cursor = await object_store.openCursor(); cursor; cursor = await cursor.continue()) {
        toDelete.push(cursor.primaryKey);
      }
      for (const key of toDelete) {
        await trans.db.delete(type, key);
      }
      await trans.done;
    });
  }
}

export class IndexDBRemoteWAL extends RemoteWALBase {
  readonly tag: string = "wal-web-ls";

  readonly ensureDB: EnsureDB;

  readonly branches = new Set<string>();

  constructor(loader: Loadable, url: URL) {
    super(
      loader,
      ensureVersion(url),
      ensureLogger(loader.logger, "IndexDBRemoteWAL", {
        url,
        name: loader.name,
      }),
    );
    this.ensureDB = new EnsureDB(this.url, this.logger);
  }

  async start() {
    // no-op
  }

  headerKey(branch: string) {
    // return `fp.${this.STORAGE_VERSION}.wal.${this.loader.name}.${branch}`;
    // return getIndexDBName(this.url, "wal", branch).fullDb;
    return branch;
  }

  async _load(branch = "main"): Promise<WALState | Falsy> {
    this.branches.add(branch);
    return await this.ensureDB.get(async (db: SimpleDb) => {
      console.log("IndexDBRemoteWAL:load", db.type, branch);
      try {
        const bytesString = (await db.get([this.headerKey(branch)])) as string;
        if (!bytesString) return undefined;
        return parse<WALState>(bytesString);
      } catch (e) {
        this.logger.Error().Err(e).Msg("WebRemoteWAL:load:");
        return undefined;
      }
    });
  }

  async _save(state: WALState, branch = "main"): Promise<void> {
    this.branches.add(branch);
    return await this.ensureDB.get(async (db: SimpleDb) => {
      try {
        console.log("IndexDBRemoteWAL:save", db.type, branch);
        const encoded: ToString<WALState> = format(state);
        db.put(encoded, [this.headerKey(branch)]);
        // const tx = db.transaction([dbName.type], "readwrite");
        // await tx.objectStore(dbName.type).put(encoded, this.headerKey(branch));
        // await tx.done
        // localStorage.setItem(this.headerKey(branch), encoded);
      } catch (e) {
        throw this.logger.Error().Err(e).Msg("save:").AsError();
      }
    });
  }
  async _close() {
    // return this.ensureDB.close();
  }
  async _destroy() {
    await this.ensureDB.get(async (db) => {
      const type = db.type;
      // console.log("IndexDBRemoteWAL:destroy", type);
      const idb = db.idb();
      const trans = idb.transaction(type, "readwrite");
      for (const branch of this.branches) {
        await trans.db.delete(type, branch);
      }
      this.branches.clear();
      await trans.done;
    });
  }
}

export class IndexDBMetaStore extends MetaStoreBase {
  readonly tag: string = "header-web-ls";

  readonly ensureDB: EnsureDB;

  readonly id = uuidv4();

  constructor(name: string, url: URL, logger: Logger) {
    super(
      name,
      ensureVersion(url),
      ensureLogger(logger, "IndexDBMetaStore", {
        name,
        url,
      }),
    );
    this.ensureDB = new EnsureDB(this.url, this.logger);
  }

  async start() {
    // no-op
  }

  readonly branches = new Set<string>();
  headerKey(branch: string) {
    // return `fp.${this.STORAGE_VERSION}.meta.${this.name}.${branch}`;
    return branch; // getIndexDBName(this.url, "meta").fullDb;
  }

  async load(branch = "main"): Promise<DbMeta[] | Falsy> {
    this.branches.add(branch);
    return await this.ensureDB.get(async (db: SimpleDb) => {
      try {
        console.log("IndexDBMeta:load", db.type, branch);
        const bytesString = (await db.get([this.headerKey(branch)])) as string;
        if (!bytesString) {
          throw this.logger.Debug().Str("branch", branch).Msg(`ENOENT: missing idb block`).AsError();
        }
        // browser assumes a single writer process
        // to support concurrent updates to the same database across multiple tabs
        // we need to implement the same kind of mvcc.crdt solution as in store-fs and connect-s3
        return [this.parseHeader(bytesString)];
      } catch (e) {
        this.logger.Debug().Err(e).Msg("load");
        return undefined;
      }
    });
  }

  async save(meta: DbMeta, branch = "main") {
    this.branches.add(branch);
    return await this.ensureDB.get(async (db: SimpleDb) => {
      console.log("IndexDBMeta:save", db.type, branch);
      try {
        const headerKey = this.headerKey(branch);
        console.log(`xxxx->1`);
        const bytes = this.makeHeader(meta);
        console.log(`xxxx->2`, bytes, headerKey);
        await db.put(bytes, [headerKey]);
        // const tx = db.transaction([dbName.type], "readwrite");
        // await tx.objectStore(dbName.type).put(bytes, headerKey);
        // await tx.done
        // const tx = db.transaction([dbName.type], "readwrite");
        // await tx.objectStore(dbName.type).put(bytes, headerKey);
      } catch (e) {
        this.logger.Error().Err(e).Msg("save");
      }
      return undefined;
    });
  }

  async close() {
    // no-op
  }
  async destroy() {
    await this.ensureDB.get(async (db) => {
      const type = db.type;
      // console.log("IndexDBMeta:destroy", this.id, type);
      const idb = db.idb();
      const trans = idb.transaction(type, "readwrite");
      for (const branch of this.branches) {
        await trans.db.delete(type, branch);
      }
      this.branches.clear();
      await trans.done;
    });
  }
}

const txtEncoder = new TextEncoder();
export class IndexDBTestStore implements TestStore {
  readonly logger: Logger;
  constructor(
    readonly url: URL,
    logger: Logger,
  ) {
    this.logger = ensureLogger(logger, "IndexDBTestStore", {
      url,
    });
  }
  async get(key: string) {
    const ensureDB = new EnsureDB(this.url, this.logger);
    const ret = await ensureDB.get(async (db) => {
      console.log("IndexDBTestStore:get", this.url.toString(), key);
      let bytes = await db.get([key]);
      if (typeof bytes === "string") {
        bytes = txtEncoder.encode(bytes);
      }
      return bytes as Uint8Array;
    });
    // await ensureDB.close();
    return ret;
  }
}
