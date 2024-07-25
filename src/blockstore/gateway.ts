import { Result } from "@adviser/cement";
import { StoreType } from "./types.js";

export interface GatewayOpts {
  readonly gateway: Gateway;
}

export class NotFoundError extends Error {
  readonly code = "ENOENT";
}

export function isNotFoundError(e: Error | Result<unknown> | unknown): e is NotFoundError {
  if (Result.Is(e)) {
    if (e.isOk()) return false;
    e = e.Err();
  }
  if ((e as NotFoundError).code === "ENOENT") return true;
  return false;
}

export type GetResult = Result<Uint8Array, NotFoundError | Error>;
export type VoidResult = Result<void>;

export interface Gateway {
  readonly storeType: StoreType
  // all the methods never throw!
  // an error is reported as a Result
  buildUrl(baseUrl: URL, key: string): Promise<Result<URL>>;
  // start updates URL --> hate this side effect
  start(baseUrl: URL): Promise<VoidResult>;
  close(baseUrl: URL): Promise<VoidResult>;
  destroy(baseUrl: URL): Promise<VoidResult>;
  put(url: URL, body: Uint8Array): Promise<VoidResult>;
  // get could return a NotFoundError if the key is not found
  get(url: URL): Promise<GetResult>;
  delete(url: URL): Promise<VoidResult>;
}
