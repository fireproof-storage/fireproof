import { Lazy, Result, URI } from "@adviser/cement";
import { NotFoundError, PARAM, SuperThis } from "@fireproof/core-types-base";
import {
  BlockLog,
  Cars,
  CidSet,
  DBTable,
  FPIndexedDB,
  Gateway,
  GetResult,
  KV,
  Peers,
  VoidResult,
} from "@fireproof/core-types-blockstore";
import { MEMORY_VERSION } from "./version.js";
import { consumeIterator, consumeStream, ensureLogger } from "@fireproof/core-runtime";

function cleanURI(uri: URI): URI {
  return uri
    .build()
    .cleanParams(
      PARAM.VERSION,
      PARAM.NAME,
      // PARAM.STORE,
      PARAM.STORE_KEY,
      PARAM.SELF_REFLECT,
      PARAM.LOCAL_NAME,
    )
    .URI();
}

class MemoryTable<T, TKey = string> implements DBTable<T, TKey> {
  readonly memories: Map<string, unknown>;
  readonly segment: string;
  readonly type: string;
  readonly pkKey: string;
  constructor(memories: Map<string, Uint8Array>, segment: string, type: string, pkKey: string) {
    this.memories = memories;
    this.segment = segment;
    this.type = type;
    this.pkKey = pkKey;
  }
  key(t: T): TKey {
    return `${this.segment}:${this.type}:${t[this.pkKey as keyof T] as string}` as TKey;
  }
  keys(t: KV<T, TKey>[]): Result<TKey[]> {
    const keys = t.filter(({ value }) => !!value[this.pkKey as keyof T]).map(({ value }) => this.key(value));
    if (keys.length !== t.length) {
      return Result.Err(`primary key must set: ${this.pkKey}`);
    }
    return Result.Ok(keys);
  }

  // bulkAdd(ts: T[]): Promise<void>;
  add(...t: KV<T, TKey>[]): Promise<Result<KV<T, TKey>[]>> {
    const rKeys = this.keys(t);
    if (rKeys.isErr()) {
      return Promise.resolve(Result.Err(rKeys.Err()));
    }
    if (rKeys.Ok().filter((key) => this.memories.has(key as string)).length) {
      return Promise.resolve(Result.Err("already exists"));
    }
    rKeys.Ok().forEach((key, i) => {
      this.memories.set(key as string, t[i].value as unknown as Uint8Array);
    });
    return Promise.resolve(Result.Ok(t));
  }
  delete(key: TKey): Promise<Result<void>> {
    const iKey = this.key({ [this.pkKey]: key } as T);
    this.memories.delete(iKey as string);
    return Promise.resolve(Result.Ok(undefined));
  }
  get(key: TKey): Promise<Result<T | undefined>> {
    const iKey = this.key({ [this.pkKey]: key } as T);
    if (this.memories.has(iKey as string)) {
      return Promise.resolve(Result.Ok(this.memories.get(iKey as string) as unknown as T));
    }
    return Promise.resolve(Result.Ok(undefined));
  }
  put(...t: KV<T, TKey>[]): Promise<Result<KV<T, TKey>[]>> {
    const rKeys = this.keys(t);
    if (rKeys.isErr()) {
      return Promise.resolve(Result.Err(rKeys.Err()));
    }
    rKeys.Ok().forEach((key, i) => {
      this.memories.set(key as string, t[i].value as unknown as Uint8Array);
    });
    return Promise.resolve(Result.Ok(t));
  }

  list(start?: TKey, end?: TKey): ReadableStream<T> {
    return new ReadableStream({
      start: (controller) => {
        const collection = this.key({ [this.pkKey]: "" } as T) as string;
        const sKey = this.key({ [this.pkKey]: start ?? "" } as T) as string;
        const eKey = this.key({ [this.pkKey]: end ?? "" } as T) as string;
        let match: (v: [string, unknown]) => boolean;
        if (start && end) {
          match = ([k]) => k.startsWith(collection) && k.localeCompare(sKey) >= 0 && k.localeCompare(eKey) <= 0;
        } else if (start) {
          match = ([k]) => k.startsWith(collection) && k.localeCompare(sKey) >= 0;
        } else if (end) {
          match = ([k]) => k.startsWith(collection) && k.localeCompare(eKey) <= 0;
        } else {
          match = ([k]) => k.startsWith(k);
        }
        const citer = this.memories.entries();
        const items: [string, unknown][] = [];
        consumeIterator(citer, (kv) => {
          if (match(kv)) {
            items.push(kv);
          }
        })
          .then(() =>
            consumeIterator(items.sort((a, b) => a[0].localeCompare(b[0])).values(), (kv) => {
              controller.enqueue(kv[1] as unknown as T);
            }),
          )
          .then(() => controller.close())
          .catch((e) => controller.error(e));
      },
    });
  }
  transaction<R>(fn: (tx: Omit<DBTable<T, TKey>, "transaction">) => Promise<R>): Promise<R> {
    return fn(this);
  }
  clear(): Promise<void> {
    const toDelete: TKey[] = [];
    return consumeStream(this.list(), (t) => {
      toDelete.push(this.key(t));
    }).then(() => {
      for (const key of toDelete) {
        this.memories.delete(key as string);
      }
    });
  }
}

