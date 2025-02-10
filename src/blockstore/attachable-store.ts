import { Logger, URI, Result, KeyedResolvOnce, BuildURI } from "@adviser/cement";
import { DbMeta, Falsy, Attached, Attachable, GatewayUrls, UnReg } from "../types.js";
import { SerdeGateway } from "./serde-gateway.js";
import { toStoreRuntime } from "./store-factory.js";
import {
  BaseStore,
  CryptoAction,
  DataStore,
  AnyLink,
  AnyBlock,
  DataSaveOpts,
  MetaStore,
  AttachedRemotes,
  Loadable,
} from "./types.js";
import { ensureLogger, toSortedArray } from "../utils.js";

class AttachedStoreBase {
  private remotes: AttachedRemotesImpl;
  private baseGetStores: () => BaseStore[];
  private logger: Logger;
  constructor(remotes: AttachedRemotesImpl, getStores: () => BaseStore[]) {
    this.remotes = remotes;
    this.baseGetStores = getStores;
    this.logger = ensureLogger(remotes.loadable.sthis, "AttachedStoreBase");
  }

  get realGateway(): SerdeGateway {
    throw new Error("Method not implementable");
  }
  // readonly url: URI
  url(): URI {
    throw new Error("Method not implementable");
  }

  readonly _onStarted: (() => void)[] = [];
  onStarted(fn: () => void) {
    this._onStarted.push(fn);
  }
  readonly _onClosed: (() => void)[] = [];
  onClosed(fn: () => void) {
    this._onClosed.push(fn);
  }

  keyedCrypto(): Promise<CryptoAction> {
    throw new Error("Method not implementable");
  }

  close(): Promise<Result<void>> {
    return Promise.all(
      this.baseGetStores().map(async (store) => {
        return store.close();
      }),
    ).then(() => {
      this._onClosed.forEach((fn) => fn());
      return Result.Ok(undefined);
    });
  }
  destroy(): Promise<Result<void>> {
    return Promise.all(
      this.baseGetStores().map(async (store) => {
        return store.destroy();
      }),
    ).then(() => Result.Ok(undefined));
  }

  readonly ready?: () => Promise<void> = undefined;

  start(): Promise<Result<URI>> {
    return Promise.all(
      this.baseGetStores().map(async (store) => {
        return store.start();
      }),
    ).then(() => {
      this._onStarted.forEach((fn) => fn());
      return Result.Ok(this.url());
    });
  }
}

class AttachedDataStore extends AttachedStoreBase implements DataStore {
  readonly storeType = "data";
  // realGateway: SerdeGateway;
  // onStarted(fn: () => void): void {
  //   throw new Error("Method not implemented.");
  // }
  // onClosed(fn: () => void): void {
  //   throw new Error("Method not implemented.");
  // }
  // ready?: (() => Promise<void>) | undefined;
  // start(): Promise<Result<URI>> {
  //   throw new Error("Method not implemented.");
  // }

  private getStores: () => DataStore[];

  constructor(remotes: AttachedRemotesImpl, getStores: () => DataStore[]) {
    super(remotes, getStores);
    this.getStores = getStores;
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    return Promise.race(
      this.getStores().map(async (store) => {
        return store.load(cid);
      }),
    );
  }

  save(car: AnyBlock, opts?: DataSaveOpts): Promise</*AnyLink | */ void> {
    return Promise.all(
      this.getStores().map(async (store) => {
        return store.save(car, opts);
      }),
    ).then((i) => i[0]);
  }

  remove(cid: AnyLink): Promise<Result<void>> {
    return Promise.all(
      this.getStores().map(async (store) => {
        return store.remove(cid);
      }),
    )
      .then((i) => i[0])
      .catch((e) => Result.Err(e as Error));
  }
}

class AttachedMetaStore extends AttachedStoreBase implements MetaStore {
  readonly storeType = "meta";
  getStores: () => MetaStore[];

