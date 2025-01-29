import { Result, URI } from "@adviser/cement";
import { Gateway, GetResult } from "../../../blockstore/gateway.js";
import { PARAM, SuperThis } from "../../../types.js";
import { MEMORY_VERSION } from "./version.js";
import { NotFoundError } from "../../../utils.js";
import { VoidResult } from "../../../blockstore/serde-gateway.js";

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

  async put(url: URI, bytes: Uint8Array): Promise<VoidResult> {
    this.memorys.set(url.toString(), bytes);
    return Result.Ok(undefined);
  }
  // get could return a NotFoundError if the key is not found
  get(url: URI): Promise<GetResult> {
    const x = this.memorys.get(url.toString());
    if (!x) {
      return Promise.resolve(Result.Err(new NotFoundError("not found")));
    }
    return Promise.resolve(Result.Ok(x));
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
