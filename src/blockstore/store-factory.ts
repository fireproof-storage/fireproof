import { Logger, KeyedResolvOnce } from "@adviser/cement";

import { dataDir } from "../runtime/data-dir.js";
import { decodeFile, encodeFile } from "../runtime/files.js";
import { Loadable } from "./loader.js";
import { DataStore, MetaStore, RemoteWAL } from "./store.js";
import { StoreOpts, StoreRuntime, TestStore } from "./types.js";
import { ensureLogger } from "../utils.js";
import { Gateway } from "./gateway.js";

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

function buildURL(optURL: string | URL | undefined, loader: Loadable): URL {
  const storeOpts = loader.ebOpts.store;
  return toURL(optURL || dataDir(loader.name, storeOpts.stores?.base), storeOpts.isIndex);
}

const onceLoadDataGateway = new KeyedResolvOnce<Gateway>();
function loadDataGateway(url: URL, logger: Logger) {
  return onceLoadDataGateway.get(url.protocol).once(async () => {
    logger.Debug().Str("protocol", url.protocol).Msg("pre-protocol switch");
    switch (url.protocol) {
      case "file:":
        {
          const { FileDataGateway } = await import("../runtime/store-file.js");
          return new FileDataGateway(logger);
        }
        break;
      case "indexdb:":
        {
          const { IndexDBDataGateway } = await import("../runtime/store-indexdb.js");
          return new IndexDBDataGateway(logger);
        }
        break;
      case "sqlite:":
        {
          const { SQLDataGateway } = await import("../runtime/store-sql/store-sql.js");
          return new SQLDataGateway(logger);
        }
        break;
      default:
        throw new Error(`unsupported data store ${url.protocol}`);
    }
  });
}

const onceDataStoreFactory = new KeyedResolvOnce<DataStore>();
async function dataStoreFactory(loader: Loadable): Promise<DataStore> {
  const url = buildURL(loader.ebOpts.store.stores?.data, loader);
  const logger = ensureLogger(loader.logger, "dataStoreFactory", { url: url.toString() });
  url.searchParams.set("store", "data");
  return onceDataStoreFactory.get(url.toString()).once(async () => {
    const gateway = await loadDataGateway(url, logger);
    const store = new DataStore(loader.name, url, loader.logger, gateway);
    await store.start();
    logger.Debug().Str("prepared", store.url.toString()).Msg("produced");
    return store;
  });
}

const onceLoadMetaGateway = new KeyedResolvOnce<Gateway>();
function loadMetaGateway(url: URL, logger: Logger) {
  return onceLoadMetaGateway.get(url.protocol).once(async () => {
    logger.Debug().Str("protocol", url.protocol).Msg("pre-protocol switch");
    switch (url.protocol) {
      case "file:":
        {
          const { FileMetaGateway } = await import("../runtime/store-file.js");
          return new FileMetaGateway(logger);
        }
        break;
      case "indexdb:":
        {
          const { IndexDBMetaGateway } = await import("../runtime/store-indexdb.js");
          return new IndexDBMetaGateway(logger);
        }
        break;
      case "sqlite:":
        {
          const { SQLMetaGateway } = await import("../runtime/store-sql/store-sql.js");
          return new SQLMetaGateway(logger);
        }
        break;
      default:
        throw new Error(`unsupported meta store ${url.protocol}`);
    }
  });
}

const onceMetaStoreFactory = new KeyedResolvOnce<MetaStore>();
async function metaStoreFactory(loader: Loadable): Promise<MetaStore> {
  const url = buildURL(loader.ebOpts.store.stores?.meta, loader);
  const logger = ensureLogger(loader.logger, "metaStoreFactory", { url: () => url.toString() });
  url.searchParams.set("store", "meta");
  return onceMetaStoreFactory.get(url.toString()).once(async () => {
    logger.Debug().Str("protocol", url.protocol).Msg("pre-protocol switch");
    const gateway = await loadMetaGateway(url, logger);
    const store = new MetaStore(loader.name, url, loader.logger, gateway);
    logger.Debug().Msg("pre-start");
    await store.start();
    logger.Debug().Msg("post-start");
    return store;
  });
}

const onceWalGateway = new KeyedResolvOnce<Gateway>();
function loadWalGateway(url: URL, logger: Logger) {
  return onceWalGateway.get(url.protocol).once(async () => {
    logger.Debug().Str("protocol", url.protocol).Msg("pre-protocol switch");
    switch (url.protocol) {
      case "file:":
        {
          const { FileWALGateway } = await import("../runtime/store-file.js");
          return new FileWALGateway(logger);
        }
        break;
      case "indexdb:":
        {
          const { IndexDBWalGateway } = await import("../runtime/store-indexdb.js");
          return new IndexDBWalGateway(logger);
        }
        break;
      case "sqlite:":
        {
          const { SQLWalGateway } = await import("../runtime/store-sql/store-sql.js");
          return new SQLWalGateway(logger);
        }
        break;
      default:
        throw new Error(`unsupported remote WAL store ${url.protocol}`);
    }
  });
}

const onceRemoteWalFactory = new KeyedResolvOnce<RemoteWAL>();
async function remoteWalFactory(loader: Loadable): Promise<RemoteWAL> {
  const url = buildURL(loader.ebOpts.store.stores?.meta, loader);
  const logger = ensureLogger(loader.logger, "remoteWalFactory", { url: url.toString() });
  url.searchParams.set("store", "wal");
  return onceRemoteWalFactory.get(url.toString()).once(async () => {
    const gateway = await loadWalGateway(url, logger);
    logger.Debug().Str("prepared", url.toString()).Msg("produced");
    const store = new RemoteWAL(loader, url, loader.logger, gateway);
    await store.start();
    return store;
  });
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

export function toStoreRuntime(opts: StoreOpts, ilogger: Logger): StoreRuntime {
  const logger = ensureLogger(ilogger, "toStoreRuntime", {});
  return {
    makeMetaStore: (loader: Loadable) => {
      logger
        .Debug()
        .Str("fromOpts", "" + !!loader.ebOpts.store.makeMetaStore)
        .Msg("makeMetaStore");
      return (loader.ebOpts.store.makeMetaStore || metaStoreFactory)(loader);
    },
    makeDataStore: (loader: Loadable) => {
      logger
        .Debug()
        .Str("fromOpts", "" + !!loader.ebOpts.store.makeDataStore)
        .Msg("makeDataStore");
      return (loader.ebOpts.store.makeDataStore || dataStoreFactory)(loader);
    },
    makeRemoteWAL: (loader: Loadable) => {
      logger
        .Debug()
        .Str("fromOpts", "" + !!loader.ebOpts.store.makeRemoteWAL)
        .Msg("makeRemoteWAL");
      return (loader.ebOpts.store.makeRemoteWAL || remoteWalFactory)(loader);
    },

    encodeFile: opts.encodeFile || encodeFile,
    decodeFile: opts.decodeFile || decodeFile,
  };
}
