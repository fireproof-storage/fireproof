import { Dexie, type Table } from "dexie";
import { Lazy, Result, consumeStream } from "@adviser/cement";
import type { StorageBackend, StorageBackendReadResult, StorageBackendWriteResult } from "./types.js";

interface BlobRecord {
  cid: string;
  data: Uint8Array;
  size: number;
  created: Date;
}

export const DexieStorageBackend = Lazy(({ name }: { name?: string } = {}) =>
  new DexieStorageBackendImpl(name ?? "cid-storage"),
);

export class DexieStorageBackendImpl implements StorageBackend {
  readonly name: string;
  readonly dexie: Dexie;

  constructor(name: string) {
    this.name = name;
    this.dexie = new Dexie(name);
    this.dexie.version(1).stores({ blobs: "&cid, size, created" });
  }

  private get blobs(): Table<BlobRecord, string> {
    return this.dexie.table<BlobRecord, string>("blobs");
  }

  async store(stream: ReadableStream<Uint8Array>): Promise<Result<StorageBackendWriteResult>> {
    try {
      const chunks = await consumeStream(stream, (chunk: Uint8Array) => chunk);
      const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
      const data = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const size = data.byteLength;

      const commit = async (cid: string): Promise<Result<void>> => {
        try {
          const existing = await this.blobs.get(cid);
          if (!existing) {
            await this.blobs.add({ cid, data, size, created: new Date() });
          }
          return Result.Ok(undefined);
        } catch (e) {
          return Result.Err(e instanceof Error ? e : new Error(String(e)));
        }
      };

      const rollback = async (): Promise<Result<void>> => {
        return Result.Ok(undefined);
      };

      return Result.Ok({ commit, rollback, size });
    } catch (e) {
      return Result.Err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async get(cid: string): Promise<Result<StorageBackendReadResult | undefined>> {
    try {
      const record = await this.blobs.get(cid);
      if (!record) return Result.Ok(undefined);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(record.data);
          controller.close();
        },
      });
      return Result.Ok({ stream, size: record.size });
    } catch (e) {
      return Result.Err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
