import pLimit from "p-limit";
import { format, parse, ToString } from "@ipld/dag-json";
import { Logger, ResolveOnce, Result } from "@adviser/cement";

import type { AnyBlock, AnyLink, CommitOpts, DbMeta } from "./types.js";
import { Falsy, throwFalsy } from "../types.js";
import { Gateway, isNotFoundError } from "./gateway.js";
import { ensureLogger, exception2Result } from "../utils.js";
import { carLogIncludesGroup, Loadable } from "./loader.js";
import { CommitQueue } from "./commit-queue.js";

// const match = PACKAGE_VERSION.match(/^([^.]*\.[^.]*)/);
// if (!match) throw new Error("invalid version: " + PACKAGE_VERSION);
// export const STORAGE_VERSION = match[0];

function guardVersion(url: URL): Result<URL> {
  if (!url.searchParams.has("version")) {
    return Result.Err(`missing version: ${url.toString()}`);
  }
  return Result.Ok(url);
}

abstract class VersionedStore {
  // readonly STORAGE_VERSION: string;
  readonly name: string;
  readonly url: URL;
  readonly logger: Logger;
  constructor(name: string, url: URL, logger: Logger) {
    this.name = name;
    this.url = url;
    this.logger = logger;
    // const sv = url.searchParams.get("version");
    // if (!sv) throw this.logger.Error().Str("url", url.toString()).Msg(`version not found`);
    // this.STORAGE_VERSION = sv;
  }

  readonly _onStarted: (() => void)[] = [];
  onStarted(fn: () => void) {
    this._onStarted.push(fn);
  }
  abstract start(): Promise<Result<void>>;

  readonly _onClosed: (() => void)[] = [];
  onClosed(fn: () => void) {
    this._onClosed.push(fn);
  }
  abstract close(): Promise<Result<void>>;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class MetaStore extends VersionedStore {
  readonly tag: string = "header-base";

  readonly gateway: Gateway;

  constructor(name: string, url: URL, logger: Logger, gateway: Gateway) {
    super(name, url, ensureLogger(logger, "MetaStore", {}));
    this.gateway = gateway;
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

  async start(): Promise<Result<void>> {
    this.logger.Debug().Msg("starting");
    const res = await this.gateway.start(this.url);
    if (res.isErr()) {
      return res;
    }
    this._onStarted.forEach((fn) => fn());
    return guardVersion(this.url);
  }

  async load(branch?: string): Promise<DbMeta[] | Falsy> {
    this.logger
      .Debug()
      .Str("branch", branch || "")
      .Msg("loading");
    const url = await this.gateway.buildUrl(this.url, branch || "main");
    if (url.isErr()) {
      throw this.logger
        .Error()
        .Err(url.Err())
        .Str("branch", branch || "")
        .Str("url", this.url.toString())
        .Msg("got error from gateway.buildUrl")
        .AsError();
    }
    const bytes = await this.gateway.get(url.Ok());
    if (bytes.isErr()) {
      if (isNotFoundError(bytes)) {
        return undefined;
      }
      throw this.logger.Error().Err(bytes.Err()).Msg("gateway get").AsError();
    }
    try {
      return [this.parseHeader(textDecoder.decode(bytes.Ok()))];
    } catch (e) {
      throw this.logger.Error().Err(e).Msg("parseHeader").AsError();
    }
  }

  async save(meta: DbMeta, branch = "main") {
    this.logger.Debug().Str("branch", branch).Any("meta", meta).Msg("saving meta");
    const bytes = this.makeHeader(meta);
    const url = await this.gateway.buildUrl(this.url, branch);
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("branch", branch).Url(this.url).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.put(url.Ok(), textEncoder.encode(bytes));
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    return res.Ok();
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

export interface DataSaveOpts {
  readonly public: boolean;
}

export class DataStore extends VersionedStore {
  readonly tag: string = "car-base";
  readonly gateway: Gateway;

  constructor(name: string, url: URL, logger: Logger, gateway: Gateway) {
    super(
      name,
      url,
      ensureLogger(logger, "DataStore", {
        url: () => url.toString(),
      }),
    );
    this.gateway = gateway;
  }

  async start(): Promise<Result<void>> {
    this.logger.Debug().Msg("starting-gateway");
    const res = await this.gateway.start(this.url);
    if (res.isErr()) {
      this.logger.Error().Result("gw-start", res).Msg("started-gateway");
      return res;
    }
    this._onStarted.forEach((fn) => fn());
    const version = guardVersion(this.url);
    if (version.isErr()) {
      this.logger.Error().Result("version", version).Msg("guardVersion");
      await this.close();
      return version;
    }
    this.logger.Debug().Msg("started");
    return version;
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

export interface WALState {
  operations: DbMeta[];
  noLoaderOps: DbMeta[];
  fileOperations: {
    readonly cid: AnyLink;
    readonly public: boolean;
  }[];
}

export class RemoteWAL extends VersionedStore {
  readonly tag: string = "rwal-base";

  readonly loader: Loadable;

  readonly _ready = new ResolveOnce<void>();

  private async ready() {
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
  }

  walState: WALState = { operations: [], noLoaderOps: [], fileOperations: [] };
  readonly processing: Promise<void> | undefined = undefined;
  readonly processQueue: CommitQueue<void> = new CommitQueue<void>();

  readonly gateway: Gateway;

  constructor(loader: Loadable, url: URL, logger: Logger, gateway: Gateway) {
    super(loader.name, url, ensureLogger(logger, "RemoteWAL"));
    this.loader = loader;
    this.gateway = gateway;
  }

  async enqueue(dbMeta: DbMeta, opts: CommitOpts) {
    await this.ready();
    if (opts.noLoader) {
      this.walState.noLoaderOps.push(dbMeta);
    } else {
      this.walState.operations.push(dbMeta);
    }
    await this.save(this.walState);
    void this._process();
  }

  async enqueueFile(fileCid: AnyLink, publicFile = false) {
    await this.ready();
    this.walState.fileOperations.push({ cid: fileCid, public: publicFile });
    // await this.save(this.walState)
  }

  async _process() {
    await this.ready();
    if (!this.loader.remoteCarStore) return;
    await this.processQueue.enqueue(async () => {
      await this._doProcess();
      if (this.walState.operations.length || this.walState.fileOperations.length || this.walState.noLoaderOps.length) {
        setTimeout(() => void this._process(), 0);
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
              errors.map((e) => e.reason),
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

  async start() {
    const res = await this.gateway.start(this.url);
    if (res.isErr()) {
      return res;
    }
    const ver = guardVersion(this.url);
    if (ver.isErr()) {
      await this.close();
      return ver;
    }
    const ready = await exception2Result(() => this.ready());
    this._onStarted.forEach((fn) => fn());
    if (ready.isErr()) {
      await this.close();
      return ready;
    }
    return ready;
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
      return bytes && parse<WALState>(textDecoder.decode(bytes.Ok()));
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
    const res = await this.gateway.put(filepath.Ok(), textEncoder.encode(encoded));
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
