import { Logger, KeyedResolvOnce, CoerceURI, URI } from "@adviser/cement";

import { decodeFile, encodeFile } from "../runtime/files.js";
import { DataStoreImpl, MetaStoreImpl, WALStoreImpl } from "./store.js";
import { Loadable, StoreOpts, StoreRuntime } from "./types.js";
import { dataDir, ensureLogger } from "../utils.js";
import { Gateway, TestGateway } from "./gateway.js";
import { getKeyBag } from "../runtime/key-bag.js";

function ensureIsIndex(url: URI, isIndex?: string): URI {
  if (isIndex) {
    return url.build().setParam("index", isIndex).URI();
  }
  return url.build().delParam("index").URI();
}

function ensureName(name: string, url: URI): URI {
  if (!url.hasParam("name")) {
    return url.build().setParam("name", name).URI();
  }
  return url
}

export interface GatewayFactoryItem {
  readonly protocol: string;
  readonly overrideBaseURL?: string; // if this set it overrides the defaultURL
  readonly overrideRegistration?: boolean; // if this is set, it will override the registration

  readonly gateway: (logger: Logger) => Promise<Gateway>;
  readonly test: (logger: Logger) => Promise<TestGateway>;
  // which switches between file and indexdb
  // readonly data: (logger: Logger) => Promise<Gateway>;
  // readonly meta: (logger: Logger) => Promise<Gateway>;
  // readonly wal: (logger: Logger) => Promise<Gateway>;
  // readonly test: (logger: Logger) => Promise<TestStore>;
}

const storeFactory = new Map<string, GatewayFactoryItem>();


function buildURL(optURL: CoerceURI, loader: Loadable): URI {
  const storeOpts = loader.ebOpts.store;
  const obuItem = Array.from(storeFactory.values()).find((items) => items.overrideBaseURL);
  let obuUrl: URI | undefined;
  if (obuItem && obuItem.overrideBaseURL) {
    obuUrl = URI.from(obuItem.overrideBaseURL);
  }
  return ensureIsIndex(
    URI.from(optURL || obuUrl || dataDir(loader.name, storeOpts.stores?.base)), storeOpts.isIndex);
}

interface GatewayReady {
  readonly gateway: Gateway;
  readonly test: TestGateway;
}
const onceGateway = new KeyedResolvOnce<GatewayReady>();
export async function getGatewayFromURL(url: URI, logger: Logger): Promise<GatewayReady | undefined> {
  return onceGateway.get(url.toString()).once(async () => {
    const item = storeFactory.get(url.protocol);
    if (item) {
      const ret = {
        gateway: await item.gateway(logger),
        test: await item.test(logger),
      }
      const res = await ret.gateway.start(url);
      if (res.isErr()) {
        logger.Error().Result("start", res).Msg("start failed");
        return undefined;
      }
      return ret;
    }
    logger.Warn().Url(url).Msg("unsupported protocol");
    return undefined;
  });
}

