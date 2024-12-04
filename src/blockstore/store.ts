import { format, parse, ToString } from "@fireproof/vendor/@ipld/dag-json";
import { exception2Result, Logger, ResolveOnce, Result, URI } from "@adviser/cement";
import type {
  AnyBlock,
  AnyLink,
  CommitOpts,
  DataSaveOpts,
  DataStore,
  DbMeta,
  WALStore as WALStore,
  WALState,
  KeyedCrypto,
  Loadable,
  MetaStore,
  LoadHandler,
  CarClockHead,
  CarClockLink,
} from "./types.js";
import { Falsy, StoreType, SuperThis, throwFalsy } from "../types.js";
import { Gateway } from "./gateway.js";
import { ensureLogger, isNotFoundError } from "../utils.js";
import { carLogIncludesGroup } from "./loader.js";
import { CommitQueue } from "./commit-queue.js";
import { keyedCryptoFactory } from "../runtime/keyed-crypto.js";
import { KeyBag } from "../runtime/key-bag.js";
import { FragmentGateway } from "./fragment-gateway.js";
import { createDbMetaEventBlock, decodeGatewayMetaBytesToDbMeta, encodeEventsWithParents } from "./meta-key-helper.js";
import pRetry from "p-retry";
import pMap from "p-map";

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

export abstract class BaseStoreImpl {
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

  async ready() {
    return;
  }

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
  // remote: boolean;

