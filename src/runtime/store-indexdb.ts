import { openDB, IDBPDatabase } from "idb";
import { KeyedResolvOnce, Logger, Result } from "@adviser/cement";

import { TestStore } from "../blockstore/types.js";
import { INDEXDB_VERSION } from "./store-indexdb-version.js";
import { ensureLogger, exception2Result, exceptionWrapper, getKey, getStore } from "../utils.js";
import { Gateway, NotFoundError } from "../blockstore/gateway.js";
import { SysContainer } from "./sys-container.js";

function ensureVersion(url: URL): URL {
  const ret = new URL(url.toString());
  ret.searchParams.set("version", url.searchParams.get("version") || INDEXDB_VERSION);
  return ret;
}

export function guardVersion(url: URL): Result<URL> {
  if (!url.searchParams.has("version")) {
    return Result.Err(`missing version: ${url.toString()}`);
  }
  return Result.Ok(url);
}

const onceIndexDB = new KeyedResolvOnce<{
  readonly db: IDBPDatabase<unknown>;
  readonly dbName: DbName;
  readonly version: string;
}>();

function sanitzeKey(key: string | string[]): string | string[] {
  if (key.length === 1) {
    key = key[0];
  }
  return key;
}

async function connectIdb(url: URL, logger: Logger): Promise<IDBPDatabase<unknown>> {
  const dbName = getIndexDBName(url, logger); // `fp.${this.STORAGE_VERSION}.${this.name}`;
  // const urlStr = url.toString().replace(/\?.*$/, "");
  // console.log(`get:${this.id}`);
  // console.log(`connectIdb:pre:`, dbName, url.toString());
  const once = await onceIndexDB.get(dbName.fullDb).once(async () => {
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
    const version = url.searchParams.get("version") || INDEXDB_VERSION;
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
    return { db, dbName, version };
  });
  url.searchParams.set("version", once.version);
  return once.db;
}

export interface DbName {
  readonly fullDb: string;
  readonly objStore: string;
  readonly connectionKey: string;
  // readonly version: number;
  // readonly type: "data" | "meta" | "wal";
  readonly dbName: string;
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
  const objStore = getStore(url, logger, joinDBName);
  const connectionKey = [result, objStore].join(":");
  return {
    fullDb: result,
    objStore,
    connectionKey,
    dbName,
  };
}

abstract class IndexDBGateway implements Gateway {
  readonly logger: Logger;
  constructor(logger: Logger) {
    this.logger = logger;
  }
  db: IDBPDatabase<unknown> = {} as IDBPDatabase<unknown>;
  idb() {
    this.db;
  }

  async start(baseURL: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      this.logger.Debug().Url(baseURL).Msg("starting");
      await SysContainer.start();
      this.db = await connectIdb(baseURL, this.logger);
      this.logger.Debug().Url(baseURL).Msg("started");
    });
  }
  async close(): Promise<Result<void>> {
    return Result.Ok(undefined);
  }
  async destroy(baseUrl: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      // return deleteDB(getIndexDBName(this.url).fullDb);
      const type = getStore(baseUrl, this.logger, joinDBName);
      // console.log("IndexDBDataStore:destroy", type);
      const idb = this.db;
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

  abstract buildUrl(baseUrl: URL, key: string): Promise<Result<URL>>;

  async get(url: URL) {
    return exceptionWrapper(async () => {
      const key = getKey(url, this.logger);
      const store = getStore(url, this.logger, joinDBName);
      this.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("getting");
      const tx = this.db.transaction([store], "readonly");
      const bytes = await tx.objectStore(store).get(sanitzeKey(key));
      await tx.done;
      if (!bytes) {
        return Result.Err(new NotFoundError(`missing ${key}`));
      }
      return Result.Ok(bytes as Uint8Array);
    });
  }
  async put(url: URL, value: Uint8Array) {
    return exception2Result(async () => {
      const key = getKey(url, this.logger);
      const store = getStore(url, this.logger, joinDBName);
      this.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("putting");
      const tx = this.db.transaction([store], "readwrite");
      await tx.objectStore(store).put(value, sanitzeKey(key));
      await tx.done;
    });
  }
  async delete(url: URL) {
    return exception2Result(async () => {
      const key = getKey(url, this.logger);
      const store = getStore(url, this.logger, joinDBName);
      this.logger.Debug().Url(url).Str("key", key).Str("store", store).Msg("deleting");
      const tx = this.db.transaction([store], "readwrite");
      await tx.objectStore(store).delete(sanitzeKey(key));
      await tx.done;
      return Result.Ok(undefined);
    });
  }
}

export class IndexDBDataGateway extends IndexDBGateway {
  constructor(logger: Logger) {
    super(ensureLogger(logger, "IndexDBDataGateway", {}));
  }

  buildUrl(baseUrl: URL, key: string): Promise<Result<URL>> {
    const url = new URL(baseUrl.toString());
    url.searchParams.set("key", key);
    return Promise.resolve(Result.Ok(url));
  }
}

export class IndexDBWalGateway extends IndexDBGateway {
  constructor(logger: Logger) {
    super(ensureLogger(logger, "IndexDBWalGateway", {}));
  }
  buildUrl(baseUrl: URL, key: string): Promise<Result<URL>> {
    const url = new URL(baseUrl.toString());
    url.searchParams.set("key", key);
    return Promise.resolve(Result.Ok(url));
  }
}
export class IndexDBMetaGateway extends IndexDBGateway {
  constructor(logger: Logger) {
    super(ensureLogger(logger, "IndexDBDataGateway", {}));
  }

  readonly branches = new Set<string>();
  async buildUrl(baseUrl: URL, key: string): Promise<Result<URL>> {
    const url = new URL(baseUrl.toString());
    this.branches.add(key);
    url.searchParams.set("key", key);
    return Result.Ok(url);
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
    const db = await connectIdb(this.url, this.logger);
    const store = getStore(this.url, this.logger, joinDBName);
    this.logger.Debug().Str("key", key).Str("store", store).Msg("getting");
    let bytes = await db.get(store, sanitzeKey(key));
    this.logger.Debug().Str("key", key).Str("store", store).Int("len", bytes.length).Msg("got");
    if (typeof bytes === "string") {
      bytes = txtEncoder.encode(bytes);
    }
    return bytes as Uint8Array;
  }
}