  constructor(remotes: AttachedRemotesImpl, getStores: () => MetaStore[]) {
    super(remotes, getStores);
    this.getStores = getStores;
  }

  load(branch?: string): Promise<DbMeta[] | Falsy> {
    return Promise.race(
      this.getStores().map(async (store) => {
        return store.load(branch);
      }),
    );
  }

  save(meta: DbMeta, branch?: string): Promise<Result<void>> {
    return Promise.all(
      this.getStores().map(async (store) => {
        return store.save(meta, branch);
      }),
    ).then(() => Result.Ok(undefined));
  }
}

class AttachedImpl implements Attached {
  readonly gatewayUrls: GatewayUrls;
  readonly stores: Attached["stores"];
  private readonly unreg: UnReg;
  constructor(gws: GatewayUrls, stores: Attached["stores"], unreg: UnReg) {
    this.gatewayUrls = gws;
    this.stores = stores;
    this.unreg = unreg;
  }
  async detach(): Promise<void> {
    await this.stores.car.close();
    await this.stores.file.close();
    await this.stores.meta.close();
    this.unreg();
  }
  status(): ReturnType<Attached["status"]> {
    return "attached";
  }
}

export class AttachedRemotesImpl implements AttachedRemotes {
  private readonly remotes = new KeyedResolvOnce<Attached>();

  readonly loadable: Loadable;
  readonly attactedFileStore: DataStore;
  readonly attactedCarStore: DataStore;
  readonly attactedMetaStore: MetaStore;

  constructor(loadable: Loadable) {
    this.loadable = loadable;
    this.attactedFileStore = new AttachedDataStore(this, () =>
      this.remotes
        .values()
        .filter(({ value }) => value.isOk())
        .map(({ value }) => value.Ok().stores.file),
    );
    this.attactedCarStore = new AttachedDataStore(this, () =>
      this.remotes
        .values()
        .filter(({ value }) => value.isOk())
        .map(({ value }) => value.Ok().stores.car),
    );
    this.attactedMetaStore = new AttachedMetaStore(this, () =>
      this.remotes
        .values()
        .filter(({ value }) => value.isOk())
        .map(({ value }) => value.Ok().stores.meta),
    );
  }

  fileStore(): Promise<DataStore> {
    return Promise.resolve(this.attactedFileStore);
  }

  carStore(): Promise<DataStore> {
    return Promise.resolve(this.attactedCarStore);
  }

  metaStore(): Promise<MetaStore> {
    return Promise.resolve(this.attactedMetaStore);
  }

  async detach(): Promise<void> {
    await Promise.all(
      this.remotes.values().map(async ({ value }) => {
        if (value.isOk()) {
          await value.Ok().detach();
        }
      }),
    );
  }

  async attach(attached: Attachable): Promise<Attached> {
    const gwp = await attached.prepare();
    const gws: GatewayUrls = {
      carUrl: BuildURI.from(gwp.carUrl).setParam("name", attached.name).URI(),
      filesUrl: BuildURI.from(gwp.filesUrl).setParam("name", attached.name).URI(),
      metaUrl: BuildURI.from(gwp.metaUrl).setParam("name", attached.name).URI(),
    };
    const key = toSortedArray({
      carUrl: gws.carUrl.toString(),
      filesUrl: gws.filesUrl.toString(),
      metaUrl: gws.metaUrl.toString,
    }).join(",");

    return this.remotes.get(key).once(async () => {
      const rt = toStoreRuntime(this.loadable.sthis);
      return new AttachedImpl(
        gws,
        {
          car: await rt.makeDataStore({ url: gws.carUrl, loader: this.loadable }),
          file: await rt.makeDataStore({ url: gws.filesUrl, loader: this.loadable }),
          meta: await rt.makeMetaStore({ url: gws.metaUrl, loader: this.loadable }),
        },
        () => {
          this.remotes.unget(key);
        },
      );
    });
  }
}
