import { Result, URI } from "@adviser/cement";
import { NotFoundError } from "../utils.js";
import { FPEnvelope, FPEnvelopeMeta } from "./fp-envelope.js";
import { Loadable } from "./types.js";
import { SuperThis } from "../types.js";

export interface SerdeGatewayOpts {
  readonly gateway: SerdeGateway;
}

export type SerdeGetResult<S> = Result<FPEnvelope<S>, NotFoundError | Error>;
export type VoidResult = Result<void>;

// export interface TestGateway {
//   get(url: URI, key: string): Promise<Uint8Array>;
// }

export type UnsubscribeResult = Result<() => void>;

export interface SerdeGateway {
  // all the methods never throw!
  // an error is reported as a Result
  buildUrl(sthis: SuperThis, baseUrl: URI, key: string, loader?: Loadable): Promise<Result<URI>>;
  // start updates URL --> hate this side effect
  start(sthis: SuperThis, baseUrl: URI, loader?: Loadable): Promise<Result<URI>>;
  close(sthis: SuperThis, baseUrl: URI, loader?: Loadable): Promise<VoidResult>;
  put<T>(sthis: SuperThis, url: URI, body: FPEnvelope<T>, loader?: Loadable): Promise<VoidResult>;
  // get could return a NotFoundError if the key is not found
  get<S>(sthis: SuperThis, url: URI, loader?: Loadable): Promise<SerdeGetResult<S>>;
  delete(sthis: SuperThis, url: URI, loader?: Loadable): Promise<VoidResult>;

  // be notified of remote meta
  subscribe(
    sthis: SuperThis,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
    loader?: Loadable,
  ): Promise<UnsubscribeResult>;

  // this method is used to get the raw data mostly for testing
  getPlain(sthis: SuperThis, url: URI, key: string, loader?: Loadable): Promise<Result<Uint8Array>>;
  // this method is used for testing only
  // to avoid any drama it should only enabled in test mode
  destroy(sthis: SuperThis, baseUrl: URI, loader?: Loadable): Promise<VoidResult>;
}

export interface SerdeGatewayReturn<O, T> {
  readonly op: O;
  readonly value?: T; // result is pass
  readonly stop?: boolean;
}
export interface SerdeGatewayBuildUrlOp {
  readonly url: URI;
  readonly key: string;
}
export type SerdeGatewayBuildUrlReturn = SerdeGatewayReturn<SerdeGatewayBuildUrlOp, Result<URI>>;

export interface SerdeGatewayStartOp {
  readonly url: URI;
}
export type SerdeGatewayStartReturn = SerdeGatewayReturn<SerdeGatewayStartOp, Result<URI>>;

export interface SerdeGatewayCloseOp {
  readonly url: URI;
}
export type SerdeGatewayCloseReturn = SerdeGatewayReturn<SerdeGatewayCloseOp, VoidResult>;

export interface SerdeGatewayDestroyOp {
  readonly url: URI;
}
export type SerdeGatewayDestroyReturn = SerdeGatewayReturn<SerdeGatewayDestroyOp, VoidResult>;

export interface SerdeGatewayPutOp<T> {
  readonly url: URI;
  readonly body: FPEnvelope<T>;
}

export type SerdeGatewayPutReturn<T> = SerdeGatewayReturn<SerdeGatewayPutOp<T>, VoidResult>;

export interface SerdeGatewayGetOp {
  readonly url: URI;
}
export type SerdeGatewayGetReturn<S> = SerdeGatewayReturn<SerdeGatewayGetOp, SerdeGetResult<S>>;

export interface SerdeGatewayDeleteOp {
  readonly url: URI;
}
export type SerdeGatewayDeleteReturn = SerdeGatewayReturn<SerdeGatewayDeleteOp, VoidResult>;

export interface SerdeGatewaySubscribeOp {
  readonly url: URI;
  readonly callback: (meta: FPEnvelopeMeta) => Promise<void>;
}

export type SerdeGatewaySubscribeReturn = SerdeGatewayReturn<SerdeGatewaySubscribeOp, UnsubscribeResult>;

export interface SerdeGatewayInterceptor {
  buildUrl(sthis: SuperThis, baseUrl: URI, key: string, loader: Loadable): Promise<Result<SerdeGatewayBuildUrlReturn>>;
  start(sthis: SuperThis, baseUrl: URI, loader: Loadable): Promise<Result<SerdeGatewayStartReturn>>;
  close(sthis: SuperThis, baseUrl: URI, loader: Loadable): Promise<Result<SerdeGatewayCloseReturn>>;
  delete(sthis: SuperThis, baseUrl: URI, loader: Loadable): Promise<Result<SerdeGatewayDeleteReturn>>;
  destroy(sthis: SuperThis, baseUrl: URI, loader: Loadable): Promise<Result<SerdeGatewayDestroyReturn>>;
  put<T>(sthis: SuperThis, url: URI, body: FPEnvelope<T>, loader: Loadable): Promise<Result<SerdeGatewayPutReturn<T>>>;
  get<S>(sthis: SuperThis, url: URI, loader: Loadable): Promise<Result<SerdeGatewayGetReturn<S>>>;
  subscribe(
    sthis: SuperThis,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
    loader: Loadable,
  ): Promise<Result<SerdeGatewaySubscribeReturn>>;
}
