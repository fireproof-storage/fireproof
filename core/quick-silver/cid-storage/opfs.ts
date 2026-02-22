import { Lazy, Result } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import type { SuperThis } from "@fireproof/core-types-base";
import type { StorageBackend, StorageBackendReadResult, StorageBackendWriteResult } from "./types.js";

export const OPFSStorageBackend = Lazy(({ name, sthis }: { name?: string; sthis?: SuperThis } = {}) =>
  new OPFSStorageBackendImpl(name ?? "cid-opfs", sthis ?? ensureSuperThis()),
);

export class OPFSStorageBackendImpl implements StorageBackend {
  readonly name: string;
  readonly sthis: SuperThis;

  private _dir?: FileSystemDirectoryHandle;

  constructor(name: string, sthis: SuperThis) {
    this.name = name;
    this.sthis = sthis;
  }

  private async dir(): Promise<FileSystemDirectoryHandle> {
    if (!this._dir) {
      const root = await navigator.storage.getDirectory();
      this._dir = await root.getDirectoryHandle(this.name, { create: true });
    }
    return this._dir;
  }

  async store(stream: ReadableStream<Uint8Array>): Promise<Result<StorageBackendWriteResult>> {
    try {
      const dir = await this.dir();
      const tempName = this.sthis.nextId(12).str;
      const tempHandle = await dir.getFileHandle(tempName, { create: true });
      const writable = await tempHandle.createWritable();

      let size = 0;
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value as unknown as ArrayBufferView<ArrayBuffer>);
          size += value.byteLength;
        }
      } finally {
        reader.releaseLock();
      }
      await writable.close();

      const commit = async (cid: string): Promise<Result<void>> => {
        try {
          try {
            await dir.getFileHandle(cid); // throws if not found
            // target already exists — discard temp instead of overwriting
            await dir.removeEntry(tempName);
          } catch {
            await (tempHandle as FileSystemFileHandle & { move(name: string): Promise<void> }).move(cid);
          }
          return Result.Ok(undefined);
        } catch (e) {
          return Result.Err(e instanceof Error ? e : new Error(String(e)));
        }
      };

      const rollback = async (): Promise<Result<void>> => {
        try {
          await dir.removeEntry(tempName);
          return Result.Ok(undefined);
        } catch (e) {
          return Result.Err(e instanceof Error ? e : new Error(String(e)));
        }
      };

      return Result.Ok({ commit, rollback, size });
    } catch (e) {
      return Result.Err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async get(cid: string): Promise<Result<StorageBackendReadResult | undefined>> {
    try {
      const dir = await this.dir();
      let fileHandle: FileSystemFileHandle;
      try {
        fileHandle = await dir.getFileHandle(cid);
      } catch {
        return Result.Ok(undefined);
      }
      const file = await fileHandle.getFile();
      return Result.Ok({ stream: file.stream() as ReadableStream<Uint8Array>, size: file.size });
    } catch (e) {
      return Result.Err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
