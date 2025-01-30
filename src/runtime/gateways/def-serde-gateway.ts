import { Result, URI } from "@adviser/cement";
import type { Gateway } from "../../blockstore/gateway.js";
import { FPEnvelopeType, type FPEnvelope, type FPEnvelopeMeta } from "../../blockstore/fp-envelope.js";
import { fpDeserialize, fpSerialize } from "./fp-envelope-serialize.js";
import type { SerdeGateway, SerdeGatewayCtx, SerdeGetResult } from "../../blockstore/serde-gateway.js";
import type { DbMetaEvent } from "../../blockstore/types.js";

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

  private subscribeFn = new Map<string, (raw: Uint8Array) => Promise<void>>();

  async put<T>({ loader: { sthis }, encoder }: SerdeGatewayCtx, url: URI, env: FPEnvelope<T>): Promise<Result<void>> {
    const rUint8 = await fpSerialize(sthis, env, encoder);
    if (rUint8.isErr()) return rUint8;
    const ret = this.gw.put(url, rUint8.Ok(), sthis);

    if (env.type === FPEnvelopeType.META) {
      if (this.subscribeFn.has(url.toString())) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.subscribeFn.get(url.toString())!(rUint8.Ok());
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
    function rawCallback(raw: Uint8Array) {
      return fpDeserialize<DbMetaEvent[]>(sthis, url, Result.Ok(raw), decoder).then((res) => {
        if (res.isErr()) {
          sthis.logger.Error().Err(res).Msg("Failed to deserialize");
          return;
        }
        callback(res.Ok() as FPEnvelopeMeta);
      });
    }
    if (!this.gw.subscribe) {
      // memory leak possible
      this.subscribeFn.set(url.toString(), rawCallback);
      return Result.Ok(() => {
        this.subscribeFn.delete(url.toString());
      });
    }
    const unreg = await this.gw.subscribe(url, rawCallback, sthis);
    return unreg;
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
