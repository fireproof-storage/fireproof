import { Result, URI } from "@adviser/cement";
import type { Gateway } from "../../blockstore/gateway.js";
import { FPEnvelopeTypes, type FPEnvelope, type FPEnvelopeMeta } from "../../blockstore/fp-envelope.js";
import { FPDecoder, fpDeserialize, fpSerialize } from "./fp-envelope-serialize.js";
import type { SerdeGateway, SerdeGatewayCtx, SerdeGetResult, UnsubscribeResult } from "../../blockstore/serde-gateway.js";
import type { DbMetaEvent } from "../../blockstore/types.js";
import { PARAM, SuperThis } from "../../types.js";

const subscribeFn = new Map<string, Map<string, (raw: Uint8Array) => Promise<void>>>();

function wrapRawCallback(
  sthis: SuperThis,
  url: URI,
  callback: (meta: FPEnvelopeMeta) => Promise<void>,
  decoder?: Partial<FPDecoder>,
) {
  return async (raw: Uint8Array) => {
    const res = await fpDeserialize(sthis, url, Result.Ok(raw), decoder);
    if (res.isErr()) {
      sthis.logger.Error().Err(res).Msg("Failed to deserialize");
      return;
    }
    await callback(res.Ok() as FPEnvelopeMeta);
  };
}

// function rawCallback(raw: Uint8Array) {
//   return fpDeserialize<DbMetaEvent[]>(sthis, url, Result.Ok(raw), decoder).then((res) => {
//     if (res.isErr()) {
//       sthis.logger.Error().Err(res).Msg("Failed to deserialize");
//       return;
//     }
//     callback(res.Ok() as FPEnvelopeMeta);
//   });
// }

function subscribeKeyURL(url: URI) {
  return url.build().cleanParams(PARAM.SELF_REFLECT, PARAM.KEY, PARAM.LOCAL_NAME, PARAM.NAME).toString();
}

export class DefSerdeGateway implements SerdeGateway {
  // abstract readonly storeType: StoreType;
  readonly gw: Gateway;

  constructor(gw: Gateway) {
    this.gw = gw;
  }

  start({ loader: { sthis } }: SerdeGatewayCtx, baseURL: URI): Promise<Result<URI>> {
    return this.gw.start(baseURL, sthis);
  }

  async buildUrl({ loader: { sthis } }: SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<URI>> {
    return this.gw.buildUrl(baseUrl, key, sthis);
  }

  async close({ loader: { sthis } }: SerdeGatewayCtx, uri: URI): Promise<Result<void>> {
    return this.gw.close(uri, sthis);
  }

  async put<T>({ loader: { sthis }, encoder }: SerdeGatewayCtx, url: URI, env: FPEnvelope<T>): Promise<Result<void>> {
    const rUint8 = await fpSerialize(sthis, env, encoder);
    if (rUint8.isErr()) return rUint8;
    const ret = this.gw.put(url, rUint8.Ok(), sthis);

    if (env.type === FPEnvelopeTypes.META && url.hasParam(PARAM.SELF_REFLECT)) {
      const urlWithoutKey = subscribeKeyURL(url);
      const subFn = subscribeFn.get(urlWithoutKey);
      if (subFn) {
        // console.log("PUT-SELF_REFLECT", url.toString(), subFn.size);
        await Promise.all(Array.from(subFn.values()).map((subFn) => subFn(rUint8.Ok())));
      }
    }
    return ret;
  }

  async get<S>({ loader: { sthis }, decoder }: SerdeGatewayCtx, url: URI): Promise<SerdeGetResult<S>> {
    const res = await this.gw.get(url, sthis);
    if (res.isErr()) return Result.Err(res.Err());
    return fpDeserialize(sthis, url, res, decoder) as Promise<SerdeGetResult<S>>;
  }

  async subscribe(
    { loader: { sthis }, decoder }: SerdeGatewayCtx,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
  ): Promise<Result<() => void>> {
    const rawCallback = wrapRawCallback(sthis, url, callback, decoder);
    let realUnreg: UnsubscribeResult = Result.Ok(() => {});
    if (this.gw.subscribe) {
      realUnreg = await this.gw.subscribe(url, rawCallback, sthis);
    }
    if (url.hasParam(PARAM.SELF_REFLECT)) {
      // memory leak possible
      const urlWithoutKey = subscribeKeyURL(url);
      const fns = subscribeFn.get(urlWithoutKey) ?? new Map<string, (raw: Uint8Array) => Promise<void>>();
      subscribeFn.set(urlWithoutKey, fns);
      const key = sthis.nextId().str;
      fns.set(key, rawCallback);
      return Result.Ok(() => {
        const f = subscribeFn.get(urlWithoutKey);
        if (!f) {
          return;
        }
        f.delete(key);
        if (f.size === 0) {
          subscribeFn.delete(urlWithoutKey);
        }
        realUnreg.Ok()();
      });
    }
    return realUnreg;
  }

  async delete({ loader: { sthis } }: SerdeGatewayCtx, url: URI): Promise<Result<void>> {
    return this.gw.delete(url, sthis);
  }

  async destroy({ loader: { sthis } }: SerdeGatewayCtx, baseURL: URI): Promise<Result<void>> {
    return this.gw.destroy(baseURL, sthis);
  }

  async getPlain({ loader: { sthis } }: SerdeGatewayCtx, iurl: URI, key: string) {
    return this.gw.getPlain(iurl, key, sthis);
  }
}
