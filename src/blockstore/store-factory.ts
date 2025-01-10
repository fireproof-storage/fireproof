import { Logger, KeyedResolvOnce, URI, Result } from "@adviser/cement";

import { decodeFile, encodeFile } from "../runtime/files.js";
import { DataStoreImpl, MetaStoreImpl, WALStoreImpl } from "./store.js";
import { StoreEnDeFile, StoreFactoryItem, StoreRuntime } from "./types.js";
import { PARAM, SuperThis } from "../types.js";
import { getGatewayFactoryItem } from "./register-store-protocol.js";
import { SerdeGateway } from "./serde-gateway.js";

interface SerdeGatewayInstances {
  readonly gateway: SerdeGateway;
}
interface GatewayReady extends SerdeGatewayInstances {
  readonly url: URI;
}

const onceGateway = new KeyedResolvOnce<GatewayReady>();
const gatewayInstances = new KeyedResolvOnce<SerdeGatewayInstances>();
export async function getStartedGateway(sthis: SuperThis, url: URI): Promise<Result<GatewayReady>> {
  return onceGateway.get(url.toString()).once(async () => {
    const item = getGatewayFactoryItem(url.protocol);
    if (item) {
      const ret = {
        url,
        ...(await gatewayInstances.get(url.protocol).once(async () => ({}))),
        gateway: await item.serdegateway(sthis),
      };
      const res = await ret.gateway.start(sthis, url);
      if (res.isErr()) {
        return Result.Err(sthis.logger.Error().Result("start", res).Msg("start failed").AsError());
      }
      ret.url = res.Ok();
      return Result.Ok(ret);
    }
    return Result.Err(sthis.logger.Warn().Url(url).Msg("unsupported protocol").AsError());
  });
}

async function dataStoreFactory(sfi: StoreFactoryItem): Promise<DataStoreImpl> {
  const storeUrl = sfi.url.build().setParam(PARAM.STORE, "data").URI();
  const rgateway = await getStartedGateway(sfi.sthis, storeUrl);
  if (rgateway.isErr()) {
    throw sfi.sthis.logger.Error().Result("err", rgateway).Url(sfi.url).Msg("notfound").AsError();
  }
  const gateway = rgateway.Ok();
  const store = new DataStoreImpl(sfi.sthis, gateway.url, {
    gateway: gateway.gateway,
    gatewayInterceptor: sfi.gatewayInterceptor,
    loader: sfi.loader,
  });
  return store;
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

// const onceMetaStoreFactory = new KeyedResolvOnce<MetaStoreImpl>();
async function metaStoreFactory(sfi: StoreFactoryItem): Promise<MetaStoreImpl> {
  const storeUrl = sfi.url.build().setParam(PARAM.STORE, "meta").URI();
  const rgateway = await getStartedGateway(sfi.sthis, storeUrl);
  if (rgateway.isErr()) {
    throw sfi.sthis.logger.Error().Result("err", rgateway).Url(sfi.url).Msg("notfound").AsError();
  }
  const gateway = rgateway.Ok();
  const store = new MetaStoreImpl(sfi.sthis, gateway.url, {
    gateway: gateway.gateway,
    gatewayInterceptor: sfi.gatewayInterceptor,
    loader: sfi.loader,
  });
  return store;
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

// const onceRemoteWalFactory = new KeyedResolvOnce<WALStoreImpl>();
async function WALStoreFactory(sfi: StoreFactoryItem): Promise<WALStoreImpl> {
  const storeUrl = sfi.url.build().setParam(PARAM.STORE, "wal").URI();
  const rgateway = await getStartedGateway(sfi.sthis, storeUrl);
  if (rgateway.isErr()) {
    throw sfi.sthis.logger.Error().Result("err", rgateway).Url(sfi.url).Msg("notfound").AsError();
  }
  const gateway = rgateway.Ok();
  const store = new WALStoreImpl(sfi.sthis, gateway.url, {
    gateway: gateway.gateway,
    gatewayInterceptor: sfi.gatewayInterceptor,
    loader: sfi.loader,
  });
  return store;
}

async function ensureStart<T>(store: T & { start: () => Promise<Result<URI>>; logger: Logger }): Promise<T> {
  const ret = await store.start();
  if (ret.isErr()) {
    throw store.logger.Error().Result("start", ret).Msg("start failed").AsError();
  }
  store.logger.Debug().Url(ret.Ok(), "prepared").Msg("produced");
  return store;
}

export function ensureStoreEnDeFile(ende?: Partial<StoreEnDeFile>): StoreEnDeFile {
  ende = ende || {};
  return {
    encodeFile: ende.encodeFile || encodeFile,
    decodeFile: ende.decodeFile || decodeFile,
  };
}

export function toStoreRuntime(sthis: SuperThis, endeOpts: Partial<StoreEnDeFile> = {}): StoreRuntime {
  // const logger = ensureLogger(sthis, "toStoreRuntime", {});
  return {
    makeMetaStore: async (sfi: StoreFactoryItem) => ensureStart(await metaStoreFactory(sfi)),
    // async (loader: Loadable) => {
    //   logger
    //     .Debug()
    //     .Str("fromOpts", "" + !!endeOpts.func?.makeMetaStore)
    //     .Msg("makeMetaStore");
    //   return ensureStart(await (endeOpts.func?.makeMetaStore || metaStoreFactory)(loader), logger);
    // },
    makeDataStore: async (sfi: StoreFactoryItem) => ensureStart(await dataStoreFactory(sfi)),
    // async (loader: Loadable) => {
    //   logger
    //     .Debug()
    //     .Str("fromOpts", "" + !!endeOpts.func?.makeDataStore)
    //     .Msg("makeDataStore");
    //   return ensureStart(await (endeOpts.func?.makeDataStore || dataStoreFactory)(loader), logger);
    // },
    makeWALStore: async (sfi: StoreFactoryItem) => ensureStart(await WALStoreFactory(sfi)),
    // async (loader: Loadable) => {
    //   logger
    //     .Debug()
    //     .Str("fromOpts", "" + !!endeOpts.func?.makeWALStore)
    //     .Msg("makeRemoteWAL");
    //   return ensureStart(await (endeOpts.func?.makeWALStore || remoteWalFactory)(loader), logger);
    // },

    ...ensureStoreEnDeFile(endeOpts),
  };
}
