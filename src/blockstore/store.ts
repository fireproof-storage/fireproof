// import pLimit from "p-limit";
import { format, parse, ToString } from "@ipld/dag-json";
import { Logger, ResolveOnce, Result, URI } from "@adviser/cement";

import type {
  AnyBlock,
  AnyLink,
  CommitOpts,
  DataSaveOpts,
  DataStore,
  DbMeta,
  MetaStore,
  WALStore,
  WALState,
  LoadHandler,
  KeyedCrypto,
  Loadable,
} from "./types.js";
import { Falsy, StoreType, SuperThis, throwFalsy } from "../types.js";
import { Gateway } from "./gateway.js";
import { ensureLogger, exception2Result, isNotFoundError } from "../utils.js";
import { carLogIncludesGroup } from "./loader.js";
import { CommitQueue } from "./commit-queue.js";
import { keyedCryptoFactory } from "../runtime/keyed-crypto.js";
import { KeyBag } from "../runtime/key-bag.js";

function guardVersion(url: URI): Result<URI> {
  if (!url.hasParam("version")) {
    return Result.Err(`missing version: ${url.toString()}`);
  }
  return Result.Ok(url);
}

export interface StoreOpts {
  readonly gateway: Gateway;
  readonly keybag: () => Promise<KeyBag>;
}

abstract class BaseStoreImpl {
  // should be injectable

  abstract readonly storeType: StoreType;
  readonly name: string;

  private _url: URI;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly gateway: Gateway;
  readonly keybag: () => Promise<KeyBag>;
  constructor(name: string, url: URI, opts: StoreOpts, sthis: SuperThis, logger: Logger) {
    this.name = name;
    this._url = url;
    this.keybag = opts.keybag;
    this.sthis = sthis;
    this.logger = logger
      .With()
      .Ref("url", () => this._url.toString())
      .Str("id", "" + Math.random())
      .Str("name", name)
      .Logger();
    this.gateway = opts.gateway;
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
    this.logger.Debug().Msg("keyedCrypto");
    const kb = await this.keybag();
    this.logger.Debug().Msg("keyedCrypto-keybag");
    const kcf = await keyedCryptoFactory(this._url, kb, this.sthis);
    this.logger.Debug().Msg("keyedCrypto-kcf");
    return kcf;
  }

  started = false;
  async start(): Promise<Result<URI>> {
    if (this.started) {
      throw this.logger.Error().Msg("already started").AsError();
    }
    this.started = true;
    this.logger.Debug().Str("storeType", this.storeType).Msg("starting-gateway-pre");
    this._url = this._url.build().setParam("store", this.storeType).URI();
    const res = await this.gateway.start(this._url);
    if (res.isErr()) {
      this.logger.Error().Result("gw-start", res).Msg("started-gateway");
      return res as Result<URI>;
    }
    this._url = res.Ok();
    this.logger.Debug().Str("storeType", this.storeType).Msg("starting-gateway-post-0");
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
      this.logger.Debug().Str("storeType", this.storeType).Msg("starting-gateway-1");
      const ready = await exception2Result(fn);
      if (ready.isErr()) {
        await this.close();
        return ready as Result<URI>;
      }
    }
    this.logger.Debug().Str("storeType", this.storeType).Msg("starting-gateway-2");
    this._onStarted.forEach((fn) => fn());
    this.logger.Debug().Msg("started");
    return version;
  }
}

export class MetaStoreImpl extends BaseStoreImpl implements MetaStore {
  readonly storeType = "meta";
  readonly subscribers = new Map<string, LoadHandler[]>();

