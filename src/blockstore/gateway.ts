import { Result, URI } from "@adviser/cement";
import { NotFoundError } from "../utils.js";

export interface GatewayOpts {
  readonly gateway: Gateway;
}

export type GetResult = Result<Uint8Array, NotFoundError | Error>;
export type VoidResult = Result<void>;

export interface TestGateway {
  get(url: URI, key: string): Promise<Uint8Array>;
}

export type UnsubscribeResult = Result<() => void>;

export interface Gateway {
  // all the methods never throw!
  // an error is reported as a Result
  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>>;
  // start updates URL --> hate this side effect
  start(baseUrl: URI): Promise<Result<URI>>;
  close(baseUrl: URI): Promise<VoidResult>;
  destroy(baseUrl: URI): Promise<VoidResult>;
  put(url: URI, body: Uint8Array): Promise<VoidResult>;
  // get could return a NotFoundError if the key is not found
  get(url: URI): Promise<GetResult>;
  delete(url: URI): Promise<VoidResult>;
  // be notified of remote meta
  subscribe?(url: URI, callback: (meta: Uint8Array) => void): Promise<UnsubscribeResult>;
}

export interface GatewayReturn<O, T> {
  readonly op: O;
  readonly value?: T; // result is pass
  readonly stop?: boolean;
}
export interface GatewayBuildUrlOp {
  readonly url: URI;
  readonly key: string;
}
export type GatewayBuildUrlReturn = GatewayReturn<GatewayBuildUrlOp, Result<URI>>;

export interface GatewayStartOp {
  readonly url: URI;
}
export type GatewayStartReturn = GatewayReturn<GatewayStartOp, Result<URI>>;

export interface GatewayCloseOp {
  readonly url: URI;
}
export type GatewayCloseReturn = GatewayReturn<GatewayCloseOp, VoidResult>;

export interface GatewayDestroyOp {
  readonly url: URI;
}
export type GatewayDestroyReturn = GatewayReturn<GatewayDestroyOp, VoidResult>;

export interface GatewayPutOp {
  readonly url: URI;
  readonly body: Uint8Array;
}

export type GatewayPutReturn = GatewayReturn<GatewayPutOp, VoidResult>;

export interface GatewayGetOp {
  readonly url: URI;
}
export type GatewayGetReturn = GatewayReturn<GatewayGetOp, GetResult>;

export interface GatewayDeleteOp {
  readonly url: URI;
}
export type GatewayDeleteReturn = GatewayReturn<GatewayDeleteOp, VoidResult>;

export interface GatewaySubscribeOp {
  readonly url: URI;
  readonly callback: (meta: Uint8Array) => void;
}

export type GatewaySubscribeReturn = GatewayReturn<GatewaySubscribeOp, UnsubscribeResult>;

export interface GatewayInterceptor {
  buildUrl(baseUrl: URI, key: string): Promise<Result<GatewayBuildUrlReturn>>;
  start(baseUrl: URI): Promise<Result<GatewayStartReturn>>;
  close(baseUrl: URI): Promise<Result<GatewayCloseReturn>>;
  delete(baseUrl: URI): Promise<Result<GatewayDeleteReturn>>;
  destroy(baseUrl: URI): Promise<Result<GatewayDestroyReturn>>;
  put(url: URI, body: Uint8Array): Promise<Result<GatewayPutReturn>>;
  get(url: URI): Promise<Result<GatewayGetReturn>>;
  subscribe(url: URI, callback: (meta: Uint8Array) => void): Promise<Result<GatewaySubscribeReturn>>;
}
