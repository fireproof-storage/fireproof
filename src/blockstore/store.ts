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
  LoadHandler,
  CryptoAction,
  Loadable,
  CarClockHead,
  DbMetaBinary,
  CarClockLink,
  DbMetaEvent,
  MetaStore,
} from "./types.js";
import { Falsy, PARAM, StoreType, SuperThis, throwFalsy } from "../types.js";
import { SerdeGateway, SerdeGatewayInterceptor } from "./serde-gateway.js";
import { ensureLogger, inplaceFilter, isNotFoundError } from "../utils.js";
import { carLogIncludesGroup } from "./loader.js";
import { CommitQueue } from "./commit-queue.js";
import { keyedCryptoFactory } from "../runtime/keyed-crypto.js";
import { Car2FPMsg, File2FPMsg, FPEnvelopeCar, FPEnvelopeFile, FPEnvelopeMeta, FPEnvelopeWAL } from "./fp-envelope.js";
import { EventView } from "@fireproof/vendor/@web3-storage/pail/clock/api";
import { EventBlock } from "@fireproof/vendor/@web3-storage/pail/clock";
import { format } from "@ipld/dag-json";
// import { createDbMetaEventBlock } from "./meta-key-helper.js";
import pRetry from "p-retry";
import pMap from "p-map";
import { Link } from "multiformats";
import { InterceptorGateway } from "./interceptor-gateway.js";

function guardVersion(url: URI): Result<URI> {
  if (!url.hasParam("version")) {
    return Result.Err(`missing version: ${url.toString()}`);
  }
  return Result.Ok(url);
}

export interface StoreOpts {
  readonly gateway: SerdeGateway;
  // readonly keybag: KeyBag;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;
  readonly loader: Loadable;
}

export abstract class BaseStoreImpl {
  // should be injectable

  abstract readonly storeType: StoreType;
  // readonly name: string;

