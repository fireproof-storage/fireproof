import { openDB, IDBPDatabase } from "idb";
import { exception2Result, KeyedResolvOnce, Result, URI } from "@adviser/cement";

import { INDEXEDDB_VERSION } from "../indexeddb-version.js";
import { NotFoundError, PARAM, exceptionWrapper, getKey, getStore, type SuperThis, bs } from "@fireproof/core";

function ensureVersion(url: URI): URI {
  return url.build().defParam(PARAM.VERSION, INDEXEDDB_VERSION).URI();
}

interface IDBConn {
  readonly db: IDBPDatabase<unknown>;
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

async function connectIdb(url: URI, sthis: SuperThis): Promise<IDBConn> {
  const dbName = getIndexedDBName(url, sthis);
  const once = await onceIndexedDB.get(dbName.fullDb).once(async () => {
    const db = await openDB(dbName.fullDb, 1, {
      upgrade(db) {
        ["version", "data", "wal", "meta", "idx.data", "idx.wal", "idx.meta"].map((store) => {
          db.createObjectStore(store, {
            autoIncrement: false,
          });
        });
      },
    });
    const found = await db.get("version", "version");
    const version = ensureVersion(url).getParam(PARAM.VERSION) as string;
    if (!found) {
      await db.put("version", { version }, "version");
    } else if (found.version !== version) {
      sthis.logger.Warn().Url(url).Str("version", version).Str("found", found.version).Msg("version mismatch");
    }
    return { db, dbName, version, url };
  });
  return {
    ...once,
    url: url.build().setParam(PARAM.VERSION, once.version).URI(),
  };
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

export class IndexedDBGateway implements bs.Gateway {
  _db: IDBPDatabase<unknown> = {} as IDBPDatabase<unknown>;

  async start(baseURL: URI, sthis: SuperThis): Promise<Result<URI>> {
    return exception2Result(async () => {
      await sthis.start();
      sthis.logger.Debug().Url(baseURL).Msg("starting");
      const ic = await connectIdb(baseURL, sthis);
      this._db = ic.db;
      sthis.logger.Debug().Url(ic.url).Msg("started");
      return ic.url;
    });
  }
  async close(): Promise<Result<void>> {
    return Result.Ok(undefined);
  }
  async destroy(baseUrl: URI, sthis: SuperThis): Promise<Result<void>> {
    return exception2Result(async () => {
      // return deleteDB(getIndexedDBName(this.url).fullDb);
      const type = getStore(baseUrl, sthis, joinDBName).name;
      const idb = this._db;
      const trans = idb.transaction(type, "readwrite");
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

  async get(url: URI, sthis: SuperThis): Promise<bs.GetResult> {
    return exceptionWrapper(async () => {
      const key = getKey(url, sthis.logger);
      const store = getStore(url, sthis, joinDBName).name;
      sthis.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("getting");
      const tx = this._db.transaction([store], "readonly");
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
      const tx = this._db.transaction([store], "readwrite");
      await tx.objectStore(store).put(bytes, sanitzeKey(key));
      await tx.done;
    });
  }
  async delete(url: URI, sthis: SuperThis) {
    return exception2Result(async () => {
      const key = getKey(url, sthis.logger);
      const store = getStore(url, sthis, joinDBName).name;
      sthis.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("deleting");
      const tx = this._db.transaction([store], "readwrite");
      await tx.objectStore(store).delete(sanitzeKey(key));
      await tx.done;
      return Result.Ok(undefined);
    });
  }

  async getPlain(url: URI, key: string, sthis: SuperThis): Promise<Result<Uint8Array>> {
    const ic = await connectIdb(url, sthis);
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