export class FPMemoryDBImpl implements FPIndexedDB {
  readonly uri: URI;
  readonly #memories: Map<string, Uint8Array>;
  constructor(uri: URI, memories: Map<string, Uint8Array>) {
    this.#memories = memories;
    this.uri = uri;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
  destroy(): Promise<void> {
    const toDelete = [];
    for (const key of this.#memories.keys()) {
      if (key.startsWith(this.uri.pathname)) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.#memories.delete(key);
    }
    return Promise.resolve();
  }

  objectStore<T = Uint8Array>(_name: string): DBTable<T> {
    throw new Error("Method not implemented.");
  }
  version(): DBTable<{ version: string }> {
    throw new Error("Method not implemented.");
  }
  readonly fpSync = {
    blockLogs: Lazy((): DBTable<BlockLog> => new MemoryTable(this.#memories, this.uri.pathname, "blockLogs", "seq")),
    cidSets: Lazy((): DBTable<CidSet> => new MemoryTable(this.#memories, this.uri.pathname, "cidSets", "cid")),
    cars: Lazy((): DBTable<Cars> => new MemoryTable(this.#memories, this.uri.pathname, "cars", "carCid")),
    peers: Lazy((): DBTable<Peers> => new MemoryTable(this.#memories, this.uri.pathname, "peers", "peerId")),
  };

  // async open(): Promise<void> {
  //   await this.#db.open();
  // }

  // async close(): Promise<void> {
  //   await this.#db.close();
  // }
}

export function memFPIndexedDB(_sthis: SuperThis, uri: URI, memories: Map<string, Uint8Array>): Promise<FPIndexedDB> {
  return Promise.resolve(new FPMemoryDBImpl(uri, memories));
}

export class MemoryGateway implements Gateway {
  readonly memories: Map<string, Uint8Array>;
  readonly sthis: SuperThis;
  // readonly logger: Logger;
  constructor(sthis: SuperThis, memories: Map<string, Uint8Array>) {
    this.memories = memories;
    this.sthis = sthis;
  }

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.KEY, key).URI()));
  }
  start(baseUrl: URI): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.VERSION, MEMORY_VERSION).URI()));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  close(baseUrl: URI): Promise<VoidResult> {
    return Promise.resolve(Result.Ok(undefined));
  }
  destroy(baseUrl: URI): Promise<VoidResult> {
    const keyUrl = cleanURI(baseUrl);
    const match = keyUrl.match(keyUrl);
    for (const key of this.memories.keys()) {
      if (keyUrl.match(key).score >= match.score) {
        this.memories.delete(key);
      }
    }
    // this.memorys.clear();
    return Promise.resolve(Result.Ok(undefined));
  }

  // subscribe(url: URI, callback: (meta: Uint8Array) => void, sthis: SuperThis): Promise<UnsubscribeResult> {
  //   console.log("subscribe", url.toString());
  //   const callbackKey = `callbacks:${cleanURI(url).toString()}`;
  //   const callbacks = (this.memories.get(callbackKey) as Callbacks) ?? new Map<string, Callbacks>();
  //   const key = sthis.nextId().str;
  //   callbacks.set(key, callback);
  //   return Promise.resolve(
  //     Result.Ok(() => {
  //       callbacks.delete(key);
  //       if (callbacks.size === 0) {
  //         this.memories.delete(callbackKey);
  //       }
  //     }),
  //   );
  // }

  async put(url: URI, bytes: Uint8Array, sthis: SuperThis): Promise<VoidResult> {
    // logger.Debug().Url(url).Msg("put");
    if (url.getParam(PARAM.STORE) === "car") {
      const logger = ensureLogger(sthis, "MemoryGatewayCar");
      logger.Debug().Url(url).Msg("put-car");
    }
    if (url.getParam(PARAM.STORE) === "meta") {
      const logger = ensureLogger(sthis, "MemoryGatewayMeta");
      logger.Debug().Url(url).Msg("put-meta");
      // if (url.hasParam(PARAM.SELF_REFLECT)) {
      //   const callbackKey = `callbacks:${cleanURI(url).toString()}`;
      //   const callbacks = this.memories.get(callbackKey) as Callbacks;
      //   if (callbacks) {
      //     for (const callback of callbacks.values()) {
      //       callback(bytes);
      //     }
      //   }
      // }
    }
    this.memories.set(cleanURI(url).toString(), bytes);
    return Result.Ok(undefined);
  }
  // get could return a NotFoundError if the key is not found
  get(url: URI, sthis: SuperThis): Promise<GetResult> {
    // logger.Debug().Url(url).Msg("get");
    const x = this.memories.get(cleanURI(url).toString());
    if (!x) {
      // const possible = Array.from(this.memorys.keys()).filter(i => i.startsWith(url.build().cleanParams().toString()))
      // this.sthis.logger.Warn().Any("possible", possible).Url(url).Msg("not found");
      return Promise.resolve(Result.Err(new NotFoundError(`not found: ${url.toString()}`)));
    }
    const logger = ensureLogger(sthis, "MemoryGateway");
    if (url.getParam(PARAM.STORE) === "meta") {
      logger.Debug().Url(url).Msg("get-meta");
    }
    if (url.getParam(PARAM.STORE) === "car") {
      logger.Debug().Url(url).Msg("get-car");
    }
    return Promise.resolve(Result.Ok(x));
  }
  delete(url: URI): Promise<VoidResult> {
    this.memories.delete(cleanURI(url).toString());
    return Promise.resolve(Result.Ok(undefined));
  }

  async getPlain(url: URI, key: string): Promise<Result<Uint8Array>> {
    const x = this.memories.get(cleanURI(url).build().setParam(PARAM.KEY, key).toString());
    if (!x) {
      return Result.Err(new NotFoundError("not found"));
    }
    return Result.Ok(x);
  }
}
