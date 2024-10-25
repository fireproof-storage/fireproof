import { Result, URI } from "@adviser/cement";
import { Gateway, GetResult, VoidResult } from "../../../blockstore/gateway.js";
import { PARAM, SuperThis } from "../../../types.js";
import { MEMORY_VERSION } from "./version.js";
import { NotFoundError } from "../../../utils.js";
import { FPEnvelope } from "../../../blockstore/fp-envelope.js";
import { fpSerialize, fpDeserialize } from "../fp-envelope-serialize.js";

export class MemoryGateway implements Gateway {
  readonly memorys: Map<string, Uint8Array>;
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis, memorys: Map<string, Uint8Array>) {
    this.memorys = memorys;
    this.sthis = sthis;
  }

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.KEY, key).URI()));
  }
  start(baseUrl: URI): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.VERSION, MEMORY_VERSION).URI()));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  close(baseUrl: URI): Promise<VoidResult> {
    return Promise.resolve(Result.Ok(undefined));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(baseUrl: URI): Promise<VoidResult> {
    this.memorys.clear();
    return Promise.resolve(Result.Ok(undefined));
  }
  async put<T>(url: URI, body: FPEnvelope<T>): Promise<VoidResult> {
    this.memorys.set(url.toString(), await fpSerialize(this.sthis, body));
    return Result.Ok(undefined);
  }
  // get could return a NotFoundError if the key is not found
  get<S>(url: URI): Promise<GetResult<S>> {
    const x = this.memorys.get(url.toString());
    if (!x) {
      return Promise.resolve(Result.Err(new NotFoundError("not found")));
    }
    return fpDeserialize(this.sthis, url, x) as Promise<GetResult<S>>;
  }
  delete(url: URI): Promise<VoidResult> {
    this.memorys.delete(url.toString());
    return Promise.resolve(Result.Ok(undefined));
  }

  async getPlain(url: URI, key: string): Promise<Result<Uint8Array>> {
    const x = this.memorys.get(url.build().setParam(PARAM.KEY, key).toString());
    if (!x) {
      return Result.Err(new NotFoundError("not found"));
    }
    return Result.Ok(x);
  }
}
