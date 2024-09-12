import pLimit from "p-limit";
import { format, parse, ToString } from "@ipld/dag-json";
import { exception2Result, Logger, ResolveOnce, Result, URI } from "@adviser/cement";
import { EventBlock, decodeEventBlock } from "@web3-storage/pail/clock";
import { EventView } from "@web3-storage/pail/clock/api";

import type {
  AnyBlock,
  AnyLink,
  CommitOpts,
  DataSaveOpts,
  DataStore,
  DbMeta,
  MetaStore,
  WALStore as WALStore,
  WALState,
  LoadHandler,
  KeyedCrypto,
  Loadable,
  CarClockHead,
  DbMetaEventBlock,
  CarClockLink,
} from "./types.js";
import { Falsy, StoreType, SuperThis, throwFalsy, CRDTEntry } from "../types.js";
import { Gateway } from "./gateway.js";
import { ensureLogger, isNotFoundError } from "../utils.js";
import { carLogIncludesGroup } from "./loader.js";
import { CommitQueue } from "./commit-queue.js";
import { keyedCryptoFactory } from "../runtime/keyed-crypto.js";
import { KeyBag } from "../runtime/key-bag.js";
import { FragmentGateway } from "./fragment-gateway.js";
import { Link } from "multiformats";

function guardVersion(url: URI): Result<URI> {
  if (!url.hasParam("version")) {
    return Result.Err(`missing version: ${url.toString()}`);
  }
  return Result.Ok(url);
}

export interface StoreOpts {
  readonly gateway: Gateway;
  readonly keybag: () => Promise<KeyBag>;
  readonly loader?: Loadable;
}

abstract class BaseStoreImpl {
  // should be injectable

  abstract readonly storeType: StoreType;
  readonly name: string;

  private _url: URI;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly gateway: FragmentGateway;
  readonly keybag: () => Promise<KeyBag>;
  readonly loader?: Loadable;
  constructor(name: string, url: URI, opts: StoreOpts, sthis: SuperThis, logger: Logger) {
    this.name = name;
    this._url = url;
    this.keybag = opts.keybag;
    this.sthis = sthis;
    this.logger = logger
      .With()
      .Ref("url", () => this._url.toString())
      .Str("name", name)
      .Logger();
    this.gateway = new FragmentGateway(this.sthis, opts.gateway);
    this.loader = opts.loader;
  }

  url(): URI {
    return this._url;
  }

  readonly _onStarted: (() => void)[] = [];
  onStarted(fn: () => void) {
    this._onStarted.push(fn);
  }
  readonly _onClosed: (() => void)[] = [];
  onClosed(fn: () => void) {
    this._onClosed.push(fn);
  }
  abstract close(): Promise<Result<void>>;

  readonly ready?: () => Promise<void>;

  async keyedCrypto(): Promise<KeyedCrypto> {
    return keyedCryptoFactory(this._url, await this.keybag(), this.sthis);
  }

  async start(): Promise<Result<URI>> {
    this.logger.Debug().Str("storeType", this.storeType).Msg("starting-gateway-pre");
    this._url = this._url.build().setParam("store", this.storeType).URI();
    const res = await this.gateway.start(this._url);
    if (res.isErr()) {
      this.logger.Error().Result("gw-start", res).Msg("started-gateway");
      return res as Result<URI>;
    }
    this._url = res.Ok();
    // add storekey to url
    const kb = await this.keybag();
    const skRes = await kb.ensureKeyFromUrl(this._url, () => {
      const idx = this._url.getParam("index");
      const storeKeyName = [this.name];
      if (idx) {
        storeKeyName.push(idx);
      }
      storeKeyName.push(this.storeType);
      return storeKeyName.join(":");
    });
    if (skRes.isErr()) {
      return skRes as Result<URI>;
    }
    this._url = skRes.Ok();
    const version = guardVersion(this._url);
    if (version.isErr()) {
      this.logger.Error().Result("version", version).Msg("guardVersion");
      await this.close();
      return version;
    }
    if (this.ready) {
      const fn = this.ready.bind(this);
      const ready = await exception2Result(fn);
      if (ready.isErr()) {
        await this.close();
        return ready as Result<URI>;
      }
    }
    this._onStarted.forEach((fn) => fn());
    this.logger.Debug().Msg("started");
    return version;
  }
}

export class MetaStoreImpl extends BaseStoreImpl implements MetaStore {
  readonly storeType = "meta";
  readonly subscribers = new Map<string, LoadHandler[]>();
  parents: CarClockHead = [];

