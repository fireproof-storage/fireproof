import { Result, URI } from "@adviser/cement";
import { Gateway, GetResult, TestGateway, VoidResult } from "../../../blockstore/gateway.js";
import { PARAM } from "../../../types.js";
import { MEMORY_VERSION } from "./version.js";
import { NotFoundError } from "../../../utils.js";

export class MemoryGateway implements Gateway {
  readonly memorys: Map<string, Uint8Array>;
  constructor(memorys: Map<string, Uint8Array>) {
    this.memorys = memorys;
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
  put(url: URI, body: Uint8Array): Promise<VoidResult> {
    this.memorys.set(url.toString(), body);
    return Promise.resolve(Result.Ok(undefined));
  }
  // get could return a NotFoundError if the key is not found
  get(url: URI): Promise<GetResult> {
    const x = this.memorys.get(url.toString());
    if (x === undefined) {
      return Promise.resolve(Result.Err(new NotFoundError("not found")));
    }
    return Promise.resolve(Result.Ok(x));
  }
  delete(url: URI): Promise<VoidResult> {
    this.memorys.delete(url.toString());
    return Promise.resolve(Result.Ok(undefined));
  }
}

export class MemoryTestGateway implements TestGateway {
  readonly memorys: Map<string, Uint8Array>;
  constructor(memorys: Map<string, Uint8Array>) {
    this.memorys = memorys;
  }
  async get(url: URI, key: string): Promise<Uint8Array> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.memorys.get(url.build().setParam(PARAM.KEY, key).toString())!;
  }
}
