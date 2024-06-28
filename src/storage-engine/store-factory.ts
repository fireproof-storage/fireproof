import { Future } from "@adviser/cement";
import { dataDir } from "../runtime/data-dir.js";
import { decodeFile, encodeFile } from "../runtime/files.js";
import { Loadable } from "./loader.js";
import { RemoteWAL } from "./remote-wal.js";
import { DataStore, MetaStore } from "./store.js";
import { StoreOpts, StoreRuntime } from "./types.js";

function toURL(path: string | URL): URL {
  if (path instanceof URL) return path;
  try {
    const url = new URL(path);
    // console.log("toURL->", path, url.toString());
    return url
  } catch (e) {
    const url = new URL(`file://${path}`); // `file://${path}
    // console.log("add file toURL->", path, url.toString());
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
    fn().then((store) => {
      sw.cached = store;
      const queued = [...sw.queued];
      sw.queued.length = 0;
      queued.forEach((f) => f.resolve(store));
    });
  }
  sw.queued.push(future);
  return future.asPromise();
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return waiter(storeCache.remoteWAL, () => sf.remoteWAL!(url, loader)) as Promise<T>;
  }
  throw new Error("unsupported store type");
}

async function dataStoreFactory(url: URL, loader: Loadable): Promise<DataStore> {
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
      const { SQLDataStore } = await import("../runtime/store-sql/store-sql.js")
      return new SQLDataStore(url, loader.name);
    }
    default:
      throw new Error(`unsupported data store ${url.protocol}`);
  }
}

async function metaStoreFactory(url: URL, loader: Loadable): Promise<MetaStore> {
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
      const { SQLMetaStore } = await import("../runtime/store-sql/store-sql.js")
      return new SQLMetaStore(url, loader.name);
    }
    default:
      throw new Error(`unsupported meta store ${url.protocol}`);
  }
}

async function remoteWalFactory(url: URL, loader: Loadable): Promise<RemoteWAL> {
  switch (url.protocol) {
    case "file:": {
      const { FileRemoteWAL } = await import("../runtime/store-file.js");
      return new FileRemoteWAL(url, loader);
    }
    case "indexdb:": {
      const { IndexDBRemoteWAL } = await import("../runtime/store-indexdb.js");
      return new IndexDBRemoteWAL(loader, url);
    }
    case "sqlite:": {
      const { SQLRemoteWAL } = await import("../runtime/store-sql/store-sql.js")
      return new SQLRemoteWAL(url, loader);
    }
    default:
      throw new Error(`unsupported remote WAL store ${url.protocol}`);
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