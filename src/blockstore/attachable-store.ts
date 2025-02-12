import { KeyedResolvOnce, BuildURI, CoerceURI, isCoerceURI } from "@adviser/cement";
import { Attached, Attachable, GatewayUrls, UnReg, GatewayUrlsParam, DataAndMetaAndWalAndBaseStore } from "../types.js";
import { toStoreRuntime } from "./store-factory.js";
import {
  AttachedStores,
  Loadable,
  DataAndMetaAndWalStore,
  ActiveStore,
  DataAndMetaStore,
  LocalActiveStore,
  LocalDataAndMetaAndWalStore,
  BaseStore,
  DataActiveStore,
  MetaActiveStore,
  WALActiveStore,
  DataAttachedStores,
  DataStore,
  MetaStore,
  WALAttachedStores,
  WALStore,
  MetaAttachedStores,
} from "./types.js";
import { toSortedArray } from "../utils.js";

// class AttachedStoreBase {
//   private remotes: AttachedRemotesImpl;
//   private baseGetStores: () => BaseStore[];
//   private logger: Logger;
//   constructor(remotes: AttachedRemotesImpl, getStores: () => BaseStore[]) {
//     this.remotes = remotes;
//     this.baseGetStores = getStores;
//     this.logger = ensureLogger(remotes.loadable.sthis, "AttachedStoreBase");
//   }

//   get realGateway(): SerdeGateway {
//     throw new Error("Method not implementable");
//   }
//   // readonly url: URI
//   url(): URI {
//     throw new Error("Method not implementable");
//   }

//   readonly _onStarted: (() => void)[] = [];
//   onStarted(fn: () => void) {
//     this._onStarted.push(fn);
//   }
//   readonly _onClosed: (() => void)[] = [];
//   onClosed(fn: () => void) {
//     this._onClosed.push(fn);
//   }

//   keyedCrypto(): Promise<CryptoAction> {
//     throw new Error("Method not implementable");
//   }

//   close(): Promise<Result<void>> {
//     return Promise.all(
//       this.baseGetStores().map(async (store) => {
//         return store.close();
//       }),
//     ).then(() => {
//       this._onClosed.forEach((fn) => fn());
//       return Result.Ok(undefined);
//     });
//   }
//   destroy(): Promise<Result<void>> {
//     return Promise.all(
//       this.baseGetStores().map(async (store) => {
//         return store.destroy();
//       }),
//     ).then(() => Result.Ok(undefined));
//   }

//   readonly ready?: () => Promise<void> = undefined;

//   start(): Promise<Result<URI>> {
//     return Promise.all(
//       this.baseGetStores().map(async (store) => {
//         return store.start(store);
//       }),
//     ).then(() => {
//       this._onStarted.forEach((fn) => fn());
//       return Result.Ok(this.url());
//     });
//   }
// }

// class AttachedDataStore extends AttachedStoreBase implements DataStore {
//   readonly storeType = "data";
//   // realGateway: SerdeGateway;
//   // onStarted(fn: () => void): void {
//   //   throw new Error("Method not implemented.");
//   // }
//   // onClosed(fn: () => void): void {
//   //   throw new Error("Method not implemented.");
//   // }
//   // ready?: (() => Promise<void>) | undefined;
//   // start(): Promise<Result<URI>> {
//   //   throw new Error("Method not implemented.");
//   // }

//   private getStores: () => DataStore[];

//   constructor(remotes: AttachedRemotesImpl, getStores: () => DataStore[]) {
//     super(remotes, getStores);
//     this.getStores = getStores;
//   }

//   async load(cid: AnyLink): Promise<AnyBlock> {
//     return Promise.race(
//       this.getStores().map(async (store) => {
//         return store.load(cid);
//       }),
//     );
//   }

//   save(car: AnyBlock, opts?: DataSaveOpts): Promise</*AnyLink | */ void> {
//     return Promise.all(
//       this.getStores().map(async (store) => {
//         return store.save(car, opts);
//       }),
//     ).then((i) => i[0]);
//   }

//   remove(cid: AnyLink): Promise<Result<void>> {
//     return Promise.all(
//       this.getStores().map(async (store) => {
//         return store.remove(cid);
//       }),
//     )
//       .then((i) => i[0])
//       .catch((e) => Result.Err(e as Error));
//   }
// }

// class AttachedMetaStore extends AttachedStoreBase implements MetaStore {
//   readonly storeType = "meta";
//   getStores: () => MetaStore[];

//   constructor(remotes: AttachedRemotesImpl, getStores: () => MetaStore[]) {
//     super(remotes, getStores);
//     this.getStores = getStores;
//   }

//   load(branch?: string): Promise<DbMeta[] | Falsy> {
//     return Promise.race(
//       this.getStores().map(async (store) => {
//         return store.load(branch);
//       }),
//     );
//   }

