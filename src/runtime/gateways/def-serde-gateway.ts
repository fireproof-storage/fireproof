import { Result, URI } from "@adviser/cement";
import type { Gateway } from "../../blockstore/gateway.js";
import type { FPEnvelope } from "../../blockstore/fp-envelope.js";
import { fpDeserialize, fpSerialize } from "./fp-envelope-serialize.js";
import type { SerdeGateway, SerdeGetResult } from "../../blockstore/serde-gateway.js";
import type { SuperThis } from "../../types.js";

export class DefSerdeGateway implements SerdeGateway {
  // abstract readonly storeType: StoreType;
  readonly gw: Gateway;

  constructor(gw: Gateway) {
    this.gw = gw;
  }

  start(sthis: SuperThis, baseURL: URI): Promise<Result<URI>> {
    return this.gw.start(baseURL, sthis);
  }

  async buildUrl(sthis: SuperThis, baseUrl: URI, key: string): Promise<Result<URI>> {
    return this.gw.buildUrl(baseUrl, key, sthis);
  }

  async close(sthis: SuperThis, uri: URI): Promise<Result<void>> {
    return this.gw.close(uri, sthis);
  }

  async put<T>(sthis: SuperThis, url: URI, env: FPEnvelope<T>): Promise<Result<void>> {
    const rUint8 = await fpSerialize(sthis, env);
    if (rUint8.isErr()) return rUint8;
    return this.gw.put(url, rUint8.Ok(), sthis);
  }

  async get<S>(sthis: SuperThis, url: URI): Promise<SerdeGetResult<S>> {
    const res = await this.gw.get(url, sthis);
    if (res.isErr()) return Result.Err(res.Err());
    return fpDeserialize(sthis, url, res) as Promise<SerdeGetResult<S>>;
  }

  async delete(sthis: SuperThis, url: URI): Promise<Result<void>> {
    return this.gw.delete(url, sthis);
  }

  async destroy(sthis: SuperThis, baseURL: URI): Promise<Result<void>> {
    return this.gw.destroy(baseURL, sthis);
  }

  async getPlain(sthis: SuperThis, iurl: URI, key: string) {
    return this.gw.getPlain(iurl, key, sthis);
  }
}
