import { openDB, IDBPDatabase } from "idb";
import { exception2Result, KeyedResolvOnce, ResolveOnce, Result, URI } from "@adviser/cement";

import { INDEXEDDB_VERSION } from "@fireproof/core-gateways-base";
import { NotFoundError, PARAM, SuperThis } from "@fireproof/core-types-base";
import { exceptionWrapper, getKey, getStore } from "@fireproof/core-runtime";
import { Gateway, GetResult } from "@fireproof/core-types-blockstore";
import { ReadDummyIDBPDatabase } from "./dummy-idb.js";

function ensureVersion(url: URI): URI {
  return url.build().defParam(PARAM.VERSION, INDEXEDDB_VERSION).URI();
}

interface IDBConn {
  readonly db: IDBPDatabase;
  readonly dbName: DbName;
  readonly version: string;
  readonly url: URI;
}
const onceIndexedDB = new KeyedResolvOnce<IDBConn>();

function sanitzeKey(key: string | string[]): string | string[] {
  if (key.length === 1) {
    key = key[0];
  }
  return key;
}

const listDatabases = new ResolveOnce();

function onceCreateDB(dbName: DbName, url: URI, sthis: SuperThis): () => Promise<IDBConn> {
  return async () => {
    const db = await openDB(dbName.fullDb, 1, {
      upgrade(db) {
        ["version", "data", "wal", "meta", "idx.data", "idx.wal", "idx.meta"].map((store) => {
          db.createObjectStore(store, {
            autoIncrement: false,
          });
        });
      },
    });
    // console.log("created", dbName.fullDb, (new Error()).stack);
    listDatabases.reset(); // not cool but easy
    const found = await db.get("version", "version");
    const version = ensureVersion(url).getParam(PARAM.VERSION)!;
    if (!found) {
      await db.put("version", { version }, "version");
    } else if (found.version !== version) {
      sthis.logger.Warn().Url(url).Str("version", version).Str("found", found.version).Msg("version mismatch");
    }
    return { db, dbName, version, url };
  };
}

async function connectIdb(style: "read" | "write" | "delete" | "close", url: URI, sthis: SuperThis): Promise<IDBConn> {
  const dbName = getIndexedDBName(url, sthis);
  if (style === "close") {
    if (onceIndexedDB.has(dbName.fullDb)) {
      const ic = await onceIndexedDB.get(dbName.fullDb).once((): Promise<IDBConn> => Promise.reject(new Error("not open")));
      ic.db.close();
      onceIndexedDB.unget(dbName.fullDb);
    }
    return undefined as unknown as IDBConn; // do you at sleep - paradox
  }
  if (style === "read" || style === "delete") {
    // test existing without creating
    if (!onceIndexedDB.has(dbName.fullDb)) {
      const dbs = await listDatabases.once(() => indexedDB.databases());
      if (!dbs.find((i) => i.name === dbName.fullDb)) {
        const verUrl = ensureVersion(url);
        return {
          db: new ReadDummyIDBPDatabase(dbName.fullDb),
          dbName,
          version: verUrl.getParam(PARAM.VERSION, INDEXEDDB_VERSION),
          url: verUrl,
        };
      }
    }
  }
  return onceIndexedDB.get(dbName.fullDb).once(onceCreateDB(dbName, url, sthis));
}

export interface DbName {
  readonly fullDb: string;
  readonly objStore: string;
  readonly connectionKey: string;
  readonly dbName: string;
}

function joinDBName(...names: string[]): string {
  return names
    .map((i) => i.replace(/^[^a-zA-Z0-9]+/g, "").replace(/[^a-zA-Z0-9-]+/g, "_"))
    .filter((i) => i.length)
    .join(".");
}

export function getIndexedDBName(iurl: URI, sthis: SuperThis): DbName {
  const url = ensureVersion(iurl);
  const fullDb = url.pathname.replace(/^\/+/, "").replace(/\?.*$/, ""); // cut leading slashes
  const dbName = url.getParam(PARAM.NAME);
  if (!dbName) throw sthis.logger.Error().Str("url", url.toString()).Msg(`name not found`).AsError();
  const result = joinDBName(fullDb, dbName);
  const objStore = getStore(url, sthis, joinDBName).name;
  const connectionKey = [result, objStore].join(":");
  return {
    fullDb: result,
    objStore,
    connectionKey,
    dbName,
  };
}

