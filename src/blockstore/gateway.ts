import { Result, URI } from "@adviser/cement";
import { NotFoundError } from "../utils.js";
import { UnsubscribeResult, VoidResult } from "./serde-gateway.js";
import { SuperThis } from "@fireproof/core";

export interface GatewayOpts {
  readonly gateway: Gateway;
}

export type GetResult = Result<Uint8Array, NotFoundError | Error>;
// export type VoidResult = Result<void>;

// export interface TestGateway {
//   get(url: URI, key: string): Promise<Uint8Array>;
// }

// export type UnsubscribeResult = Result<() => void>;

export interface Gateway {
  // all the methods never throw!
  // an error is reported as a Result
  buildUrl(baseUrl: URI, key: string, sthis: SuperThis): Promise<Result<URI>>;
  // start updates URL --> hate this side effect
  start(baseUrl: URI, sthis: SuperThis): Promise<Result<URI>>;
  close(baseUrl: URI, sthis: SuperThis): Promise<VoidResult>;
  destroy(baseUrl: URI, sthis: SuperThis): Promise<VoidResult>;
  put(url: URI, body: Uint8Array, sthis: SuperThis): Promise<VoidResult>;
  // get could return a NotFoundError if the key is not found
  get(url: URI, sthis: SuperThis): Promise<GetResult>;
  delete(url: URI, sthis: SuperThis): Promise<VoidResult>;
  // be notified of remote meta
  subscribe?(url: URI, callback: (meta: Uint8Array) => void, sthis: SuperThis): Promise<UnsubscribeResult>;

  getPlain(url: URI, key: string, sthis: SuperThis): Promise<Result<Uint8Array>>;
}
