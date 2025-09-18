import { Result } from "@adviser/cement";
import { BlockLog, Cars, CidSet, Peers } from "./fp-sync.js";

export interface KV<T, TKey> {
  readonly key: TKey;
  readonly value: T;
}

export function toKV<T, TKey>(key: TKey, value: T): KV<T, TKey> {
  return { key, value };
}

export interface DBTable<T, TKey = string> {
  // bulkAdd(ts: T[]): Promise<void>;
  add(...t: KV<T, TKey>[]): Promise<Result<KV<T, TKey>[]>>;
  delete(key: TKey): Promise<Result<void>>;
  get(key: TKey): Promise<Result<T | undefined>>;
  put(...t: KV<T, TKey>[]): Promise<Result<KV<T, TKey>[]>>;
  list(start?: TKey, end?: TKey): ReadableStream<T>;
  transaction<R>(fn: (tx: Omit<DBTable<T, TKey>, "transaction">) => Promise<R>): Promise<R>;
  clear(): Promise<void>;
}

export interface FPIndexedDB {
  objectStore<T = Uint8Array>(name: string): DBTable<T>;
  version(): DBTable<{ version: string }>;
  fpSync: {
    blockLogs(): DBTable<BlockLog>;
    cidSets(): DBTable<CidSet>;
    cars(): DBTable<Cars>;
    peers(): DBTable<Peers>;
  };

  close(): Promise<void>;
  destroy(): Promise<void>;
}