//   save(meta: DbMeta, branch?: string): Promise<Result<void>> {
//     return Promise.all(
//       this.getStores().map(async (store) => {
//         return store.save(meta, branch);
//       }),
//     ).then(() => Result.Ok(undefined));
//   }
// }

class AttachedImpl implements Attached {
  readonly gatewayUrls: GatewayUrls;
  readonly stores: DataAndMetaAndWalAndBaseStore;
  private readonly unreg: UnReg;
  constructor(gws: GatewayUrls, stores: DataAndMetaAndWalStore, unreg: UnReg) {
    this.gatewayUrls = gws;
    this.stores = new DataAndMetaAndWalAndBaseStore(stores);
    this.unreg = unreg;
  }
  async detach(): Promise<void> {
    const toClose = [this.stores.car.close(), this.stores.file.close(), this.stores.meta.close()];
    if (this.stores.wal) {
      toClose.push(this.stores.wal.close());
    }
    await Promise.all(toClose);
    this.unreg();
  }
  status(): ReturnType<Attached["status"]> {
    return "attached";
  }
}

class DataActiveStoreImpl implements DataActiveStore {
  ref: ActiveStore;
  active: DataStore;
  attached: DataAttachedStores;

  constructor(ref: ActiveStore, active: DataStore, attached: DataAttachedStores) {
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
}

class CarAttachedStoresImpl implements DataAttachedStores {
  readonly attached: AttachedStores;
  constructor(attached: AttachedStores) {
    this.attached = attached;
  }
  local(): DataStore {
    return this.attached.local().active.car;
  }
  remotes(): DataStore[] {
    return this.attached.remotes().map(({ active }) => active.car);
  }
}

class FileAttachedStoresImpl implements DataAttachedStores {
  readonly attached: AttachedStores;
  constructor(attached: AttachedStores) {
    this.attached = attached;
  }
  local(): DataStore {
    return this.attached.local().active.file;
  }
  remotes(): DataStore[] {
    return this.attached.remotes().map(({ active }) => active.file);
  }
}

class MetaActiveStoreImpl implements MetaActiveStore {
  ref: ActiveStore;
  active: MetaStore;
  attached: MetaAttachedStores;

  constructor(ref: ActiveStore, active: MetaStore, attached: MetaAttachedStores) {
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
}

class MetaAttachedStoresImpl implements MetaAttachedStores {
  readonly attached: AttachedStores;
  constructor(attached: AttachedStores) {
    this.attached = attached;
  }
  local(): MetaStore {
    return this.attached.local().active.meta;
  }
  remotes(): MetaStore[] {
    return this.attached.remotes().map(({ active }) => active.meta);
  }
}

class WALActiveStoreImpl implements WALActiveStore {
  ref: ActiveStore;
  active: WALStore;
  attached: WALAttachedStores;

  constructor(ref: ActiveStore, active: WALStore, attached: WALAttachedStores) {
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
}

class WALAttachedStoresImpl implements WALAttachedStores {
  readonly attached: AttachedStores;
  constructor(attached: AttachedStores) {
    this.attached = attached;
  }
  local(): WALStore {
    return this.attached.local().active.wal;
  }
  remotes(): WALStore[] {
    return this.attached
      .remotes()
      .filter(({ active }) => active.wal)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .map(({ active }) => active.wal!);
  }
}

class ActiveStoreImpl<T extends DataAndMetaAndWalStore> implements ActiveStore {
  readonly active: T;
  readonly attached: AttachedRemotesImpl;

  constructor(active: T, attached: AttachedRemotesImpl) {
    this.active = active;
    this.attached = attached;
  }

  baseStores(): BaseStore[] {
    const bs: BaseStore[] = [this.active.car, this.active.file, this.active.meta];
    if (this.active.wal) {
      bs.push(this.active.wal);
    }
    return bs;
  }
  carStore(): DataActiveStore {
    return new DataActiveStoreImpl(this, this.active.car, new CarAttachedStoresImpl(this.attached));
  }
  fileStore(): DataActiveStore {
    return new DataActiveStoreImpl(this, this.active.file, new FileAttachedStoresImpl(this.attached));
  }
  metaStore(): MetaActiveStore {
    return new MetaActiveStoreImpl(this, this.active.meta, new MetaAttachedStoresImpl(this.attached));
  }
  walStore(): WALActiveStore {
    if (!this.active.wal) {
      throw this.attached.loadable.sthis.logger.Error().Msg("wal store not set").AsError();
    }
    return new WALActiveStoreImpl(this, this.active.wal, new WALAttachedStoresImpl(this.attached));
  }
}

function isLoadable(unknown: AttachedStores | Loadable): unknown is Loadable {
  return !!(unknown as Loadable).sthis && !!(unknown as Loadable).attachedStores;
}

export async function createAttachedStores(
  urlOrGup: CoerceURI | GatewayUrlsParam,
  arOrLoadable: AttachedStores | Loadable,
  name = "local",
): Promise<Attached> {
  let ar: AttachedStores;
  if (!isLoadable(arOrLoadable)) {
    ar = arOrLoadable;
  } else {
    ar = arOrLoadable.attachedStores;
  }
  let gup: GatewayUrlsParam;
  if (!urlOrGup) {
    throw new Error("urlOrGup is required");
  }
  if (isCoerceURI(urlOrGup)) {
    const url = urlOrGup;
    gup = {
      car: { url },
      file: { url },
      meta: { url },
      wal: { url },
    };
  } else {
    gup = urlOrGup;
  }
  return await ar.attach({
    name,
    prepare: async () => gup,
  });
}

export class AttachedRemotesImpl implements AttachedStores {
  private readonly _remotes = new KeyedResolvOnce<Attached>();

