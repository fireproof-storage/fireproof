import { Result, URI } from "@adviser/cement";
import type { Gateway } from "../../blockstore/gateway.js";
import { FPEnvelopeType, type FPEnvelope, type FPEnvelopeMeta } from "../../blockstore/fp-envelope.js";
import { fpDeserialize, fpSerialize } from "./fp-envelope-serialize.js";
import type { SerdeGateway, SerdeGetResult } from "../../blockstore/serde-gateway.js";
import type { SuperThis } from "../../types.js";
import { DbMetaEvent, Loadable } from "../../blockstore/types.js";

export class DefSerdeGateway implements SerdeGateway {
  // abstract readonly storeType: StoreType;
  readonly gw: Gateway;

  constructor(gw: Gateway) {
    this.gw = gw;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  start(sthis: SuperThis, baseURL: URI, loader?: Loadable): Promise<Result<URI>> {
    return this.gw.start(baseURL, sthis);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async buildUrl(sthis: SuperThis, baseUrl: URI, key: string, loader?: Loadable): Promise<Result<URI>> {
    return this.gw.buildUrl(baseUrl, key, sthis);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async close(sthis: SuperThis, uri: URI, loader?: Loadable): Promise<Result<void>> {
    return this.gw.close(uri, sthis);
  }

  private subscribeFn = new Map<string, (meta: FPEnvelopeMeta) => Promise<void>>();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put<T>(sthis: SuperThis, url: URI, env: FPEnvelope<T>, loader?: Loadable): Promise<Result<void>> {
    const rUint8 = await fpSerialize(sthis, env);
    if (rUint8.isErr()) return rUint8;
    const ret = this.gw.put(url, rUint8.Ok(), sthis);

    if (env.type === FPEnvelopeType.META) {
      if (this.subscribeFn.has(url.toString())) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.subscribeFn.get(url.toString())!(env as FPEnvelopeMeta);
      }
    }
    return ret;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async get<S>(sthis: SuperThis, url: URI, loader?: Loadable): Promise<SerdeGetResult<S>> {
    const res = await this.gw.get(url, sthis);
    if (res.isErr()) return Result.Err(res.Err());
    return fpDeserialize(sthis, url, res) as Promise<SerdeGetResult<S>>;
  }

  async subscribe(
    sthis: SuperThis,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    loader?: Loadable,
  ): Promise<Result<() => void>> {
    if (!this.gw.subscribe) {
      // memory leak possible
      this.subscribeFn.set(url.toString(), callback);
      return Result.Ok(() => {
        this.subscribeFn.delete(url.toString());
      });
    }
    const unreg = await this.gw.subscribe(
      url,
      (raw: Uint8Array) => {
        fpDeserialize<DbMetaEvent[]>(sthis, url, Result.Ok(raw)).then((res) => {
          if (res.isErr()) return;
          callback(res.Ok() as FPEnvelopeMeta);
        });
      },
      sthis,
    );
    return unreg;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(sthis: SuperThis, url: URI, loader?: Loadable): Promise<Result<void>> {
    return this.gw.delete(url, sthis);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async destroy(sthis: SuperThis, baseURL: URI, loader?: Loadable): Promise<Result<void>> {
    return this.gw.destroy(baseURL, sthis);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getPlain(sthis: SuperThis, iurl: URI, key: string, loader?: Loadable) {
    return this.gw.getPlain(iurl, key, sthis);
  }
}
