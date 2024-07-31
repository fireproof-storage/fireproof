import { Logger, KeyedResolvOnce } from "@adviser/cement";

import { dataDir } from "../runtime/data-dir.js";
import { decodeFile, encodeFile } from "../runtime/files.js";
import { Loadable } from "./loader.js";
import { DataStoreImpl, MetaStoreImpl, WALStoreImpl } from "./store.js";
import { StoreOpts, StoreRuntime, TestStore } from "./types.js";
import { ensureLogger } from "../utils.js";
import { Gateway } from "./gateway.js";
import { getKeyBag, } from "../runtime/key-bag.js";

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

export interface StoreFactoryItem {
  readonly protocol: string;
  readonly overrideBaseURL?: string; // if this set it overrides the defaultURL
  readonly overrideRegistration?: boolean; // if this is set, it will override the registration
  // which switches between file and indexdb
  readonly data: (logger: Logger) => Promise<Gateway>;
  readonly meta: (logger: Logger) => Promise<Gateway>;
  readonly wal: (logger: Logger) => Promise<Gateway>;
  readonly test: (logger: Logger) => Promise<TestStore>;
}

const storeFactory = new Map<string, StoreFactoryItem>();

function ensureName(name: string, url: URL) {
  if (!url.searchParams.has("name")) {
    url.searchParams.set("name", name);
  }
}

function buildURL(optURL: string | URL | undefined, loader: Loadable): URL {
  const storeOpts = loader.ebOpts.store;
  const obuItem = Array.from(storeFactory.values()).find((items) => items.overrideBaseURL);
  let obuUrl: URL | undefined;
  if (obuItem && obuItem.overrideBaseURL) {
    obuUrl = new URL(obuItem.overrideBaseURL);
  }
  return toURL(optURL || obuUrl || dataDir(loader.name, storeOpts.stores?.base), storeOpts.isIndex);
}

export async function getGatewayFromURL(url: URL, logger: Logger): Promise<Gateway | undefined> {
  const item = storeFactory.get(url.protocol);
  if (item) {
    let ret: Promise<Gateway>;
    switch (url.searchParams.get("store")) {
      case "data":
        ret = item.data(logger);
        break;
      case "meta":
        ret = item.meta(logger);
        break;
      case "wal":
        ret = item.wal(logger);
        break;
      default:
        logger.Warn().Url(url).Msg("unsupported store");
        return undefined;
    }
    const res = await (await ret).start(url);
    if (res.isErr()) {
      logger.Error().Result("start", res).Msg("start failed");
      return undefined;
    }
    return ret;
  }
  logger.Warn().Url(url).Msg("unsupported protocol");
  return undefined;
}

export function registerStoreProtocol(item: StoreFactoryItem) {
  let protocol = item.protocol;
  if (!protocol.endsWith(":")) {
    protocol += ":";
  }
  if (storeFactory.has(protocol)) {
    if (!item.overrideBaseURL && storeFactory.get(protocol) !== item) {
      const logger = ensureLogger({}, "registerStoreProtocol", { protocol });
      logger.Warn().Msg(`protocol ${protocol} already registered`);
      return () => {
        /* no-op */
      };
    }
  }
  // we need to clear the overrideBaseURL if it is set
  if (item.overrideBaseURL) {
    Array.from(storeFactory.values()).forEach((items) => {
      (
        items as {
          overrideBaseURL?: string;
        }
      ).overrideBaseURL = undefined;
    });
  }
  storeFactory.set(protocol, item);
  return () => {
    storeFactory.delete(protocol);
  };
}

function runStoreFactory<T>(url: URL, logger: Logger, run: (item: StoreFactoryItem) => Promise<T>): Promise<T> {
  const item = storeFactory.get(url.protocol);
  if (!item) {
    throw logger
      .Error()
      .Url(url)
      .Str("protocol", url.protocol)
      .Any("keys", Array(storeFactory.keys()))
      .Msg(`unsupported protocol`)
      .AsError();
  }
  logger.Debug().Str("protocol", url.protocol).Msg("run");
  return run(item);
}

const onceLoadDataGateway = new KeyedResolvOnce<Gateway>();
function loadDataGateway(url: URL, logger: Logger) {
  return onceLoadDataGateway.get(url.protocol).once(async () => {
    return runStoreFactory(url, logger, async (item) => item.data(logger));
  });
}

const onceDataStoreFactory = new KeyedResolvOnce<DataStoreImpl>();
async function dataStoreFactory(loader: Loadable): Promise<DataStoreImpl> {
  const url = buildURL(loader.ebOpts.store.stores?.data, loader);
  ensureName(loader.name, url);
  const logger = ensureLogger(loader.logger, "dataStoreFactory", { url: url.toString() });
  url.searchParams.set("store", "data");
  return onceDataStoreFactory.get(url.toString()).once(async () => {
    const gateway = await loadDataGateway(url, logger);
    const store = new DataStoreImpl(loader.name, url, {
      logger: loader.logger,
      gateway,
      keybag: () => getKeyBag({
        logger: loader.logger,
        ...loader.ebOpts.keyBag
      }),
    })

    const ret = await store.start();
    if (ret.isErr()) {
      throw logger.Error().Result("start", ret).Msg("start failed").AsError();
    }
    logger.Debug().Str("prepared", store.url.toString()).Msg("produced");
    return store;
  });
}