  readonly loadable: Loadable;
  // readonly attactedFileStore: DataStore;
  // readonly attactedCarStore: DataStore;
  // readonly attactedMetaStore: MetaStore;

  _local?: Attached;

  constructor(loadable: Loadable) {
    this.loadable = loadable;
    // this.attactedFileStore = new AttachedDataStore(this, () =>
    //   this._remotes
    //     .values()
    //     .filter(({ value }) => value.isOk())
    //     .map(({ value }) => value.Ok().stores.file),
    // );
    // this.attactedCarStore = new AttachedDataStore(this, () =>
    //   this._remotes
    //     .values()
    //     .filter(({ value }) => value.isOk())
    //     .map(({ value }) => value.Ok().stores.car),
    // );
    // this.attactedMetaStore = new AttachedMetaStore(this, () =>
    //   this._remotes
    //     .values()
    //     .filter(({ value }) => value.isOk())
    //     .map(({ value }) => value.Ok().stores.meta),
    // );
  }

  forRemotes(action: (store: ActiveStore) => Promise<unknown>): Promise<void> {
    return Promise.all(this.remotes().map((i) => action(i))).then(() => undefined);
  }

  remotes(): ActiveStore[] {
    return this._remotes
      .values()
      .filter(({ value }) => value.isOk() && !value.Ok().stores.wal)
      .map(({ value }) => value.Ok().stores)
      .map((i) => this.activate(i));
  }

  local(): LocalActiveStore {
    if (!this._local) {
      throw this.loadable.sthis.logger.Error().Msg("local store not set").AsError();
    }
    return new ActiveStoreImpl(this._local.stores as LocalDataAndMetaAndWalStore, this);
  }

  activate(store: DataAndMetaStore | CoerceURI): ActiveStore {
    if (isCoerceURI(store)) {
      throw this.loadable.sthis.logger.Error().Msg("store must be an object").AsError();
    }
    return new ActiveStoreImpl(store as DataAndMetaStore, this);
  }

  async detach(): Promise<void> {
    await Promise.all(
      this._remotes.values().map(async ({ value: rvalue }) => {
        if (rvalue.isOk()) {
          await rvalue.Ok().detach();
        }
      }),
    );
  }

  async attach(attached: Attachable): Promise<Attached> {
    const gwp = await attached.prepare();
    const gws: GatewayUrls = {
      car: {
        ...gwp.car,
        url: BuildURI.from(gwp.car.url).defParam("name", attached.name).URI(),
      },
      file: {
        ...gwp.file,
        url: BuildURI.from(gwp.file.url).defParam("name", attached.name).URI(),
      },
      meta: {
        ...gwp.meta,
        url: BuildURI.from(gwp.meta.url).defParam("name", attached.name).URI(),
      },
      wal: gwp.wal
        ? {
            ...gwp.wal,
            url: BuildURI.from(gwp.wal.url).defParam("name", attached.name).URI(),
          }
        : undefined,
    };
    const key = JSON.stringify(
      toSortedArray({
        carUrl: gws.car.url.toString(),
        filesUrl: gws.file.url.toString(),
        metaUrl: gws.meta.url.toString(),
        walUrl: gws.wal?.url.toString(),
      }),
    );

    return this._remotes.get(key).once(async () => {
      const rt = toStoreRuntime(this.loadable.sthis);
      const result = new AttachedImpl(
        gws,
        await rt.makeStores({
          byStore: gws,
          loader: this.loadable,
        }),
        // {
        //   car: await rt.makeDataStore({ url: gws.carUrl, loader: this.loadable }),
        //   file: await rt.makeDataStore({ url: gws.filesUrl, loader: this.loadable }),
        //   meta: await rt.makeMetaStore({ url: gws.metaUrl, loader: this.loadable }),
        // },
        () => {
          this._remotes.unget(key);
        },
      );
      if (result.stores.wal) {
        if (this._local) {
          throw this.loadable.sthis.logger.Error().Msg("local store could only set once").AsError();
        }
        this._local = result;
      }
      return result;
    });
  }
}
