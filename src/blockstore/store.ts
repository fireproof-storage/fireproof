import pLimit from "p-limit";
import { format, parse, ToString } from "@ipld/dag-json";
import { Logger, logValue, ResolveOnce, Result } from "@adviser/cement";

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
} from "./types.js";
import { Falsy, throwFalsy } from "../types.js";
import { Gateway, isNotFoundError } from "./gateway.js";
import { ensureLogger, exception2Result, sanitizeURL } from "../utils.js";
import { carLogIncludesGroup, Loadable } from "./loader.js";
import { CommitQueue } from "./commit-queue.js";

function guardVersion(url: URL): Result<URL> {
  if (!url.searchParams.has("version")) {
    return Result.Err(`missing version: ${url.toString()}`);
  }
  return Result.Ok(url);
}

export interface StoreOpts {
  readonly textEncoder: TextEncoder;
  readonly textDecoder: TextDecoder;
}

const _lazyTextEncoder = new ResolveOnce<TextEncoder>();
const _lazyTextDecoder = new ResolveOnce<TextDecoder>();

function defaultStoreOpts(opts: Partial<StoreOpts>): StoreOpts {
  return {
    ...opts,
    textEncoder: opts.textEncoder || _lazyTextEncoder.once(() => new TextEncoder()),
    textDecoder: opts.textDecoder || _lazyTextDecoder.once(() => new TextDecoder()),
  };
}

abstract class BaseStoreImpl {
  // should be injectable
  readonly textEncoder;
  readonly textDecoder;

  // readonly STORAGE_VERSION: string;
  readonly name: string;
  readonly url: URL;
  readonly logger: Logger;
  readonly gateway: Gateway;
  readonly opts: StoreOpts;
  constructor(name: string, url: URL, logger: Logger, gateway: Gateway, opts: Partial<StoreOpts> = {}) {
    this.name = name;
    this.url = url;
    this.logger = logger;
    this.gateway = gateway;
    this.opts = defaultStoreOpts(opts);
    this.textDecoder = this.opts.textDecoder;
    this.textEncoder = this.opts.textEncoder;
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
  async start(): Promise<Result<void>> {
    this.logger.Debug().Msg("starting-gateway");
    const res = await this.gateway.start(this.url);
    if (res.isErr()) {
      this.logger.Error().Result("gw-start", res).Msg("started-gateway");
      return res;
    }
    sanitizeURL(this.url);
    const version = guardVersion(this.url);
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
        return ready;
      }
    }
    this._onStarted.forEach((fn) => fn());
    this.logger.Debug().Msg("started");
    return version;
  }
}


export class MetaStoreImpl extends BaseStoreImpl implements MetaStore {
  readonly subscribers = new Map<string, LoadHandler[]>();

  constructor(name: string, url: URL, logger: Logger, gateway: Gateway) {
    super(name, url, ensureLogger(logger, "MetaStoreImpl", {
      url: logValue(() => url.toString()),
      name
    }), gateway);
  }

  onLoad(branch: string, loadHandler: LoadHandler): () => void {
    const subscribers = this.subscribers.get(branch) || [];
    subscribers.push(loadHandler);
    this.subscribers.set(branch, subscribers);
    return () => {
      const subscribers = this.subscribers.get(branch) || [];
      const idx = subscribers.indexOf(loadHandler);
      if (idx > -1) subscribers.splice(idx, 1);
    };
  }

  makeHeader({ cars, key }: DbMeta): ToString<DbMeta> {
    const toEncode: DbMeta = { cars };
    if (key) toEncode.key = key;
    return format(toEncode);
  }

  parseHeader(headerData: ToString<DbMeta>): DbMeta {
    const got = parse<DbMeta>(headerData);
    return got;
  }

  async handleSubscribers(dbMetas: DbMeta[], branch: string) {
    try {
      const subscribers = this.subscribers.get(branch) || [];
      await Promise.all(subscribers.map((subscriber) => subscriber(dbMetas)));
    } catch (e) {
      throw this.logger.Error().Err(e).Msg("handleSubscribers").AsError();
    }
  }

  async handleByteHeads(byteHeads: Uint8Array[], branch = "main") {
    let dbMetas: DbMeta[];
    try {
      dbMetas = this.dbMetasForByteHeads(byteHeads);
    } catch (e) {
      throw this.logger.Error().Err(e).Msg("parseHeader").AsError();
    }
    await this.handleSubscribers(dbMetas, branch);
    return dbMetas;
  }
  dbMetasForByteHeads(byteHeads: Uint8Array[]) {
    return byteHeads.map((bytes) => {
      const txt = this.textDecoder.decode(bytes);
      return this.parseHeader(txt);
    });
  }

