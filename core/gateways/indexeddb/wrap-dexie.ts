import { exception2Result, Result } from "@adviser/cement";
import { DBTable, KV } from "@fireproof/core-types-blockstore";
import type { Dexie, Table } from "dexie";

export class WrapDexieTable<T> implements DBTable<T> {
  readonly #table: Table<T>;
  readonly #db: Dexie;
  readonly #pkKey: string;
  constructor(db: Dexie, table: Table<T>, pkKey: string) {
    this.#table = table;
    this.#db = db;
    this.#pkKey = pkKey;
  }
  clear(): Promise<void> {
    return this.#table.clear();
  }
  kv2keys(t: KV<T, string>[]): string[] | undefined {
    const needsKeys = t.filter(({ value }) => !this.containPrimaryKey(value));
    if (needsKeys.length && needsKeys.length !== t.length) {
      throw new Error("primary key mix is not supported");
    }
    return needsKeys.length ? needsKeys.map(({ key }) => key) : undefined;
  }
  async add(...t: KV<T, string>[]): Promise<Result<KV<T, string>[]>> {
    return this.#table
      .bulkAdd(
        t.map((kv) => kv.value),
        this.kv2keys(t),
      )
      .then(() => Result.Ok(t))
      .catch((e) => Result.Err(e));
  }
  delete(key: string): Promise<Result<void>> {
    return exception2Result(() => this.#table.delete(key));
  }
  get(key: string): Promise<Result<T | undefined>> {
    return this.#table
      .get(key)
      .then((v) => Result.Ok(v))
      .catch((e) => Result.Err(e));
  }
  containPrimaryKey(t: T): boolean {
    if (typeof t !== "object" || t === null) return false;
    const pks = [this.#table.schema.primKey.keyPath].flat();
    return pks.filter((k) => t[k as keyof T]).length === pks.length;
  }

  async put(...t: KV<T, string>[]): Promise<Result<KV<T, string>[]>> {
    return this.#table
      .bulkPut(
        t.map(({ value }) => value),
        this.kv2keys(t),
      )
      .then(() => Result.Ok(t))
      .catch((e) => Result.Err(e));
  }
  list(_start?: string, _end?: string): ReadableStream<T> {
    return new ReadableStream({
      start: (controller) => {
        this.#table
          .each((blockLog, cursor) => {
            if (typeof _start === "string" && cursor.primaryKey.localeCompare(_start) < 0) return;
            if (typeof _end === "string" && cursor.primaryKey.localeCompare(_end) > 0) return;
            controller.enqueue(blockLog);
          })
          .then(() => controller.close());
        // .where(this.#pkKey)
        // .between(start ?? "", end ?? "")
        // .each((blockLog) => {
        //   controller.enqueue(blockLog);
        // }).then(() => controller.close());
        // controller.close();
      },
    });
  }
  transaction<R>(fn: (tx: Omit<DBTable<T, string>, "transaction">) => Promise<R>): Promise<R> {
    return this.#db.transaction("rw", this.#table.name, (tx) =>
      fn(new WrapDexieTable(this.#db, tx.table(this.#table.name), this.#pkKey)),
    );
  }
}
