import { Logger, URI, Result } from "@adviser/cement";

import { decodeFile, encodeFile } from "../runtime/files.js";
import { CarStoreImpl, FileStoreImpl, MetaStoreImpl, WALStoreImpl } from "./store.js";
import {
  BaseStore,
  CarStore,
  DataAndMetaAndWalStore,
  FileStore,
  StoreEnDeFile,
  StoreFactoryItem,
  StoreRuntime,
  UrlAndInterceptor,
  WriteableDataAndMetaAndWalStore,
} from "./types.js";
import { PARAM, SuperThis } from "../types.js";
import { getGatewayFactoryItem } from "./register-store-protocol.js";
import { SerdeGatewayCtx, SerdeGatewayInterceptor } from "./serde-gateway.js";
import { InterceptorGateway } from "./interceptor-gateway.js";

// interface SerdeGatewayInstances {
//   readonly gateway: InterceptorGateway;
// }
// interface GatewayReady extends SerdeGatewayInstances {
//   // readonly url: URI;
// }

export async function getInterceptableGateway(
  ctx: SerdeGatewayCtx,
  url: URI,
  opt: { gatewayInterceptor?: SerdeGatewayInterceptor },
): Promise<Result<InterceptorGateway>> {
  const item = getGatewayFactoryItem(url.protocol);
  if (item) {
    return Result.Ok(new InterceptorGateway(ctx.loader.sthis, await item.serdegateway(ctx.loader.sthis), opt.gatewayInterceptor));
  }
  return Result.Err(ctx.loader.sthis.logger.Warn().Url(url).Msg("unsupported protocol").AsError());
}

async function carStoreFactory(ctx: SerdeGatewayCtx, uai: UrlAndInterceptor): Promise<CarStore> {
  const storeUrl = uai.url.build().setParam(PARAM.STORE, "car").URI();
  const rgateway = await getInterceptableGateway(ctx, storeUrl, uai);
  if (rgateway.isErr()) {
    throw ctx.loader.sthis.logger.Error().Result("err", rgateway).Url(uai.url).Msg("notfound").AsError();
  }
  const gateway = rgateway.Ok();
  const store = new CarStoreImpl(ctx.loader.sthis, uai.url, {
    gateway,
    loader: ctx.loader,
  });
  return store;
}

async function fileStoreFactory(ctx: SerdeGatewayCtx, uai: UrlAndInterceptor): Promise<FileStore> {
  const storeUrl = uai.url.build().setParam(PARAM.STORE, "file").URI();
  const rgateway = await getInterceptableGateway(ctx, storeUrl, uai);
  if (rgateway.isErr()) {
    throw ctx.loader.sthis.logger.Error().Result("err", rgateway).Url(uai.url).Msg("notfound").AsError();
  }
  const gateway = rgateway.Ok();
  const store = new FileStoreImpl(ctx.loader.sthis, uai.url, {
    gateway: gateway,
    loader: ctx.loader,
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
async function metaStoreFactory(ctx: SerdeGatewayCtx, uai: UrlAndInterceptor): Promise<MetaStoreImpl> {
  const storeUrl = uai.url.build().setParam(PARAM.STORE, "meta").URI();
  const rgateway = await getInterceptableGateway(ctx, storeUrl, uai);
  if (rgateway.isErr()) {
    throw ctx.loader.sthis.logger.Error().Result("err", rgateway).Url(uai.url).Msg("notfound").AsError();
  }
  const gateway = rgateway.Ok();
  const store = new MetaStoreImpl(ctx.loader.sthis, uai.url, {
    gateway,
    loader: ctx.loader,
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
async function WALStoreFactory(ctx: SerdeGatewayCtx, uai: UrlAndInterceptor): Promise<WALStoreImpl> {
  const storeUrl = uai.url.build().setParam(PARAM.STORE, "wal").URI();
  const rgateway = await getInterceptableGateway(ctx, storeUrl, uai);
  if (rgateway.isErr()) {
    throw ctx.loader.sthis.logger.Error().Result("err", rgateway).Url(uai.url).Msg("notfound").AsError();
  }
  const gateway = rgateway.Ok();
  const store = new WALStoreImpl(ctx.loader.sthis, uai.url, {
    gateway,
    loader: ctx.loader,
  });
  return store;
}

async function ensureStart<T extends Pick<BaseStore, "start"> & { logger: Logger }>(
  store: T,
  damaw: DataAndMetaAndWalStore,
): Promise<T> {
  const ret = await store.start(damaw);
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
    makeStores: async (sfi: StoreFactoryItem) => {
      const ctx: SerdeGatewayCtx = {
        loader: sfi.loader,
      };
      const storeSet: WriteableDataAndMetaAndWalStore = {} as DataAndMetaAndWalStore;
      storeSet.meta = await metaStoreFactory(ctx, sfi.byStore.meta);
      storeSet.car = await carStoreFactory(ctx, sfi.byStore.car);
      storeSet.file = await fileStoreFactory(ctx, sfi.byStore.file);
      if (sfi.byStore.wal) {
        storeSet.wal = await WALStoreFactory(ctx, sfi.byStore.wal);
      }

      await ensureStart(storeSet.meta, storeSet);
      await ensureStart(storeSet.car, storeSet);
      await ensureStart(storeSet.file, storeSet);
      if (storeSet.wal) {
        await ensureStart(storeSet.wal, storeSet);
      }

      return storeSet;
    },

    // makeMetaStore: async (sfi: StoreFactoryItem) => ensureStart(await metaStoreFactory(sfi)),
    // makeDataStore: async (sfi: StoreFactoryItem) => ensureStart(await dataStoreFactory(sfi)),
    // makeWALStore: async (sfi: StoreFactoryItem) => ensureStart(await WALStoreFactory(sfi)),

    ...ensureStoreEnDeFile(endeOpts),
  };
}