export class IndexedDBGateway implements Gateway {
  async start(baseURL: URI, sthis: SuperThis): Promise<Result<URI>> {
    return exception2Result(async () => {
      await sthis.start();
      sthis.logger.Debug().Url(baseURL).Msg("starting");
      const ic = await connectIdb("read", baseURL, sthis);
      sthis.logger.Debug().Url(ic.url).Msg("started");
      return baseURL.build().setParam(PARAM.VERSION, ic.version).URI();
    });
  }
  async close(url: URI, sthis: SuperThis): Promise<Result<void>> {
    await connectIdb("close", url, sthis);
    return Result.Ok(undefined);
  }
  async destroy(baseUrl: URI, sthis: SuperThis): Promise<Result<void>> {
    return exception2Result(async () => {
      // return deleteDB(getIndexedDBName(this.url).fullDb);
      const type = getStore(baseUrl, sthis, joinDBName).name;
      const idb = await connectIdb("write", baseUrl, sthis);
      const trans = idb.db.transaction(type, "readwrite");
      const object_store = trans.objectStore(type);
      // console.log("IndexedDBDataStore:destroy", type);
      const toDelete = [];
      for (let cursor = await object_store.openCursor(); cursor; cursor = await cursor.continue()) {
        toDelete.push(cursor.primaryKey);
      }
      for (const key of toDelete) {
        await trans.db.delete(type, key);
      }
      await trans.done;
      // console.log("IndexedDBDataStore:destroy-completed", type);
    });
  }

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.KEY, key).URI()));
  }

  async get(url: URI, sthis: SuperThis): Promise<GetResult> {
    return exceptionWrapper(async () => {
      const key = getKey(url, sthis.logger);
      const store = getStore(url, sthis, joinDBName).name;
      sthis.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("getting");
      const idb = await connectIdb("read", url, sthis);
      const tx = idb.db.transaction([store], "readonly");
      const bytes = await tx.objectStore(store).get(sanitzeKey(key));
      await tx.done;
      if (!bytes) {
        return Result.Err(new NotFoundError(`missing ${key} ${url.toString()}`));
      }
      return Promise.resolve(Result.Ok(bytes));
    });
  }
  async put(url: URI, bytes: Uint8Array, sthis: SuperThis): Promise<Result<void>> {
    return exception2Result(async () => {
      const key = getKey(url, sthis.logger);
      const store = getStore(url, sthis, joinDBName).name;
      sthis.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("putting");
      const idb = await connectIdb("write", url, sthis);
      const tx = idb.db.transaction([store], "readwrite");
      await tx.objectStore(store).put(bytes, sanitzeKey(key));
      await tx.done;
    });
  }
  async delete(url: URI, sthis: SuperThis) {
    return exception2Result(async () => {
      const key = getKey(url, sthis.logger);
      const store = getStore(url, sthis, joinDBName).name;
      sthis.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("deleting");
      const idb = await connectIdb("delete", url, sthis);
      const tx = idb.db.transaction([store], "readwrite");
      await tx.objectStore(store).delete(sanitzeKey(key));
      await tx.done;
      return Result.Ok(undefined);
    });
  }

  async getPlain(url: URI, key: string, sthis: SuperThis): Promise<Result<Uint8Array>> {
    const ic = await connectIdb("read", url, sthis);
    const store = getStore(ic.url, sthis, joinDBName).name;
    sthis.logger.Debug().Str("key", key).Str("store", store).Msg("getting");
    let bytes = await ic.db.get(store, sanitzeKey(key));
    sthis.logger.Debug().Str("key", key).Str("store", store).Int("len", bytes.length).Msg("got");
    if (typeof bytes === "string") {
      bytes = sthis.txt.encode(bytes);
    }
    return Result.Ok(bytes as Uint8Array);
  }
}
