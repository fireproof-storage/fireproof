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
}
