import { Future } from "@adviser/cement";
import { dataDir } from "../runtime/data-dir.js";
import { decodeFile, encodeFile } from "../runtime/files.js";
import { Loadable } from "./loader.js";
import { RemoteWAL } from "./remote-wal.js";
import { DataStore, MetaStore } from "./store.js";
import { StoreOpts, StoreRuntime, TestStore } from "./types.js";

export function toURL(path: string | URL): URL {
  if (path instanceof URL) return path;
  try {
    const url = new URL(path);
    return url;
  } catch (e) {
    const url = new URL(`file://${path}`);
    return url;
  }
}

interface StoreWaiter<T> {
  cached?: T;
  readonly queued: Future<T>[];
}

interface StoreCache {
  readonly meta: StoreWaiter<MetaStore>;
  readonly data: StoreWaiter<DataStore>;
  readonly remoteWAL: StoreWaiter<RemoteWAL>;
}

const factoryCache = new Map<string, StoreCache>();

type StoreTypes = MetaStore | DataStore | RemoteWAL;

interface StoreFactories {
  readonly meta?: (url: URL, loader: Loadable) => Promise<MetaStore>;
  readonly data?: (url: URL, loader: Loadable) => Promise<DataStore>;
  readonly remoteWAL?: (url: URL, loader: Loadable) => Promise<RemoteWAL>;
}

async function waiter<T extends StoreTypes>(sw: StoreWaiter<T>, fn: () => Promise<T>): Promise<T> {
  if (sw.cached) {
    return Promise.resolve(sw.cached as T);
  }
  const future = new Future<T>();
  if (sw.queued.length === 0) {
    fn()
      .then((store) => {
        sw.cached = store;
        const queued = [...sw.queued];
        sw.queued.length = 0;
        queued.forEach((f) => f.resolve(store));
      })
      .catch((err) => {
        console.error("waiter->ERR", err);
      });
  }
  sw.queued.push(future);
  const ret = future.asPromise();
  return ret;
}

async function cacheStore<T extends StoreTypes>(url: URL, loader: Loadable, sf: StoreFactories): Promise<T> {
  const key = url.toString();
  let storeCache = factoryCache.get(key);
  if (!storeCache) {
    storeCache = {
      meta: { queued: [] },
      data: { queued: [] },
      remoteWAL: { queued: [] },
    };
    factoryCache.set(key, storeCache);
  }
  if (sf.meta) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return waiter(storeCache.meta, () => sf.meta!(url, loader)) as Promise<T>;
  }
  if (sf.data) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return waiter(storeCache.data, () => sf.data!(url, loader)) as Promise<T>;
  }
  if (sf.remoteWAL) {
    // console.log("cacheStore->wal->", url.toString());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return waiter(storeCache.remoteWAL, () => sf.remoteWAL!(url, loader)) as Promise<T>;
  }
  throw new Error("unsupported store type");
}

async function dataStoreFactory(url: URL, loader: Loadable): Promise<DataStore> {
  url.searchParams.set("store", "data");
  // console.log("dataStoreFactory->", url.toString());
  switch (url.protocol) {
    case "file:": {
      const { FileDataStore } = await import("../runtime/store-file.js");
      return new FileDataStore(url, loader.name);
    }
    case "indexdb:": {
      const { IndexDBDataStore, getIndexDBName } = await import("../runtime/store-indexdb.js");
      return new IndexDBDataStore(getIndexDBName(url, "data").dbName, url);
    }
    case "sqlite:": {
      const { SQLDataStore } = await import("../runtime/store-sql/store-sql.js");
      return new SQLDataStore(url, loader.name);
    }
    default:
      throw new Error(`unsupported data store ${url.protocol}`);
  }
}

async function metaStoreFactory(url: URL, loader: Loadable): Promise<MetaStore> {
  url.searchParams.set("store", "meta");
  switch (url.protocol) {
    case "file:": {
      const { FileMetaStore } = await import("../runtime/store-file.js");
      return new FileMetaStore(url, loader.name);
    }
    case "indexdb:": {
      const { IndexDBMetaStore, getIndexDBName } = await import("../runtime/store-indexdb.js");
      return new IndexDBMetaStore(getIndexDBName(url, "meta").dbName, url);
    }
    case "sqlite:": {
      const { SQLMetaStore } = await import("../runtime/store-sql/store-sql.js");
      return new SQLMetaStore(url, loader.name);
    }
    default:
      throw new Error(`unsupported meta store ${url.protocol}`);
  }
}

async function remoteWalFactory(url: URL, loader: Loadable): Promise<RemoteWAL> {
  url.searchParams.set("store", "remoteWAL");
  switch (url.protocol) {
    case "file:": {
      const { FileRemoteWAL } = await import("../runtime/store-file.js");
      return new FileRemoteWAL(url, loader);
    }
    case "indexdb:": {
      const { IndexDBRemoteWAL } = await import("../runtime/store-indexdb.js");
      const wal = new IndexDBRemoteWAL(loader, url);
      return wal;
    }
    case "sqlite:": {
      const { SQLRemoteWAL } = await import("../runtime/store-sql/store-sql.js");
      return new SQLRemoteWAL(url, loader);
    }
    default:
      throw new Error(`unsupported remote WAL store ${url.protocol}`);
  }
}

export async function testStoreFactory(url: URL): Promise<TestStore> {
  switch (url.protocol) {
    case "file:": {
      const { FileTestStore } = await import("../runtime/store-file.js");
      return new FileTestStore(url);
    }
    case "indexdb:": {
      const { IndexDBTestStore } = await import("../runtime/store-indexdb.js");
      return new IndexDBTestStore(url);
    }
    case "sqlite:": {
      const { SQLTestStore } = await import("../runtime/store-sql/store-sql.js");
      return new SQLTestStore(url);
    }
    default:
      throw new Error(`unsupported test store ${url.protocol}`);
  }
}

export function toStoreRuntime(name: string | undefined = undefined, opts: StoreOpts = {}): StoreRuntime {
  return {
    makeMetaStore: (loader: Loadable) =>
      cacheStore(toURL(opts.stores?.meta || dataDir(name || loader.name)), loader, {
        meta: metaStoreFactory,
      }),
    makeDataStore: (loader: Loadable) =>
      cacheStore(toURL(opts.stores?.data || dataDir(name || loader.name)), loader, {
        data: dataStoreFactory,
      }),
    makeRemoteWAL: (loader: Loadable) =>
      cacheStore(toURL(opts.stores?.remoteWAL || dataDir(name || loader.name)), loader, {
        remoteWAL: remoteWalFactory,
      }),

    encodeFile,
    decodeFile,
  };
}