  async load(branch?: string): Promise<DbMeta[] | Falsy> {
    branch = branch || "main";
    this.logger
      .Debug()
      .Str("branch", branch)
      .Msg("loading");
    const url = await this.gateway.buildUrl(this.url, branch);
    if (url.isErr()) {
      throw this.logger
        .Error()
        .Result("buidUrl", url)
        .Str("branch", branch)
        .Url(this.url)
        .Msg("got error from gateway.buildUrl")
        .AsError();
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
    this.logger.Debug().Str("branch", branch).Any("meta", meta).Msg("saving meta");
    const bytes = this.makeHeader(meta);
    const url = await this.gateway.buildUrl(this.url, branch);
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("branch", branch).Url(this.url).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.put(url.Ok(), this.textEncoder.encode(bytes));
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    await this.handleSubscribers([meta], branch);
    return res;
  }

  async close(): Promise<Result<void>> {
    await this.gateway.close(this.url);
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }
  async destroy(): Promise<Result<void>> {
    return this.gateway.destroy(this.url);
  }
}

export class DataStoreImpl extends BaseStoreImpl implements DataStore {
  // readonly tag: string = "car-base";

  constructor(name: string, url: URL, logger: Logger, gateway: Gateway) {
    super(
      name,
      url,
      ensureLogger(logger, "DataStoreImpl", {
        url: logValue(() => url.toString()),
        name,
      }),
      gateway,
    );
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    this.logger.Debug().Any("cid", cid).Msg("loading");
    const url = await this.gateway.buildUrl(this.url, cid.toString());
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
    const url = await this.gateway.buildUrl(this.url, car.cid.toString());
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
    const url = await this.gateway.buildUrl(this.url, cid.toString());
    if (url.isErr()) {
      return url;
    }
    return this.gateway.delete(url.Ok());
  }
  async close(): Promise<Result<void>> {
    await this.gateway.close(this.url);
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }
  destroy(): Promise<Result<void>> {
    return this.gateway.destroy(this.url);
  }
}

export class WALStoreImpl extends BaseStoreImpl implements WALStore {
  // readonly tag: string = "rwal-base";

  readonly loader: Loadable;

  readonly _ready = new ResolveOnce<void>();

  walState: WALState = { operations: [], noLoaderOps: [], fileOperations: [] };
  readonly processing: Promise<void> | undefined = undefined;
  readonly processQueue: CommitQueue<void> = new CommitQueue<void>();

  constructor(loader: Loadable, url: URL, logger: Logger, gateway: Gateway) {
    super(loader.name, url, ensureLogger(logger, "WALStoreImpl", {
      url: logValue(() => url.toString()),
    }), gateway);
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
      await this._doProcess();
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
          throw this.logger
            .Error()
            .Any(
              "errors",
              errors
            )
            .Msg("error uploading")
            .AsError();

          errors[0].reason;
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
    const filepath = await this.gateway.buildUrl(this.url, "main");
    if (filepath.isErr()) {
      throw this.logger.Error().Err(filepath.Err()).Str("url", this.url.toString()).Msg("error building url").AsError();
    }
    const bytes = await this.gateway.get(filepath.Ok());
    if (bytes.isErr()) {
      if (isNotFoundError(bytes)) {
        return undefined;
      }
      throw this.logger.Error().Err(bytes.Err()).Msg("error get").AsError();
    }
    try {
      return bytes && parse<WALState>(this.textDecoder.decode(bytes.Ok()));
    } catch (e) {
      throw this.logger.Error().Err(e).Msg("error parse").AsError();
    }
  }

  async save(state: WALState) {
    const filepath = await this.gateway.buildUrl(this.url, "main");
    if (filepath.isErr()) {
      throw this.logger.Error().Err(filepath.Err()).Str("url", this.url.toString()).Msg("error building url").AsError();
    }
    let encoded: ToString<WALState>;
    try {
      encoded = format(state);
    } catch (e) {
      throw this.logger.Error().Err(e).Any("state", state).Msg("error format").AsError();
    }
    const res = await this.gateway.put(filepath.Ok(), this.textEncoder.encode(encoded));
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Str("filePath", filepath.Ok().toString()).Msg("error saving").AsError();
    }
  }

  async close() {
    await this.gateway.close(this.url);
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }

  destroy() {
    return this.gateway.destroy(this.url);
  }
}
