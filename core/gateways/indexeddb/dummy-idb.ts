import { BlockLog, Cars, CidSet, DBTable, FPIndexedDB, KV, Peers } from "@fireproof/core-types-blockstore";
import { Lazy, Result } from "@adviser/cement";
class ReadDummyTable<T, TKey = string> implements DBTable<T, TKey> {
  clear(): Promise<void> {
    throw new Error("ReadDummyTable:clear Method not implemented.");
  }
  add(..._t: KV<T, TKey>[]): Promise<Result<KV<T, TKey>[]>> {
    throw new Error("ReadDummyTable:add Method not implemented.");
  }
  delete(_key: TKey): Promise<Result<void>> {
    throw new Error("ReadDummyTable:delete Method not implemented.");
  }
  get(_key: TKey): Promise<Result<T | undefined>> {
    return Promise.resolve(Result.Ok(undefined));
    // throw new Error("ReadDummyTable:get Method not implemented.");
  }
  put(..._t: KV<T, TKey>[]): Promise<Result<KV<T, TKey>[]>> {
    throw new Error("ReadDummyTable:put Method not implemented.");
  }
  list(_start?: TKey | undefined, _end?: TKey | undefined): ReadableStream<T> {
    throw new Error("ReadDummyTable:list Method not implemented.");
  }
  transaction<R>(_fn: (tx: Omit<DBTable<T, TKey>, "transaction">) => Promise<R>): Promise<R> {
    throw new Error("ReadDummyTable:transaction Method not implemented.");
  }
}

export class ReadDummyIDBPDatabase implements FPIndexedDB {
  close(): Promise<void> {
    throw new Error("ReadDummyIDBPDatabase:close Method not implemented.");
  }
  destroy(): Promise<void> {
    throw new Error("ReadDummyIDBPDatabase:destroy Method not implemented.");
  }

  readonly objectStore = Lazy(<T = Uint8Array>(_name: string): DBTable<T> => new ReadDummyTable<T>());

  readonly fpSync = {
    blockLogs(): DBTable<BlockLog> {
      throw new Error("ReadDummyIDBPDatabase:fpSync.blockLogs Method not implemented.");
    },
    cidSets(): DBTable<CidSet> {
      throw new Error("ReadDummyIDBPDatabase:fpSync.cidSets Method not implemented.");
    },
    cars(): DBTable<Cars> {
      throw new Error("ReadDummyIDBPDatabase:fpSync.cars Method not implemented.");
    },
    peers(): DBTable<Peers> {
      throw new Error("ReadDummyIDBPDatabase:fpSync.peers Method not implemented.");
    },
  };

  version(): DBTable<{ version: string }> {
    throw new Error("ReadDummyIDBPDatabase:version Method not implemented.");
  }
}
