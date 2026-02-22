import { Result } from "@adviser/cement";

export interface StorageBackendWriteResult {
  commit(cid: string): Promise<Result<void>>;
  rollback(): Promise<Result<void>>;
  readonly size: number;
}

export interface StorageBackendReadResult {
  readonly stream: ReadableStream<Uint8Array>;
  readonly size: number;
}

export interface StorageBackend {
  readonly name: string;
  store(stream: ReadableStream<Uint8Array>): Promise<Result<StorageBackendWriteResult>>;
  get(cid: string): Promise<Result<StorageBackendReadResult | undefined>>;
}

export interface CIDStoreResult {
  readonly url: string;
  readonly cid: string;
  readonly size: number;
  readonly created: Date;
}

export type CIDGetResult =
  | { readonly found: false; readonly cid: string }
  | { readonly found: true; readonly cid: string; readonly size: number; readonly stream: ReadableStream<Uint8Array> };
