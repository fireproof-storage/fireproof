import { Result, URI } from "@adviser/cement";
import { NotFoundError } from "../utils.js";
import { FPEnvelope, FPEnvelopeMeta } from "./fp-envelope.js";
import { Loadable } from "./types.js";

export interface GatewayOpts {
  readonly gateway: Gateway;
}

export type GetResult<S> = Result<FPEnvelope<S>, NotFoundError | Error>;
export type VoidResult = Result<void>;

// export interface TestGateway {
//   get(url: URI, key: string): Promise<Uint8Array>;
// }

export type UnsubscribeResult = Result<() => void>;

export interface Gateway {
  // all the methods never throw!
  // an error is reported as a Result
  buildUrl(baseUrl: URI, key: string, loader?: Loadable): Promise<Result<URI>>;
  // start updates URL --> hate this side effect
  start(baseUrl: URI, loader?: Loadable): Promise<Result<URI>>;
  close(baseUrl: URI, loader?: Loadable): Promise<VoidResult>;
  put<T>(url: URI, body: FPEnvelope<T>, loader?: Loadable): Promise<VoidResult>;
  // get could return a NotFoundError if the key is not found
  get<S>(url: URI, loader?: Loadable): Promise<GetResult<S>>;
  delete(url: URI, loader?: Loadable): Promise<VoidResult>;

  // be notified of remote meta
  subscribe?(url: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>, loader?: Loadable): Promise<UnsubscribeResult>;

  // this method is used to get the raw data mostly for testing
  getPlain(url: URI, key: string, loader?: Loadable): Promise<Result<Uint8Array>>;
  // this method is used for testing only
  // to avoid any drama it should only enabled in test mode
  destroy(baseUrl: URI, loader?: Loadable): Promise<VoidResult>;
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

export interface GatewayPutOp<T> {
  readonly url: URI;
  readonly body: FPEnvelope<T>;
}

export type GatewayPutReturn<T> = GatewayReturn<GatewayPutOp<T>, VoidResult>;

export interface GatewayGetOp {
  readonly url: URI;
}
export type GatewayGetReturn<S> = GatewayReturn<GatewayGetOp, GetResult<S>>;

export interface GatewayDeleteOp {
  readonly url: URI;
}
export type GatewayDeleteReturn = GatewayReturn<GatewayDeleteOp, VoidResult>;

export interface GatewaySubscribeOp {
  readonly url: URI;
  readonly callback: (meta: FPEnvelopeMeta) => Promise<void>;
}

export type GatewaySubscribeReturn = GatewayReturn<GatewaySubscribeOp, UnsubscribeResult>;

export interface GatewayInterceptor {
  buildUrl(baseUrl: URI, key: string, loader: Loadable): Promise<Result<GatewayBuildUrlReturn>>;
  start(baseUrl: URI, loader: Loadable): Promise<Result<GatewayStartReturn>>;
  close(baseUrl: URI, loader: Loadable): Promise<Result<GatewayCloseReturn>>;
  delete(baseUrl: URI, loader: Loadable): Promise<Result<GatewayDeleteReturn>>;
  destroy(baseUrl: URI, loader: Loadable): Promise<Result<GatewayDestroyReturn>>;
  put<T>(url: URI, body: FPEnvelope<T>, loader: Loadable): Promise<Result<GatewayPutReturn<T>>>;
  get<S>(url: URI, loader: Loadable): Promise<Result<GatewayGetReturn<S>>>;
  subscribe(url: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>, loader: Loadable): Promise<Result<GatewaySubscribeReturn>>;
}