  constructor(sthis: SuperThis, name: string, url: URI, opts: StoreOpts) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
<<<<<<< HEAD
    super(
      name,
      url,
      {
        ...opts,
      },
      sthis,
      ensureLogger(sthis, "MetaStoreImpl"),
    );
||||||| parent of 15c80dba (WIP)
    super(name, url, {
      ...opts,
      logger: ensureLogger(opts.logger, "MetaStoreImpl"),
    });
=======
    super(name, url, {
      ...opts,
      logger: ensureLogger(opts.logger, "MetaStoreImpl", {"this": 1, log: 1}),
    });
>>>>>>> 15c80dba (WIP)
  }

  onLoad(branch: string, loadHandler: LoadHandler): () => void {
    const subscribers = this.subscribers.get(branch) || [];
    this.logger.Debug().Str("branch", branch).Len(subscribers).Msg("onLoad");
    subscribers.push(loadHandler);
    this.subscribers.set(branch, subscribers);
    return () => {
      const subscribers = this.subscribers.get(branch) || [];
      const idx = subscribers.indexOf(loadHandler);
      if (idx > -1) subscribers.splice(idx, 1);
    };
  }

  makeHeader({ cars }: DbMeta): ToString<DbMeta> {
    const toEncode: DbMeta = { cars };
    // if (key) toEncode.key = key;
    return format(toEncode);
  }

  parseHeader(headerData: ToString<DbMeta>): DbMeta {
    const got = parse<DbMeta>(headerData);
    return got;
  }

  async handleSubscribers(dbMetas: DbMeta[], branch: string) {
    try {
      const subscribers = this.subscribers.get(branch) || [];
      this.logger.Debug().Str("branch", branch).Len(subscribers).Any("dbMetas", dbMetas).Msg("handleSubscribers-pre");
      await Promise.all(subscribers.map((subscriber) => subscriber(dbMetas)));
      this.logger.Debug().Str("branch", branch).Len(subscribers).Any("dbMetas", dbMetas).Msg("handleSubscribers-post");
    } catch (e) {
      this.logger.Error().Err(e).Msg("handleSubscribers").AsError();
    }
  }

  async handleByteHeads(byteHeads: Uint8Array[], branch = "main") {
    this.logger.Debug().Str("branch", branch).Msg("handleByteHeads-0");
    let dbMetas: DbMeta[];
    try {
      dbMetas = this.dbMetasForByteHeads(byteHeads);
      this.logger.Debug().Str("branch", branch).Msg("handleByteHeads-1");
    } catch (e) {
      throw this.logger.Error().Err(e).Msg("parseHeader").AsError();
    }
    this.logger.Debug().Str("branch", branch).Msg("handleByteHeads-2");
    await this.handleSubscribers(dbMetas, branch);
    this.logger.Debug().Str("branch", branch).Msg("handleByteHeads-3");
    return dbMetas;
  }
  dbMetasForByteHeads(byteHeads: Uint8Array[]) {
    this.logger.Debug().Len(byteHeads).Msg("dbMetasForByteHeads-enter");
    return byteHeads.map((bytes) => {
<<<<<<< HEAD
      const txt = this.sthis.txt.decode(bytes);
      return this.parseHeader(txt);
||||||| parent of 15c80dba (WIP)
      const txt = this.textDecoder.decode(bytes);
      this.logger.Debug().Str("txt", txt).Msg("dbMetasForByteHeads");
      return this.parseHeader(txt);
=======
      const txt = this.textDecoder.decode(bytes);
      this.logger.Debug().Str("txt", txt).Msg("dbMetasForByteHeads-decode");
      const ret = this.parseHeader(txt);
      this.logger.Debug().Msg("dbMetasForByteHeads-parseHeader");
      return ret
>>>>>>> 15c80dba (WIP)
    });
  }

  async load(branch?: string): Promise<DbMeta[] | Falsy> {
    branch = branch || "main";
    this.logger.Debug().Str("branch", branch).Msg("loading");
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
    return this.handleByteHeads([bytes.Ok()], branch);
  }

  async save(meta: DbMeta, branch?: string): Promise<Result<void>> {
    branch = branch || "main";
    this.logger.Debug().Str("branch", branch).Any("meta", meta).Any("stack", (new Error()).stack).Msg("saving meta");
    const bytes = this.makeHeader(meta);
    const url = await this.gateway.buildUrl(this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.put(url.Ok(), this.sthis.txt.encode(bytes));
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    await this.handleSubscribers([meta], branch);
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

<<<<<<< HEAD
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
||||||| parent of 15c80dba (WIP)
  constructor(name: string, url: URI, opts: StoreOpts) {
    super(name, url, {
      ...opts,
      logger: ensureLogger(opts.logger, "DataStoreImpl"),
    });
=======
  constructor(name: string, url: URI, opts: StoreOpts) {
    super(name, url, {
      ...opts,
      logger: ensureLogger(opts.logger, "DataStoreImpl", {"this": 1, log: 1}),
    });
>>>>>>> 15c80dba (WIP)
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
  // readonly processing: Promise<void> | undefined = undefined;
  readonly processQueue: CommitQueue<void> = new CommitQueue<void>();

  constructor(loader: Loadable, url: URI, opts: StoreOpts) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
<<<<<<< HEAD
    super(
      loader.name,
      url,
      {
        ...opts,
      },
      loader.sthis,
      ensureLogger(loader.sthis, "WALStoreImpl"),
    );
||||||| parent of 15c80dba (WIP)
    super(loader.name, url, {
      ...opts,
      logger: ensureLogger(opts.logger, "WALStoreImpl"),
    });
=======
    super(loader.name, url, {
      ...opts,
      logger: ensureLogger(opts.logger, "WALStoreImpl", {"this": 1, log: 1}),
    });
>>>>>>> 15c80dba (WIP)
    this.loader = loader;
  }

  readonly ready = async () => {
    return this._ready.once(async () => {
      this.logger.Debug().Msg("ready-once-pre");
      const walState = await this.load().catch((e) => {
        this.logger.Error().Any("error", e).Msg("error loading wal");
        return undefined;
      });
      this.logger.Debug().Msg("ready-once-post");
      const state: Partial<WALState> = walState || {}
      this.walState.operations = state.operations || [];
      this.walState.fileOperations = state.fileOperations || [];
    });
  };

  async enqueue(dbMeta: DbMeta, opts: CommitOpts) {
    await this.ready();
    if (opts.noLoader) {
      this.logger.Debug().Any("dbMeta", dbMeta).Msg("enqueue-noLoader");
      this.walState.noLoaderOps.push(dbMeta);
    } else {
      this.logger.Debug().Any("dbMeta", dbMeta).Msg("enqueue-operations");
      this.walState.operations.push(dbMeta);
    }
    this.logger.Debug().Any("dbMeta", dbMeta).Msg("pre-save");
    await this.save(this.walState);
    this.logger.Debug().Any("dbMeta", dbMeta).Msg("pre-process");
    void this.process();
    this.logger.Debug().Any("dbMeta", dbMeta).Msg("post-process");
  }

  async enqueueFile(fileCid: AnyLink, publicFile = false) {
    await this.ready();
    this.logger.Debug().Str("fileCid", fileCid.toString()).Msg("enqueue-file");
    this.walState.fileOperations.push({ cid: fileCid, public: publicFile });
    // await this.save(this.walState)
  }

  inProcess = false;
  async process() {
    await this.ready();
    this.logger.Debug().Msg("process");
    if (!this.loader.remoteCarStore) return;
    this.logger.Debug().Msg("process-pre-enqueue");
    await this.processQueue.enqueue(async () => {
      if (this.inProcess) {
        throw this.logger.Error().Msg("already processing").AsError();
        return;
      }
      this.inProcess = true;
      try {
        this.logger.Debug().Msg("process-pre-_doProcess");
        await this._doProcess();
        this.logger.Debug().Msg("process-post-_doProcess");
      } catch (e) {
        this.logger.Error().Err(e).Msg("error processing wal");
      } finally {
        this.inProcess = false;
      }
      if (this.walState.operations.length || this.walState.fileOperations.length || this.walState.noLoaderOps.length) {
        this.logger.Debug().Len(this.walState.operations, "ops" ).Len(this.walState.fileOperations, "fops").Len(this.walState.noLoaderOps, "lops").Msg("process-post-reschedule");
        setTimeout(() => void this.process(), 0);
      }
    });
  }

  async _doProcess() {
    this.logger.Debug().Msg("_doProcess enter");
    if (!this.loader.remoteCarStore) return;
    this.logger.Debug().Msg("_doProcess pre rmlp");
    const rmlp = (async () => {
      this.logger.Debug().Msg("_doProcess:rmlp enter");
      const operations = [...this.walState.operations];
      const fileOperations = [...this.walState.fileOperations];
      const uploads: (() => Promise<void>)[] = [];
      const noLoaderOps = [...this.walState.noLoaderOps];

      if (operations.length + fileOperations.length + noLoaderOps.length === 0) {
        this.logger.Debug().Msg("_doProcess:rmlp return");
        return;
      }

      this.logger.Debug().Msg("_doProcess:rmlp pre noLoaderOps");
      for (const dbMeta of noLoaderOps) {
        const uploadP = async () => {
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
        };
        uploads.push(uploadP);
      }

      this.logger.Debug().Len(operations).Msg("_doProcess:rmlp pre operations");
      for (const dbMeta of operations) {
        const uploadP = async () => {
          this.logger.Debug().Any("dbMeta", dbMeta.cars).Msg("in uploadP");
          const carStore = await this.loader.carStore();
          this.logger.Debug().Any("dbMeta", dbMeta.cars).Msg("in uploadP-carStore");
          for (const cid of dbMeta.cars) {
            this.logger.Debug().Any("dbMeta", dbMeta.cars).Msg("in uploadP-pre-load");
            const car = await carStore.load(cid).catch(() => undefined);
            this.logger.Debug().Any("car", car?.cid.toString()).Msg("in uploadP-post-load");
            if (!car) {
              if (carLogIncludesGroup(this.loader.carLog, dbMeta.cars)) {
                throw this.logger.Error().Ref("cid", cid).Msg(`missing local car`).AsError();
              }
            } else {
              this.logger.Debug().Any("car", car?.cid.toString()).Msg("in uploadP-pre-save");
              await throwFalsy(this.loader.remoteCarStore).save(car);
              this.logger.Debug().Any("car", car?.cid.toString()).Msg("in uploadP-post-save");
            }
          }
          this.walState.operations = this.walState.operations.filter((op) => op !== dbMeta);
          this.logger.Debug().Msg("out uploadP");
        };
        uploads.push(uploadP);
      }

      this.logger.Debug().Len(fileOperations).Msg("_doProcess:rmlp pre fileOperations");
      if (fileOperations.length) {
        const dbLoader = this.loader;
        for (const { cid: fileCid, public: publicFile } of fileOperations) {
          const uploadP = async () => {
            const fileBlock = await (await dbLoader.fileStore()).load(fileCid); // .catch(() => false)
            await dbLoader.remoteFileStore?.save(fileBlock, { public: publicFile });
            this.walState.fileOperations = this.walState.fileOperations.filter((op) => op.cid !== fileCid);
          }
          uploads.push(uploadP);
        }
      }

      try {
        this.logger.Debug().Len(uploads).Msg("_doProcess:rmlp pre uploads");
        const res = await Promise.allSettled(uploads);
        const errors = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        this.logger.Debug().Len(errors).Msg("_doProcess:rmlp errors");
        if (errors.length) {
          throw this.logger.Error().Any("errors", errors).Msg("error uploading").AsError();
        }
        this.logger.Debug().Len(operations).Msg("_doProcess:rmlp operations");
        if (operations.length) {
          const lastOp = operations[operations.length - 1];
          // console.log('saving remote meta', lastOp.car.toString())
          await this.loader.remoteMetaStore?.save(lastOp).catch((e: Error) => {
            this.walState.operations.push(lastOp);
            throw this.logger.Error().Any("error", e).Msg("error saving remote meta").AsError();
          });
        }
      } finally {
        this.logger.Debug().Any("walState", this.walState).Msg("_doProcess:rmlp saveWalState");
        await this.save(this.walState);
      }
    })();
    // this.loader.remoteMetaLoading = rmlp;
    this.logger.Debug().Msg("_doProcess pre invoke rmlp");
    await rmlp;
    this.logger.Debug().Msg("_doProcess post invoke rmlp");
  }

  async load(): Promise<WALState | Falsy> {
    this.logger.Debug().Msg("loading");
    const walURL = await this.gateway.buildUrl(this.url(), "main");
    if (walURL.isErr()) {
      throw this.logger.Error().Err(walURL.Err()).Url(this.url()).Msg("error building url").AsError();
    }
    const bytes = await this.gateway.get(walURL.Ok());
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
    const filepath = await this.gateway.buildUrl(this.url(), "main");
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