  constructor(sthis: SuperThis, name: string, url: URI, opts: StoreOpts) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
    super(name, url, { ...opts }, sthis, ensureLogger(sthis, "MetaStoreImpl"));
    // this.remote = !!remote;
    if (/*this.remote && */ opts.gateway.subscribe) {
      this.onStarted(async () => {
        this.logger.Debug().Str("url", this.url().toString()).Msg("Subscribing to the gateway");
        opts.gateway.subscribe?.(this.url(), async (message: Uint8Array) => {
          this.logger.Debug().Msg("Received message from gateway");
          const dbMetas = await decodeGatewayMetaBytesToDbMeta(this.sthis, message);
          await Promise.all(
            dbMetas.map((dbMeta) => this.loader?.taskManager?.handleEvent(dbMeta.eventCid, dbMeta.parents, dbMeta.dbMeta)),
          );
          this.updateParentsFromDbMetas(dbMetas);
        });
      });
    }
  }

  private updateParentsFromDbMetas(dbMetas: { eventCid: CarClockLink; parents: string[] }[]) {
    const cids = dbMetas.map((m) => m.eventCid);
    const dbMetaParents = dbMetas.flatMap((m) => m.parents);
    const uniqueParentsMap = new Map([...this.parents, ...cids].map((p) => [p.toString(), p]));
    const dbMetaParentsSet = new Set(dbMetaParents.map((p) => p.toString()));
    this.parents = Array.from(uniqueParentsMap.values()).filter((p) => !dbMetaParentsSet.has(p.toString()));
  }

  async handleByteHeads(byteHeads: Uint8Array) {
    return await decodeGatewayMetaBytesToDbMeta(this.sthis, byteHeads);
  }

  async load(): Promise<DbMeta[] | Falsy> {
    const branch = "main";
    const url = await this.gateway.buildUrl(this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Result("buildUrl", url).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
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
    this.updateParentsFromDbMetas(dbMetas);
    return dbMetas.map((m) => m.dbMeta);
  }

  async save(meta: DbMeta, branch?: string): Promise<Result<void>> {
    branch = branch || "main";
    this.logger.Debug().Str("branch", branch).Any("meta", meta).Msg("saving meta");
    const event = await createDbMetaEventBlock(this.sthis, meta, this.parents);
    const bytes = await encodeEventsWithParents(this.sthis, [event], this.parents);
    const url = await this.gateway.buildUrl(this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    this.parents = [event.cid];
    const res = await this.gateway.put(url.Ok(), bytes);
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    // await this.loader?.handleDbMetasFromStore([meta]);
    // this.loader?.taskManager?.eventsWeHandled.add(event.cid.toString());
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
    super(name, url, { ...opts }, sthis, ensureLogger(sthis, "DataStoreImpl"));
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
    super(loader.name, url, { ...opts }, loader.sthis, ensureLogger(loader.sthis, "WALStoreImpl"));
    this.loader = loader;
  }

  async ready(): Promise<void> {
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

  async enqueue(dbMeta: DbMeta, opts: CommitOpts) {
    await this.ready();
    if (opts.compact) {
      this.walState.operations = [];
      this.walState.noLoaderOps = [dbMeta];
    } else if (opts.noLoader) {
      this.walState.noLoaderOps.push(dbMeta);
    } else {
      this.walState.operations.push(dbMeta);
    }
    await this.save(this.walState);
    if (!opts.noLoader) {
      void this.process();
    }
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

    const operations = [...this.walState.operations];
    const noLoaderOps = [...this.walState.noLoaderOps];
    const fileOperations = [...this.walState.fileOperations];

    if (operations.length + noLoaderOps.length + fileOperations.length === 0) return;

    const concurrencyLimit = 3;

    // Helper function to retry uploads
    const retryableUpload = <T>(fn: () => Promise<T>, description: string) =>
      pRetry(fn, {
        retries: 5,
        onFailedAttempt: (error) => {
          this.logger
            .Warn()
            .Msg(`Attempt ${error.attemptNumber} failed for ${description}. There are ${error.retriesLeft} retries left.`);
        },
      });

    try {
      // Process noLoaderOps
      await pMap(
        noLoaderOps,
        async (dbMeta) => {
          await retryableUpload(async () => {
            for (const cid of dbMeta.cars) {
              const car = await (await this.loader.carStore()).load(cid);
              if (!car) {
                if (carLogIncludesGroup(this.loader.carLog, dbMeta.cars)) {
                  throw this.logger.Error().Ref("cid", cid).Msg("missing local car").AsError();
                }
              } else {
                await throwFalsy(this.loader.remoteCarStore).save(car);
              }
            }
            // Remove from walState after successful upload
            this.walState.noLoaderOps = this.walState.noLoaderOps.filter((op) => op !== dbMeta);
          }, `noLoaderOp with dbMeta.cars=${dbMeta.cars.toString()}`);
        },
        { concurrency: concurrencyLimit },
      );

      // Process operations
      await pMap(
        operations,
        async (dbMeta) => {
          await retryableUpload(async () => {
            for (const cid of dbMeta.cars) {
              const car = await (await this.loader.carStore()).load(cid);
              if (!car) {
                if (carLogIncludesGroup(this.loader.carLog, dbMeta.cars)) {
                  throw this.logger.Error().Ref("cid", cid).Msg(`missing local car`).AsError();
                }
              } else {
                await throwFalsy(this.loader.remoteCarStore).save(car);
              }
            }
            // Remove from walState after successful upload
            this.walState.operations = this.walState.operations.filter((op) => op !== dbMeta);
          }, `operation with dbMeta.cars=${dbMeta.cars.toString()}`);
        },
        { concurrency: concurrencyLimit },
      );

      // Process fileOperations
      await pMap(
        fileOperations,
        async ({ cid: fileCid, public: publicFile }) => {
          await retryableUpload(async () => {
            const fileBlock = await (await this.loader.fileStore()).load(fileCid);
            if (!fileBlock) {
              throw this.logger.Error().Ref("cid", fileCid).Msg("missing file block").AsError();
            }
            await this.loader.remoteFileStore?.save(fileBlock, { public: publicFile });
            // Remove from walState after successful upload
            this.walState.fileOperations = this.walState.fileOperations.filter((op) => op.cid !== fileCid);
          }, `fileOperation with cid=${fileCid.toString()}`);
        },
        { concurrency: concurrencyLimit },
      );

      // If all uploads succeeded, send the last dbMeta to remoteMetaStore
      if (operations.length) {
        const lastOp = operations[operations.length - 1];
        await retryableUpload(async () => {
          await this.loader.remoteMetaStore?.save(lastOp);
        }, `remoteMetaStore save with dbMeta.cars=${lastOp.cars.toString()}`);
      }
    } catch (error) {
      // Log the error
      this.logger.Error().Any("error", error).Msg("Processing failed");
      // Do not proceed to send metadata if any uploads failed
      return;
    } finally {
      // Always save the WAL state
      await this.save(this.walState);
    }
  }

  async load(): Promise<WALState | Falsy> {
    this.logger.Debug().Msg("loading");
    const filepath = await this.gateway.buildUrl(this.url(), "main");
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