const onceLoadMetaGateway = new KeyedResolvOnce<Gateway>();
function loadMetaGateway(url: URL, logger: Logger) {
  return onceLoadMetaGateway.get(url.protocol).once(async () => {
    return runStoreFactory(url, logger, async (item) => item.meta(logger));
  });
}


const onceMetaStoreFactory = new KeyedResolvOnce<MetaStoreImpl>();
async function metaStoreFactory(loader: Loadable): Promise<MetaStoreImpl> {
  const url = buildURL(loader.ebOpts.store.stores?.meta, loader);
  ensureName(loader.name, url);
  const logger = ensureLogger(loader.logger, "metaStoreFactory", { url: () => url.toString() });
  url.searchParams.set("store", "meta");
  return onceMetaStoreFactory.get(url.toString()).once(async () => {
    logger.Debug().Str("protocol", url.protocol).Msg("pre-protocol switch");
    const gateway = await loadMetaGateway(url, logger);
    const store = new MetaStoreImpl(loader.name, url, {
      logger: loader.logger,
      gateway,
      keybag: () => getKeyBag({
        logger: loader.logger,
        ...loader.ebOpts.keyBag
      }),
    });
    const ret = await store.start();
    if (ret.isErr()) {
      throw logger.Error().Result("start", ret).Msg("start failed").AsError();
    }
    return store;
  });
}

const onceWalGateway = new KeyedResolvOnce<Gateway>();
function loadWalGateway(url: URL, logger: Logger) {
  return onceWalGateway.get(url.protocol).once(async () => {
    return runStoreFactory(url, logger, async (item) => item.wal(logger));
  });
}

const onceRemoteWalFactory = new KeyedResolvOnce<WALStoreImpl>();
async function remoteWalFactory(loader: Loadable): Promise<WALStoreImpl> {
  const url = buildURL(loader.ebOpts.store.stores?.meta, loader);
  ensureName(loader.name, url);
  const logger = ensureLogger(loader.logger, "remoteWalFactory", { url: url.toString() });
  url.searchParams.set("store", "wal");
  return onceRemoteWalFactory.get(url.toString()).once(async () => {
    const gateway = await loadWalGateway(url, logger);
    logger.Debug().Str("prepared", url.toString()).Msg("produced");
    const store = new WALStoreImpl(loader, url, {
      logger: loader.logger,
      gateway,
      keybag: () => getKeyBag({
        logger: loader.logger,
        ...loader.ebOpts.keyBag
      }),
    })
    const ret = await store.start();
    if (ret.isErr()) {
      throw logger.Error().Result("start", ret).Msg("start failed").AsError();
    }
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
  return runStoreFactory(url, logger, async (item) => item.test(logger));
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
    makeWALStore: (loader: Loadable) => {
      logger
        .Debug()
        .Str("fromOpts", "" + !!loader.ebOpts.store.makeWALStore)
        .Msg("makeRemoteWAL");
      return (loader.ebOpts.store.makeWALStore || remoteWalFactory)(loader);
    },

    encodeFile: opts.encodeFile || encodeFile,
    decodeFile: opts.decodeFile || decodeFile,
  };
}

registerStoreProtocol({
  protocol: "file:",
  data: async (logger) => {
    const { FileDataGateway } = await import("../runtime/gateways/file/gateway.js");
    return new FileDataGateway(logger);
  },
  meta: async (logger) => {
    const { FileMetaGateway } = await import("../runtime/gateways/file/gateway.js");
    return new FileMetaGateway(logger);
  },
  wal: async (logger) => {
    const { FileWALGateway } = await import("../runtime/gateways/file/gateway.js");
    return new FileWALGateway(logger);
  },
  test: async (logger) => {
    const { FileTestStore } = await import("../runtime/gateways/file/gateway.js");
    return new FileTestStore(logger);
  },
});

registerStoreProtocol({
  protocol: "indexdb:",
  data: async (logger) => {
    const { IndexDBDataGateway } = await import("../runtime/gateways/indexdb/gateway.js");
    return new IndexDBDataGateway(logger);
  },
  meta: async (logger) => {
    const { IndexDBMetaGateway } = await import("../runtime/gateways/indexdb/gateway.js");
    return new IndexDBMetaGateway(logger);
  },
  wal: async (logger) => {
    const { IndexDBMetaGateway } = await import("../runtime/gateways/indexdb/gateway.js");
    return new IndexDBMetaGateway(logger);
  },
  test: async (logger) => {
    const { IndexDBTestStore } = await import("../runtime/gateways/indexdb/gateway.js");
    return new IndexDBTestStore(logger);
  },
});
