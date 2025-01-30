import { Result, URI } from "@adviser/cement";
import { NotFoundError } from "../utils.js";
import { FPEnvelope, FPEnvelopeMeta } from "./fp-envelope.js";
import { type Loadable } from "./types.js";
import { FPDecoder, type FPEncoder } from "../runtime/gateways/fp-envelope-serialize.js";

export interface SerdeGatewayOpts {
  readonly gateway: SerdeGateway;
}

export type SerdeGetResult<S> = Result<FPEnvelope<S>, NotFoundError | Error>;
export type VoidResult = Result<void>;

// export interface TestGateway {
//   get(url: URI, key: string): Promise<Uint8Array>;
// }

export type UnsubscribeResult = Result<() => void>;

export interface SerdeGatewayCtx {
  readonly loader: Loadable;
  readonly encoder?: Partial<FPEncoder>;
  readonly decoder?: Partial<FPDecoder>;
}

export interface SerdeGateway {
  // all the methods never throw!
  // an error is reported as a Result
  buildUrl(ctx: SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<URI>>;
  // start updates URL --> hate this side effect
  start(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<URI>>;
  close(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<VoidResult>;
  put<T>(ctx: SerdeGatewayCtx, url: URI, body: FPEnvelope<T>): Promise<VoidResult>;
  // get could return a NotFoundError if the key is not found
  get<S>(ctx: SerdeGatewayCtx, url: URI): Promise<SerdeGetResult<S>>;
  delete(ctx: SerdeGatewayCtx, url: URI): Promise<VoidResult>;

  // be notified of remote meta
  subscribe(ctx: SerdeGatewayCtx, url: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>): Promise<UnsubscribeResult>;

  // this method is used to get the raw data mostly for testing
  getPlain(ctx: SerdeGatewayCtx, url: URI, key: string): Promise<Result<Uint8Array>>;
  // this method is used for testing only
  // to avoid any drama it should only enabled in test mode
  destroy(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<VoidResult>;
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
  buildUrl(ctx: SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<SerdeGatewayBuildUrlReturn>>;
  start(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<SerdeGatewayStartReturn>>;
  close(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<SerdeGatewayCloseReturn>>;
  delete(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<SerdeGatewayDeleteReturn>>;
  destroy(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<SerdeGatewayDestroyReturn>>;
  put<T>(ctx: SerdeGatewayCtx, url: URI, body: FPEnvelope<T>): Promise<Result<SerdeGatewayPutReturn<T>>>;
  get<S>(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayGetReturn<S>>>;
  subscribe(
    ctx: SerdeGatewayCtx,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
  ): Promise<Result<SerdeGatewaySubscribeReturn>>;
}
