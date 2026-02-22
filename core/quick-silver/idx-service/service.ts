import { Dexie, type Collection, type Table } from "dexie"; // Dexie used for minKey/maxKey + IdxDB base
import { exception2Result, KeyedResolvOnce, Result } from "@adviser/cement";
import type { AddToIdxOpts, DeleteFromIdxOpts, IdxEntry, IdxQueryOpts, IdxServiceOpts, MetaEntry } from "./types.js";

function serializeKey(keys: string[]): string {
  return keys.length === 1 ? keys[0] : JSON.stringify(keys);
}

class IdxDB extends Dexie {
  idx!: Table<IdxEntry, [string, string]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      idx: "&[idxName+serializedKey], serializedKey",
    });
  }
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
      const db = this.prepare(opts.dbname);

      let written: IdxEntry | undefined;

      await db.transaction("rw", db.idx, async () => {
        const existing = await db.idx.get([opts.idxName, serializedKey]);

        const metaMap = new Map<string, MetaEntry>();
        for (const e of existing?.meta ?? []) metaMap.set(`${e.type}:${e.key}`, e);
        for (const m of opts.meta ?? []) metaMap.set(`${m.type}:${m.key}`, m);

        written = {
          idxName: opts.idxName,
          serializedKey,
          keys: opts.keys,
          cidUrl: opts.cidUrl,
          primaryKey: opts.primaryKey,
          meta: [...metaMap.values()],
          deleted: false,
        };

        await db.idx.put(written);
      });
      if (!written) return Result.Err(`failed to write idx entry for ${opts.dbname} ${opts.idxName} ${opts.keys}`);
      return Result.Ok(written);
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
        collection = idx
          .where("[idxName+serializedKey]")
          .between([idxName, Dexie.minKey], [idxName, Dexie.maxKey]);
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
