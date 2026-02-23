import { Dexie, type Collection, type Table } from "dexie"; // Dexie used for minKey/maxKey + IdxDB base
import { consumeStream, exception2Result, KeyedResolvOnce, processStream, Result } from "@adviser/cement";
import type {
  AddToIdxOpts,
  DeleteFromIdxOpts,
  IdxEntry,
  IdxQueryOpts,
  IdxServiceOpts,
  IdxStrategy,
  IdxTransaction,
  MetaEntry,
} from "./types.js";

function serializeKey(keys: string[]): string {
  return keys.length === 1 ? keys[0] : JSON.stringify(keys);
}

export class KeyIdxStrategy implements IdxStrategy {
  async write(tx: IdxTransaction, opts: AddToIdxOpts, serializedKey: string): Promise<Result<IdxEntry>> {
    const rExisting = await tx.get([opts.idxName, serializedKey]);
    if (rExisting.isErr()) {
      return Result.Err(rExisting);
    }
    const existing = rExisting.Ok();
    const metaMap = new Map<string, MetaEntry>();
    for (const e of existing?.meta ?? []) metaMap.set(`${e.type}:${e.key}`, e);
    for (const m of opts.meta ?? []) metaMap.set(`${m.type}:${m.key}`, m);

    const entry: IdxEntry = {
      idxName: opts.idxName,
      serializedKey,
      keys: opts.keys,
      // cidUrl: opts.cidUrl,
      // primaryKey: opts.primaryKey,
      meta: [...metaMap.values()],
      deleted: false,
    };

    const rPut = await tx.put(entry);
    if (rPut.isErr()) {
      return Result.Err(rPut);
    }
    return Result.Ok(entry);
  }
}

export const defaultIdxStrategy = new KeyIdxStrategy();

class IdxDB extends Dexie {
  readonly idx!: Table<IdxEntry, [string, string]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      idx: "&[idxName+serializedKey], serializedKey",
    });
    // this.idx = this.dexie.table("idx");
  }

  // transaction<T>(mode: "readonly" | "rw", table: Table<unknown, unknown>, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  //   return this.dexie.transaction(mode, table, async (dtx) => {
  //     const o = await exception2Result(() => fn(dtx)); // we need to wait here
  //     return o as T;
  //   });
  // }
}

const idxServiceSingleton = new KeyedResolvOnce<IdxServiceImpl>();

export function IdxService({ prefix = "Idx" }: IdxServiceOpts = {}): IdxServiceImpl {
  return idxServiceSingleton.get(prefix).once(() => new IdxServiceImpl(prefix));
}

export class IdxServiceImpl {
  readonly prefix: string;

  private readonly dbRegistry = new KeyedResolvOnce<IdxDB>();

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private prepare(dbname: string): IdxDB {
    return this.dbRegistry.get(dbname).once(() => new IdxDB(`${this.prefix}${dbname}`));
  }

  private idx(dbname: string): Table<IdxEntry, [string, string]> {
    return this.prepare(dbname).table<IdxEntry, [string, string]>("idx");
  }

  async addToIdx(opts: AddToIdxOpts): Promise<Result<IdxEntry>> {
    return exception2Result(async (): Promise<Result<IdxEntry>> => {
      const serializedKey = serializeKey(opts.keys);
      const strategy = opts.strategy ?? defaultIdxStrategy;
      if (opts.tx) {
        const ret = await strategy.write(opts.tx, opts, serializedKey);
        return ret;
      }
      return this.transaction(opts.dbname, (tx) => strategy.write(tx, opts, serializedKey));
    });
  }

  async transaction<T>(dbname: string, fn: (tx: IdxTransaction) => Promise<T>): Promise<T> {
    const db = this.prepare(dbname);
    return db.transaction("rw", db.idx, async (dtx) => {
      const tx: IdxTransaction = {
        get: (key: string[]) =>
          dtx.idx
            .get(key as [string, string])
            .then((res) => Result.Ok(res))
            .catch((e) => Result.Err(e as Error)),
        put: (entry: IdxEntry) =>
          dtx.idx
            .put(entry)
            .then(() => undefined)
            .then(() => Result.Ok(undefined))
            .catch((e) => Result.Err(e as Error)),
        del: (key: string[]) =>
          dtx.idx
            .delete(key as [string, string])
            .then(() => Result.Ok(undefined))
            .catch((e) => Result.Err(e as Error)),
      };
      const o = await exception2Result(() => fn(tx)); // we need to wait here
      return o as T;
    });
  }

  async deleteFromIdx(opts: DeleteFromIdxOpts): Promise<Result<void>> {
    return exception2Result(async (): Promise<Result<void>> => {
      const serializedKey = serializeKey(opts.keys);
      const db = this.prepare(opts.dbname);

      await db.transaction("rw", db.idx, async () => {
        const existing = await db.idx.get([opts.idxName, serializedKey]);
        if (!existing) return;
        await db.idx.put({ ...existing, deleted: true });
      });

      return Result.Ok(undefined);
    });
  }

  async destroyDb(dbname: string): Promise<void> {
    const db = this.prepare(dbname);
    const r = await this.query({ dbname, idxName: "_id" });
    if (r.isErr()) {
      console.error("IdxService.destroyDb: failed to query db before deletion", dbname, r.Err());
    }
    const toDelete = await consumeStream(r.Ok(), (entry) => {
      return entry.keys; // we only need the keys to delete, and we can do it in parallel with the db deletion, so we don't await it here. We will await the deleteFromIdx call after the db.delete() call, which should be fast since it's just marking entries as deleted.
    });
    for (const keys of toDelete) {
      await this.deleteFromIdx({ dbname, idxName: "_id", keys });
    }
    await db.delete();
    this.dbRegistry.delete(dbname);
  }

  async query(opts: IdxQueryOpts): Promise<Result<ReadableStream<IdxEntry>>> {
    return exception2Result(async (): Promise<Result<ReadableStream<IdxEntry>>> => {
      const { dbname, idxName, keys = [], order = "asc" } = opts;
      const idx = this.idx(dbname);

      let collection: Collection<IdxEntry, [string, string]>;

      if (keys.length > 0) {
        const serializedKeys = keys.map((k) => serializeKey([k]));
        collection = idx
          .where("serializedKey")
          .anyOf(serializedKeys)
          .and((r) => r.idxName === idxName);
      } else {
        collection = idx.where("[idxName+serializedKey]").between([idxName, Dexie.minKey], [idxName, Dexie.maxKey]);
      }

      if (order === "desc") {
        collection = collection.reverse();
      }

      if (!opts.includeDeleted) {
        collection = collection.and((r) => !r.deleted);
      }

      if (opts.select) {
        collection = collection.and(opts.select);
      }

      const stream = new ReadableStream<IdxEntry>({
        async start(ctrl) {
          await collection.each((entry) => ctrl.enqueue(entry));
          ctrl.close();
        },
      });

      return Result.Ok(stream);
    });
  }
}