  constructor(sthis: SuperThis, name: string, url: URI, opts: StoreOpts, remote?: boolean) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
    super(
      name,
      url,
      {
        ...opts,
      },
      sthis,
      ensureLogger(sthis, "MetaStoreImpl"),
    );
    if (remote && opts.gateway.subscribe) {
      this.logger.Debug().Str("url", url.toString()).Msg("Subscribing to the gateway");
      opts.gateway.subscribe(url, (byteHead: Uint8Array) => this.handleEventByteHead(byteHead));
    }
  }

  makeHeader({ cars }: DbMeta): ToString<DbMeta> {
    const toEncode: DbMeta = { cars };
    // if (key) toEncode.key = key;
    return format(toEncode);
  }

  async createEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const data = {
      dbMeta: bytes,
    };
    const event = await EventBlock.create(
      data,
      this.parents as unknown as Link<EventView<{ dbMeta: Uint8Array }>, number, number, 1>[],
    );
    // await this.eventBlocks.put(event.cid, event.bytes);
    return event as EventBlock<{ dbMeta: Uint8Array }>;
  }

  async decodeEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const event = await decodeEventBlock<{ dbMeta: Uint8Array }>(bytes);
    return event as EventBlock<{ dbMeta: Uint8Array }>;
  }

  async decodeMetaBlock(crdtEntry: CRDTEntry): Promise<{ eventCid: CarClockLink; dbMeta: DbMeta; parents: string[] }> {
    const eventBytes = decodeFromBase64(crdtEntry.data);
    const eventBlock = await this.decodeEventBlock(eventBytes);
    return {
      eventCid: eventBlock.cid as CarClockLink,
      parents: crdtEntry.parents,
      dbMeta: parse<DbMeta>(this.sthis.txt.decode(eventBlock.value.data.dbMeta)),
    };
  }

  async handleByteHeads(byteHeads: Uint8Array) {
    const crdtEntries = JSON.parse(this.sthis.txt.decode(byteHeads)) as CRDTEntry[];
    try {
      const dbMetas = await Promise.all(crdtEntries.map((entry) => this.decodeMetaBlock(entry)));
      return dbMetas;
    } catch (e) {
      throw this.logger.Error().Err(e).Msg("parseHeader").AsError();
    }
  }

  async handleEventByteHead(byteHead: Uint8Array) {
    const crdtEntry = JSON.parse(this.sthis.txt.decode(byteHead)) as CRDTEntry;
    const { eventCid, dbMeta, parents } = await this.decodeMetaBlock(crdtEntry);
    this.loader?.taskManager?.handleEvent(eventCid, parents, dbMeta);
  }

  async load(): Promise<DbMeta[] | Falsy> {
    const branch = "main";
    const url = await this.gateway.buildUrl(this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Result("buidUrl", url).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    const bytes = await this.gateway.get(url.Ok());
    if (bytes.isErr()) {
      if (isNotFoundError(bytes)) {
        return undefined;
      }
      throw this.logger.Error().Url(url.Ok()).Result("bytes:", bytes).Msg("gateway get").AsError();
    }
    const dbMetas = await this.handleByteHeads(bytes.Ok());
    await this.loader?.handleDbMetasFromStore(dbMetas.map((m) => m.dbMeta)); // the old one didn't await
    const cids = dbMetas.map((m) => m.eventCid);
    const uniqueParentsMap = new Map([...this.parents, ...cids].map((p) => [p.toString(), p]));
    this.parents = Array.from(uniqueParentsMap.values());
    return dbMetas.map((m) => m.dbMeta);
  }

  async encodeEventWithParents(event: EventBlock<{ dbMeta: Uint8Array }>): Promise<Uint8Array> {
    const base64String = encodeToBase64(event.bytes);
    const crdtEntry = {
      cid: event.cid.toString(),
      data: base64String,
      parents: this.parents.map((p) => p.toString()),
    };
    return this.sthis.txt.encode(JSON.stringify([crdtEntry]));
  }

  async save(meta: DbMeta, branch?: string): Promise<Result<void>> {
    branch = branch || "main";
    this.logger.Debug().Str("branch", branch).Any("meta", meta).Msg("saving meta");
    const event = await this.createEventBlock(this.sthis.txt.encode(this.makeHeader(meta)));
    const bytes = await this.encodeEventWithParents(event);
    const url = await this.gateway.buildUrl(this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.put(url.Ok(), bytes);
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    await this.loader?.handleDbMetasFromStore([meta]);
    this.parents = [event.cid];
    return res;
  }

  async close(): Promise<Result<void>> {
    await this.gateway.close(this.url());
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }
  async destroy(): Promise<Result<void>> {
    return this.gateway.destroy(this.url());
  }
}

export class DataStoreImpl extends BaseStoreImpl implements DataStore {
  readonly storeType = "data";
  // readonly tag: string = "car-base";

  constructor(sthis: SuperThis, name: string, url: URI, opts: StoreOpts) {
    super(
      name,
      url,
      {
        ...opts,
      },
      sthis,
      ensureLogger(sthis, "DataStoreImpl"),
    );
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    this.logger.Debug().Any("cid", cid).Msg("loading");
    const url = await this.gateway.buildUrl(this.url(), cid.toString());
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("cid", cid.toString()).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.get(url.Ok());
    if (res.isErr()) {
      throw res.Err();
    }
    return { cid, bytes: res.Ok() };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async save(car: AnyBlock, opts?: DataSaveOpts): Promise</*AnyLink | */ void> {
    this.logger.Debug().Any("cid", car.cid.toString()).Msg("saving");
    const url = await this.gateway.buildUrl(this.url(), car.cid.toString());
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Ref("cid", car.cid).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.put(url.Ok(), car.bytes);
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    return res.Ok();
  }
  async remove(cid: AnyLink): Promise<Result<void>> {
    const url = await this.gateway.buildUrl(this.url(), cid.toString());
    if (url.isErr()) {
      return url;
    }
    return this.gateway.delete(url.Ok());
  }
  async close(): Promise<Result<void>> {
    await this.gateway.close(this.url());
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }
  destroy(): Promise<Result<void>> {
    return this.gateway.destroy(this.url());
  }
}

export class WALStoreImpl extends BaseStoreImpl implements WALStore {
  readonly storeType = "wal";
  // readonly tag: string = "rwal-base";

  readonly loader: Loadable;

  readonly _ready = new ResolveOnce<void>();

  walState: WALState = { operations: [], noLoaderOps: [], fileOperations: [] };
  readonly processing: Promise<void> | undefined = undefined;
  readonly processQueue: CommitQueue<void> = new CommitQueue<void>();

  constructor(loader: Loadable, url: URI, opts: StoreOpts) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
    super(
      loader.name,
      url,
      {
        ...opts,
      },
      loader.sthis,
      ensureLogger(loader.sthis, "WALStoreImpl"),
    );
    this.loader = loader;
  }

  ready = async () => {
    return this._ready.once(async () => {
      const walState = await this.load().catch((e) => {
        this.logger.Error().Any("error", e).Msg("error loading wal");
        return undefined;
      });
      if (!walState) {
        this.walState.operations = [];
        this.walState.fileOperations = [];
      } else {
        this.walState.operations = walState.operations || [];
        this.walState.fileOperations = walState.fileOperations || [];
      }
    });
  };

  async enqueue(dbMeta: DbMeta, opts: CommitOpts) {
    await this.ready();
    if (opts.noLoader) {
      this.walState.noLoaderOps.push(dbMeta);
    } else {
      this.walState.operations.push(dbMeta);
    }
    await this.save(this.walState);
    void this.process();
  }

  async enqueueFile(fileCid: AnyLink, publicFile = false) {
    await this.ready();
    this.walState.fileOperations.push({ cid: fileCid, public: publicFile });
    // await this.save(this.walState)
  }

  async process() {
    await this.ready();
    if (!this.loader.remoteCarStore) return;
    await this.processQueue.enqueue(async () => {
      try {
        await this._doProcess();
      } catch (e) {
        this.logger.Error().Any("error", e).Msg("error processing wal");
      }
      if (this.walState.operations.length || this.walState.fileOperations.length || this.walState.noLoaderOps.length) {
        setTimeout(() => void this.process(), 0);
      }
    });
  }

  async _doProcess() {
    if (!this.loader.remoteCarStore) return;
    const rmlp = (async () => {
      const operations = [...this.walState.operations];
      const fileOperations = [...this.walState.fileOperations];
      const uploads: Promise<void>[] = [];
      const noLoaderOps = [...this.walState.noLoaderOps];
      const limit = pLimit(5);

      if (operations.length + fileOperations.length + noLoaderOps.length === 0) return;

      for (const dbMeta of noLoaderOps) {
        const uploadP = limit(async () => {
          for (const cid of dbMeta.cars) {
            const car = await (await this.loader.carStore()).load(cid);
            if (!car) {
              if (carLogIncludesGroup(this.loader.carLog, dbMeta.cars))
                throw this.logger.Error().Ref("cid", cid).Msg("missing local car").AsError();
            } else {
              await throwFalsy(this.loader.remoteCarStore).save(car);
            }
            this.walState.noLoaderOps = this.walState.noLoaderOps.filter((op) => op !== dbMeta);
          }
        });
        uploads.push(uploadP);
      }

      for (const dbMeta of operations) {
        const uploadP = limit(async () => {
          for (const cid of dbMeta.cars) {
            const car = await (await this.loader.carStore()).load(cid).catch(() => null);
            if (!car) {
              if (carLogIncludesGroup(this.loader.carLog, dbMeta.cars))
                throw this.logger.Error().Ref("cid", cid).Msg(`missing local car`).AsError();
            } else {
              await throwFalsy(this.loader.remoteCarStore).save(car);
            }
          }
          this.walState.operations = this.walState.operations.filter((op) => op !== dbMeta);
        });
        uploads.push(uploadP);
      }

      if (fileOperations.length) {
        const dbLoader = this.loader;
        for (const { cid: fileCid, public: publicFile } of fileOperations) {
          const uploadP = limit(async () => {
            const fileBlock = await (await dbLoader.fileStore()).load(fileCid); // .catch(() => false)
            await dbLoader.remoteFileStore?.save(fileBlock, { public: publicFile });
            this.walState.fileOperations = this.walState.fileOperations.filter((op) => op.cid !== fileCid);
          });
          uploads.push(uploadP);
        }
      }

      try {
        const res = await Promise.allSettled(uploads);
        const errors = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        if (errors.length) {
          throw this.logger.Error().Any("errors", errors).Msg("error uploading").AsError();
        }
        if (operations.length) {
          const lastOp = operations[operations.length - 1];
          // console.log('saving remote meta', lastOp.car.toString())
          await this.loader.remoteMetaStore?.save(lastOp).catch((e: Error) => {
            this.walState.operations.push(lastOp);
            throw this.logger.Error().Any("error", e).Msg("error saving remote meta").AsError();
          });
        }
      } finally {
        await this.save(this.walState);
      }
    })();
    // this.loader.remoteMetaLoading = rmlp;
    await rmlp;
  }

  async load(): Promise<WALState | Falsy> {
    this.logger.Debug().Msg("loading");
    const filepath = await this.gateway.buildUrl(this.url(), "wal");
    if (filepath.isErr()) {
      throw this.logger.Error().Err(filepath.Err()).Url(this.url()).Msg("error building url").AsError();
    }
    const bytes = await this.gateway.get(filepath.Ok());
    if (bytes.isErr()) {
      if (isNotFoundError(bytes)) {
        return undefined;
      }
      throw this.logger.Error().Err(bytes.Err()).Msg("error get").AsError();
    }
    try {
      return bytes && parse<WALState>(this.sthis.txt.decode(bytes.Ok()));
    } catch (e) {
      throw this.logger.Error().Err(e).Msg("error parse").AsError();
    }
  }

  async save(state: WALState) {
    const filepath = await this.gateway.buildUrl(this.url(), "wal");
    if (filepath.isErr()) {
      throw this.logger.Error().Err(filepath.Err()).Url(this.url()).Msg("error building url").AsError();
    }
    let encoded: ToString<WALState>;
    try {
      encoded = format(state);
    } catch (e) {
      throw this.logger.Error().Err(e).Any("state", state).Msg("error format").AsError();
    }
    const res = await this.gateway.put(filepath.Ok(), this.sthis.txt.encode(encoded));
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Str("filePath", filepath.Ok().toString()).Msg("error saving").AsError();
    }
  }

  async close() {
    await this.gateway.close(this.url());
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }

  destroy() {
    return this.gateway.destroy(this.url());
  }
}

function encodeToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  let i;
  for (i = 0; i < bytes.length - 2; i += 3) {
    base64 += chars[bytes[i] >> 2];
    base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += chars[bytes[i + 2] & 63];
  }
  if (i < bytes.length) {
    base64 += chars[bytes[i] >> 2];
    if (i === bytes.length - 1) {
      base64 += chars[(bytes[i] & 3) << 4];
      base64 += "==";
    } else {
      base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64 += chars[(bytes[i + 1] & 15) << 2];
      base64 += "=";
    }
  }
  return base64;
}

function decodeFromBase64(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array((base64.length * 3) / 4);
  let i;
  let j = 0;
  for (i = 0; i < base64.length; i += 4) {
    const a = chars.indexOf(base64[i]);
    const b = chars.indexOf(base64[i + 1]);
    const c = chars.indexOf(base64[i + 2]);
    const d = chars.indexOf(base64[i + 3]);
    bytes[j++] = (a << 2) | (b >> 4);
    if (base64[i + 2] !== "=") {
      bytes[j++] = ((b & 15) << 4) | (c >> 2);
    }
    if (base64[i + 3] !== "=") {
      bytes[j++] = ((c & 3) << 6) | d;
    }
  }
  return bytes.slice(0, j);
}