export function registerStoreProtocol(item: GatewayFactoryItem) {
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

// function runStoreFactory<T>(url: URI, logger: Logger, run: (item: StoreFactoryItem) => Promise<T>): Promise<T> {
//   // const store = url.getParam("store");
//   // if (!store) {
//   //   throw logger.Error().Url(url).Msg("store not found").AsError();
//   // }
//   // const key = `${url.protocol}:${store}`;
//   const item = storeFactory.get(url.protocol);
//   if (!item) {
//     throw logger
//       .Error()
//       .Url(url.asURL())
//       .Str("protocol", url.protocol)
//       .Any("keys", Array(storeFactory.keys()))
//       .Msg(`unsupported protocol`)
//       .AsError();
//   }
//   logger.Debug().Str("protocol", url.protocol).Msg("run");
//   return run(item);
// }

// const onceLoadDataGateway = new KeyedResolvOnce<Gateway>();
// function loadDataGateway(url: URI, logger: Logger) {
//   return onceLoadDataGateway.get(url.protocol).once(async () => {
//     return await getGatewayFromURL(url, logger).then((item) => {
//       if (!item) {
//         throw logger.Error().Url(url).Msg("unsupported protocol or store").AsError();
//       }
//       return item;
//     });
//   })
// }

const onceDataStoreFactory = new KeyedResolvOnce<DataStoreImpl>();
async function dataStoreFactory(loader: Loadable): Promise<DataStoreImpl> {
  const url = ensureName(loader.name, buildURL(loader.ebOpts.store.stores?.data, loader))
    .build().setParam("store", "data").URI();
  const logger = ensureLogger(loader.logger, "dataStoreFactory", { url: url.toString() });
  return onceDataStoreFactory.get(url.toString()).once(async () => {
    const gateway = await getGatewayFromURL(url, logger);
    if (!gateway) {
      throw logger.Error().Url(url).Msg("gateway not found").AsError();
    }
    const store = new DataStoreImpl(loader.name, url, {
      logger: loader.logger,
      gateway: gateway.gateway,
      keybag: () =>
        getKeyBag({
          logger: loader.logger,
          ...loader.ebOpts.keyBag,
        }),
    });
    const ret = await store.start();
    if (ret.isErr()) {
      throw logger.Error().Result("start", ret).Msg("start failed").AsError();
    }
    logger.Debug().Url(ret.Ok(), "prepared").Msg("produced");
    return store;
  });
}

// const onceLoadMetaGateway = new KeyedResolvOnce<Gateway>();
// function loadMetaGateway(url: URI, logger: Logger) {
//   return onceLoadMetaGateway.get(url.protocol).once(async () => {
//     return await getGatewayFromURL(url, logger).then((item) => {
//       if (!item) {
//         throw logger.Error().Url(url).Msg("unsupported protocol or store").AsError();
//       }
//       return item;
//     });
//   });
// }

const onceMetaStoreFactory = new KeyedResolvOnce<MetaStoreImpl>();
async function metaStoreFactory(loader: Loadable): Promise<MetaStoreImpl> {
  const url = ensureName(loader.name, buildURL(loader.ebOpts.store.stores?.meta, loader))
    .build().setParam("store", "meta").URI();
  const logger = ensureLogger(loader.logger, "metaStoreFactory", { url: () => url.toString() });
  return onceMetaStoreFactory.get(url.toString()).once(async () => {
    logger.Debug().Str("protocol", url.protocol).Msg("pre-protocol switch");
    const gateway = await getGatewayFromURL(url, logger);
    if (!gateway) {
      throw logger.Error().Url(url).Msg("gateway not found").AsError();
    }
    const store = new MetaStoreImpl(loader.name, url, {
      logger: loader.logger,
      gateway: gateway.gateway,
      keybag: () =>
        getKeyBag({
          logger: loader.logger,
          ...loader.ebOpts.keyBag,
        }),
    });
    const ret = await store.start();
    if (ret.isErr()) {
      throw logger.Error().Result("start", ret).Msg("start failed").AsError();
    }
    logger.Debug().Url(ret.Ok(), "prepared").Msg("produced");
    return store;
  });
}

// const onceWalGateway = new KeyedResolvOnce<Gateway>();
// function loadWalGateway(url: URI, logger: Logger) {
//   return onceWalGateway.get(url.protocol).once(async () => {
//     return await getGatewayFromURL(url, logger).then((item) => {
//       if (!item) {
//         throw logger.Error().Url(url).Msg("unsupported protocol or store").AsError();
//       }
//       return item;
//     });
//   });
// }

const onceRemoteWalFactory = new KeyedResolvOnce<WALStoreImpl>();
async function remoteWalFactory(loader: Loadable): Promise<WALStoreImpl> {
  const url = ensureName(loader.name, buildURL(loader.ebOpts.store.stores?.meta, loader))
    .build().setParam("store", "wal").URI();
  const logger = ensureLogger(loader.logger, "remoteWalFactory", { url: url.toString() });
  return onceRemoteWalFactory.get(url.toString()).once(async () => {
    const gateway = await getGatewayFromURL(url, logger);
    if (!gateway) {
      throw logger.Error().Url(url).Msg("gateway not found").AsError();
    }
    logger.Debug().Str("prepared", url.toString()).Msg("produced");
    const store = new WALStoreImpl(loader, url, {
      logger: loader.logger,
      gateway: gateway.gateway,
      keybag: () =>
        getKeyBag({
          logger: loader.logger,
          ...loader.ebOpts.keyBag,
        }),
    });
    const ret = await store.start();
    if (ret.isErr()) {
      throw logger.Error().Result("start", ret).Msg("start failed").AsError();
    }
    logger.Debug().Url(ret.Ok(), "prepared").Msg("produced");
    return store;
  });
}

export async function testStoreFactory(url: URI, ilogger?: Logger): Promise<TestGateway> {
  const logger = ensureLogger({ logger: ilogger }, "testStoreFactory");
  const gateway = await getGatewayFromURL(url, logger);
  if (!gateway) {
    throw logger.Error().Url(url).Msg("gateway not found").AsError();
  }
  return gateway.test;
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
  gateway: async (logger) => {
    const { FileGateway } = await import("../runtime/gateways/file/gateway.js");
    return new FileGateway(logger);
  },
  test: async (logger) => {
    const { FileTestStore } = await import("../runtime/gateways/file/gateway.js");
    return new FileTestStore(logger);
  }
});

registerStoreProtocol({
  protocol: "indexdb:",
  gateway: async (logger) => {
    const { IndexDBGateway } = await import("../runtime/gateways/indexdb/gateway.js");
    return new IndexDBGateway(logger);
  },
  test: async (logger) => {
    const { IndexDBTestStore } = await import("../runtime/gateways/indexdb/gateway.js");
    return new IndexDBTestStore(logger);
  },
});