  private _url: URI;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly gateway: SerdeGateway;
  readonly realGateway: SerdeGateway;
  // readonly keybag: KeyBag;
  readonly opts: StoreOpts;
  readonly loader: Loadable;
  // readonly loader: Loadable;
  constructor(sthis: SuperThis, url: URI, opts: StoreOpts, logger: Logger) {
    // this.name = name;
    this._url = url;
    this.opts = opts;
    // this.keybag = opts.keybag;
    this.loader = opts.loader;
    this.sthis = sthis;
    const name = this._url.getParam(PARAM.NAME);
    if (!name) {
      throw logger.Error().Url(this._url).Msg("missing name").AsError();
    }
    this.logger = logger
      .With()
      .Str("this", this.sthis.nextId().str)
      .Ref("url", () => this._url.toString())
      // .Str("name", name)
      .Logger();
    this.realGateway = opts.gateway;
    this.gateway = new InterceptorGateway(this.sthis, opts.gateway, opts.gatewayInterceptor);
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

  async keyedCrypto(): Promise<CryptoAction> {
    return keyedCryptoFactory(this._url, await this.loader.keyBag(), this.sthis);
  }

  async start(): Promise<Result<URI>> {
    this.logger.Debug().Str("storeType", this.storeType).Msg("starting-gateway-pre");
    this._url = this._url.build().setParam(PARAM.STORE, this.storeType).URI();
    const res = await this.gateway.start({ loader: this.loader }, this._url);
    if (res.isErr()) {
      this.logger.Error().Result("gw-start", res).Msg("started-gateway");
      return res as Result<URI>;
    }
    this._url = res.Ok();
    // add storekey to url
    const kb = await this.loader.keyBag();
    const skRes = await kb.ensureKeyFromUrl(this._url, () => {
      const idx = this._url.getParam(PARAM.INDEX);
      const storeKeyName = [this.url().getParam(PARAM.NAME)];
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

export async function createDbMetaEvent(sthis: SuperThis, dbMeta: DbMeta, parents: CarClockHead): Promise<DbMetaEvent> {
  const event = await EventBlock.create<DbMetaBinary>(
    {
      dbMeta: sthis.txt.encode(format(dbMeta)),
    },
    parents as unknown as Link<EventView<DbMetaBinary>, number, number, 1>[],
  );
  return {
    eventCid: event.cid as CarClockLink,
    dbMeta,
    parents,
  };
}

export class MetaStoreImpl extends BaseStoreImpl implements MetaStore {
  readonly storeType = "meta";
  readonly subscribers = new Map<string, LoadHandler[]>();
  parents: CarClockHead = [];
  // remote: boolean;

  constructor(sthis: SuperThis, url: URI, opts: StoreOpts) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
    super(sthis, url, { ...opts }, ensureLogger(sthis, "MetaStoreImpl"));
    // this.remote = !!remote;
    if (/*this.remote && */ opts.gateway.subscribe) {
      this.onStarted(async () => {
        this.logger.Debug().Str("url", this.url().toString()).Msg("Subscribing to the gateway");
        opts.gateway.subscribe({ loader: this.loader }, this.url(), async ({ payload: dbMetas }: FPEnvelopeMeta) => {
          this.logger.Debug().Msg("Received message from gateway");
          await Promise.all(
            dbMetas.map((dbMeta) => this.loader.taskManager?.handleEvent(dbMeta.eventCid, dbMeta.parents, dbMeta.dbMeta)),
          );
          this.updateParentsFromDbMetas(dbMetas);
        });
      });
    }
  }

  private updateParentsFromDbMetas(dbMetas: DbMetaEvent[]) {
    const cids = dbMetas.map((m) => m.eventCid);
    const dbMetaParents = dbMetas.flatMap((m) => m.parents);
    const uniqueParentsMap = new Map([...this.parents, ...cids].map((p) => [p.toString(), p]));
    const dbMetaParentsSet = new Set(dbMetaParents.map((p) => p.toString()));
    this.parents = Array.from(uniqueParentsMap.values()).filter((p) => !dbMetaParentsSet.has(p.toString()));
  }

  // async handleByteHeads(byteHeads: Uint8Array) {
  //   // return await decodeGatewayMetaBytesToDbMeta(this.sthis, byteHeads);
  //   const rDbMeta = await fpDeserialize(this.sthis, byteHeads, this.url());
  //   if (rDbMeta.isErr()) {
  //     throw this.logger.Error().Err(rDbMeta).Msg("error deserializing").AsError();
  //   }
  //   return (rDbMeta.Ok() as FPEnvelopeMeta).payload;
  // }

  async load(): Promise<DbMeta[] | Falsy> {
    const branch = "main";
    const url = await this.gateway.buildUrl({ loader: this.loader }, this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Result("buildUrl", url).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    const rfpEnv = await this.gateway.get({ loader: this.loader }, url.Ok());
    if (rfpEnv.isErr()) {
      if (isNotFoundError(rfpEnv)) {
        return undefined;
      }
      throw this.logger.Error().Url(url.Ok()).Err(rfpEnv).Msg("gateway get").AsError();
    }
    const dbMetas = (rfpEnv.Ok() as FPEnvelopeMeta).payload;
    // const dbMetas = await this.handleByteHeads(fpMeta.payload);
    await this.loader.handleDbMetasFromStore(dbMetas.map((m) => m.dbMeta)); // the old one didn't await
    this.updateParentsFromDbMetas(dbMetas);
    return dbMetas.map((m) => m.dbMeta);
  }

  async save(meta: DbMeta, branch?: string): Promise<Result<void>> {
    branch = branch || "main";
    this.logger.Debug().Str("branch", branch).Any("meta", meta).Msg("saving meta");

    // const fpMetas = await encodeEventsWithParents(this.sthis, [event], this.parents);
    const url = await this.gateway.buildUrl({ loader: this.loader }, this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    const dbMetaEvent = await createDbMetaEvent(this.sthis, meta, this.parents);
    const res = await this.gateway.put({ loader: this.loader }, url.Ok(), {
      type: "meta",
      payload: [dbMetaEvent],
    } as FPEnvelopeMeta);
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    // await this.loader.handleDbMetasFromStore([meta]);
    // this.loader.taskManager?.eventsWeHandled.add(event.cid.toString());
    return res;
  }

  async close(): Promise<Result<void>> {
    await this.gateway.close({ loader: this.loader }, this.url());
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }
  async destroy(): Promise<Result<void>> {
    this.logger.Debug().Msg("destroy");
    return this.gateway.destroy({ loader: this.loader }, this.url());
  }
}

export class DataStoreImpl extends BaseStoreImpl implements DataStore {
  readonly storeType = "data";

  constructor(sthis: SuperThis, url: URI, opts: StoreOpts) {
    super(sthis, url, { ...opts }, ensureLogger(sthis, "DataStoreImpl"));
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    this.logger.Debug().Any("cid", cid).Msg("loading");
    const url = await this.gateway.buildUrl({ loader: this.loader }, this.url(), cid.toString());
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("cid", cid.toString()).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.get({ loader: this.loader }, url.Ok());
    if (res.isErr()) {
      throw res.Err();
    }
    const fpenv = res.Ok() as FPEnvelopeFile | FPEnvelopeCar;
    switch (fpenv.type) {
      case "car":
        return { cid, bytes: fpenv.payload };
      case "file":
        return { cid, bytes: fpenv.payload };
      default:
        throw this.logger.Error().Msg("unexpected type").AsError();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async save(car: AnyBlock, opts?: DataSaveOpts): Promise</*AnyLink | */ void> {
    this.logger.Debug().Any("cid", car.cid.toString()).Msg("saving");
    const url = await this.gateway.buildUrl({ loader: this.loader }, this.url(), car.cid.toString());
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Ref("cid", car.cid).Msg("got error from gateway.buildUrl").AsError();
    }
    // without URL changes in super-this branch we
    // can distinguish between car and file
    let fpMsg: Result<FPEnvelopeCar | FPEnvelopeFile>;
    switch (url.Ok().getParam(PARAM.STORE)) {
      case "data":
        if (url.Ok().getParam(PARAM.SUFFIX)) {
          fpMsg = Car2FPMsg(car.bytes);
        } else {
          fpMsg = File2FPMsg(car.bytes);
        }
        break;
      default:
        throw this.logger.Error().Str("store", url.Ok().getParam(PARAM.STORE)).Msg("unexpected store").AsError();
    }
    if (fpMsg.isErr()) {
      throw this.logger.Error().Err(fpMsg).Msg("got error from FPMsg2Car").AsError();
    }
    const res = await this.gateway.put({ loader: this.loader }, url.Ok(), fpMsg.Ok());
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    return res.Ok();
  }
  async remove(cid: AnyLink): Promise<Result<void>> {
    const url = await this.gateway.buildUrl({ loader: this.loader }, this.url(), cid.toString());
    if (url.isErr()) {
      return url;
    }
    return this.gateway.delete({ loader: this.loader }, url.Ok());
  }
  async close(): Promise<Result<void>> {
    await this.gateway.close({ loader: this.loader }, this.url());
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }
  destroy(): Promise<Result<void>> {
    this.logger.Debug().Msg("destroy");
    return this.gateway.destroy({ loader: this.loader }, this.url());
  }
}

export class WALStoreImpl extends BaseStoreImpl implements WALStore {
  readonly storeType = "wal";
  // readonly tag: string = "rwal-base";

  // readonly loader: Loadable;

  readonly _ready = new ResolveOnce<void>();

  readonly walState: WALState = { operations: [], noLoaderOps: [], fileOperations: [] };
  readonly processing: Promise<void> | undefined = undefined;
  readonly processQueue: CommitQueue<void> = new CommitQueue<void>();

  constructor(sthis: SuperThis, url: URI, opts: StoreOpts) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
    super(sthis, url, { ...opts }, ensureLogger(sthis, "WALStoreImpl"));
    // this.loader = loader;
  }

  async ready(): Promise<void> {
    return this._ready.once(async () => {
      const walState = await this.load().catch((e) => {
        this.logger.Error().Err(e).Msg("error loading wal");
        return undefined;
      });
      this.walState.operations.splice(0, this.walState.operations.length);
      this.walState.fileOperations.splice(0, this.walState.fileOperations.length);
      if (walState) {
        this.walState.operations.push(...walState.operations);
        this.walState.fileOperations.push(...walState.fileOperations);
      }
    });
  }

  async enqueue(dbMeta: DbMeta, opts: CommitOpts) {
    await this.ready();
    if (opts.compact) {
      this.walState.operations.splice(0, this.walState.operations.length);
      this.walState.noLoaderOps.splice(0, this.walState.noLoaderOps.length);
      this.walState.noLoaderOps.push(dbMeta);
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
    if (!this.loader) return;
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
            if (!this.loader) {
              return;
            }
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
            inplaceFilter(this.walState.noLoaderOps, (op) => op !== dbMeta);
          }, `noLoaderOp with dbMeta.cars=${dbMeta.cars.toString()}`);
        },
        { concurrency: concurrencyLimit },
      );

      // Process operations
      await pMap(
        operations,
        async (dbMeta) => {
          await retryableUpload(async () => {
            if (!this.loader) {
              return;
            }
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
            inplaceFilter(this.walState.operations, (op) => op !== dbMeta);
          }, `operation with dbMeta.cars=${dbMeta.cars.toString()}`);
        },
        { concurrency: concurrencyLimit },
      );

      // Process fileOperations
      await pMap(
        fileOperations,
        async ({ cid: fileCid, public: publicFile }) => {
          await retryableUpload(async () => {
            if (!this.loader) {
              return;
            }
            const fileBlock = await (await this.loader.fileStore()).load(fileCid);
            if (!fileBlock) {
              throw this.logger.Error().Ref("cid", fileCid).Msg("missing file block").AsError();
            }
            await this.loader.remoteFileStore?.save(fileBlock, { public: publicFile });
            // Remove from walState after successful upload
            inplaceFilter(this.walState.fileOperations, (op) => op.cid !== fileCid);
          }, `fileOperation with cid=${fileCid.toString()}`);
        },
        { concurrency: concurrencyLimit },
      );

      // If all uploads succeeded, send the last dbMeta to remoteMetaStore
      if (operations.length) {
        const lastOp = operations[operations.length - 1];
        await retryableUpload(async () => {
          if (!this.loader) {
            return;
          }
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
    const filepath = await this.gateway.buildUrl({ loader: this.loader }, this.url(), "main");
    if (filepath.isErr()) {
      throw this.logger.Error().Err(filepath.Err()).Url(this.url()).Msg("error building url").AsError();
    }
    const bytes = (await this.gateway.get({ loader: this.loader }, filepath.Ok())) as Result<FPEnvelopeWAL>;
    if (bytes.isErr()) {
      if (isNotFoundError(bytes)) {
        return undefined;
      }
      throw this.logger.Error().Err(bytes.Err()).Msg("error get").AsError();
    }
    if (bytes.Ok().type !== "wal") {
      throw this.logger.Error().Str("type", bytes.Ok().type).Msg("unexpected type").AsError();
    }
    return bytes.Ok().payload;
  }

  async save(state: WALState) {
    const filepath = await this.gateway.buildUrl({ loader: this.loader }, this.url(), "main");
    if (filepath.isErr()) {
      throw this.logger.Error().Err(filepath.Err()).Url(this.url()).Msg("error building url").AsError();
    }
    // let encoded: ToString<WALState>;
    // try {
    //   encoded = format(state);
    // } catch (e) {
    //   throw this.logger.Error().Err(e).Any("state", state).Msg("error format").AsError();
    // }
    const res = await this.gateway.put({ loader: this.loader }, filepath.Ok(), {
      type: "wal",
      payload: state,
    } as FPEnvelopeWAL);
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Str("filePath", filepath.Ok().toString()).Msg("error saving").AsError();
    }
  }

  async close() {
    await this.gateway.close({ loader: this.loader }, this.url());
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }

  destroy() {
    this.logger.Debug().Msg("destroy");
    return this.gateway.destroy({ loader: this.loader }, this.url());
  }
}
