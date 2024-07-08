import { Logger, ResolveOnce } from "@adviser/cement";

import { dataDir } from "../runtime/data-dir.js";
import { decodeFile, encodeFile } from "../runtime/files.js";
import { Loadable } from "./loader.js";
import { RemoteWAL } from "./remote-wal.js";
import { DataStore, MetaStore } from "./store.js";
import { StoreOpts, StoreRuntime, TestStore } from "./types.js";
import { ensureLogger } from "../utils.js";

function ensureIsIndex(url: URL, isIndex?: string): URL {
  if (isIndex) {
    url.searchParams.set("index", isIndex);
    return url;
  } else {
    url.searchParams.delete("index");
    return url;
  }
}

export function toURL(pathOrUrl: string | URL, isIndex?: string): URL {
  if (pathOrUrl instanceof URL) return ensureIsIndex(pathOrUrl, isIndex);
  try {
    const url = new URL(pathOrUrl);
    return ensureIsIndex(url, isIndex);
  } catch (e) {
    const url = new URL(`file://${pathOrUrl}`);
    return ensureIsIndex(url, isIndex);
  }
}
interface StoreCache {
  readonly meta: ResolveOnce<MetaStore>;
  readonly data: ResolveOnce<DataStore>;
  readonly remoteWAL: ResolveOnce<RemoteWAL>;
}

const factoryCache = new Map<string, StoreCache>();

type StoreTypes = MetaStore | DataStore | RemoteWAL;

interface StoreFactories {
  readonly meta?: (url: URL, loader: Loadable) => Promise<MetaStore>;
  readonly data?: (url: URL, loader: Loadable) => Promise<DataStore>;
  readonly remoteWAL?: (url: URL, loader: Loadable) => Promise<RemoteWAL>;
}

async function cacheStore<T extends StoreTypes>(url: URL, loader: Loadable, sf: StoreFactories): Promise<T> {
  // console.log("cacheStore->", url.toString());
  const key = url.toString();
  let storeCache = factoryCache.get(key);
  if (!storeCache) {
    storeCache = {
      meta: new ResolveOnce<MetaStore>(),
      data: new ResolveOnce<DataStore>(),
      remoteWAL: new ResolveOnce<RemoteWAL>(),
    };
    factoryCache.set(key, storeCache);
  }
  if (sf.meta) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return storeCache.meta.once(() => sf.meta!(url, loader)) as Promise<T>;
  }
  if (sf.data) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return storeCache.data.once(() => sf.data!(url, loader)) as Promise<T>;
  }
  if (sf.remoteWAL) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return storeCache.remoteWAL.once(() => sf.remoteWAL!(url, loader)) as Promise<T>;
  }
  throw new Error("unsupported store type");
}

async function dataStoreFactory(iurl: URL, loader: Loadable): Promise<DataStore> {
  const url = new URL(iurl.toString());
  url.searchParams.set("store", "data");
  // console.log("dataStoreFactory->", url.toString());
  switch (url.protocol) {
    case "file:": {
      const { FileDataStore } = await import("../runtime/store-file.js");
      return new FileDataStore(url, loader.name, loader.logger);
    }
    case "indexdb:": {
      const { IndexDBDataStore } = await import("../runtime/store-indexdb.js");
      return new IndexDBDataStore(loader.name, url, loader.logger);
    }
    case "sqlite:": {
      const { SQLDataStore } = await import("../runtime/store-sql/store-sql.js");
      return new SQLDataStore(url, loader.name, loader.logger);
    }
    default:
      throw new Error(`unsupported data store ${url.protocol}`);
  }
}

async function metaStoreFactory(iurl: URL, loader: Loadable): Promise<MetaStore> {
  const url = new URL(iurl.toString());
  url.searchParams.set("store", "meta");
  switch (url.protocol) {
    case "file:": {
      const { FileMetaStore } = await import("../runtime/store-file.js");
      return new FileMetaStore(url, loader.name, loader.logger);
    }
    case "indexdb:": {
      const { IndexDBMetaStore } = await import("../runtime/store-indexdb.js");
      return new IndexDBMetaStore(loader.name, url, loader.logger);
    }
    case "sqlite:": {
      const { SQLMetaStore } = await import("../runtime/store-sql/store-sql.js");
      return new SQLMetaStore(url, loader.name, loader.logger);
    }
    default:
      throw new Error(`unsupported meta store ${url.protocol}`);
  }
}

async function remoteWalFactory(iurl: URL, loader: Loadable): Promise<RemoteWAL> {
  const url = new URL(iurl.toString());
  url.searchParams.set("store", "wal");
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

export async function testStoreFactory(url: URL, ilogger?: Logger): Promise<TestStore> {
  const logger = ensureLogger(
    {
      logger: ilogger,
    },
    "testStoreFactory",
  );
  switch (url.protocol) {
    case "file:": {
      const { FileTestStore } = await import("../runtime/store-file.js");
      return new FileTestStore(url, logger);
    }
    case "indexdb:": {
      const { IndexDBTestStore } = await import("../runtime/store-indexdb.js");
      return new IndexDBTestStore(url, logger);
    }
    case "sqlite:": {
      const { SQLTestStore } = await import("../runtime/store-sql/store-sql.js");
      return new SQLTestStore(url, logger);
    }
    default:
      throw new Error(`unsupported test store ${url.protocol}`);
  }
}

export function toStoreRuntime(name: string | undefined = undefined, opts: StoreOpts = {}): StoreRuntime {
  return {
    makeMetaStore: (loader: Loadable) => {
      return (
        opts.makeMetaStore?.(loader) ||
        cacheStore(toURL(opts.stores?.meta || dataDir(name || loader.name, opts.stores?.base), opts.isIndex), loader, {
          meta: metaStoreFactory,
        })
      );
    },
    makeDataStore: (loader: Loadable) => {
      return (
        opts.makeDataStore?.(loader) ||
        cacheStore(toURL(opts.stores?.data || dataDir(name || loader.name, opts.stores?.base), opts.isIndex), loader, {
          data: dataStoreFactory,
        })
      );
    },
    makeRemoteWAL: (loader: Loadable) => {
      return (
        opts.makeRemoteWAL?.(loader) ||
        cacheStore(toURL(opts.stores?.remoteWAL || dataDir(name || loader.name, opts.stores?.base), opts.isIndex), loader, {
          remoteWAL: remoteWalFactory,
        })
      );
    },

    encodeFile: opts.encodeFile || encodeFile,
    decodeFile: opts.decodeFile || decodeFile,
  };
}
