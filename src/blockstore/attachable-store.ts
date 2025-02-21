import { KeyedResolvOnce, CoerceURI, isCoerceURI, URI } from "@adviser/cement";
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
  MetaActiveStore,
  WALActiveStore,
  MetaStore,
  WALAttachedStores,
  WALStore,
  MetaAttachedStores,
  FileActiveStore,
  CarActiveStore,
  CarAttachedStores,
  CarStore,
  FileAttachedStores,
  FileStore,
} from "./types.js";
import { ensureURIDefaults, toSortedArray } from "../utils.js";

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

class FileActiveStoreImpl implements FileActiveStore {
  ref: ActiveStore;
  active: FileStore;
  attached: FileAttachedStores;

  constructor(ref: ActiveStore, active: FileStore, attached: FileAttachedStores) {
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
}

class CarActiveStoreImpl implements CarActiveStore {
  ref: ActiveStore;
  active: CarStore;
  attached: CarAttachedStores;

  constructor(ref: ActiveStore, active: CarStore, attached: CarAttachedStores) {
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
}

class CarAttachedStoresImpl implements CarAttachedStores {
  readonly attached: AttachedStores;
  constructor(attached: AttachedStores) {
    this.attached = attached;
  }
  local(): CarStore {
    return this.attached.local().active.car;
  }
  remotes(): CarStore[] {
    return this.attached.remotes().map(({ active }) => active.car);
  }
}

class FileAttachedStoresImpl implements FileAttachedStores {
  readonly attached: AttachedStores;
  constructor(attached: AttachedStores) {
    this.attached = attached;
  }
  local(): FileStore {
    return this.attached.local().active.file;
  }
  remotes(): FileStore[] {
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
    return (
      this.attached
        .remotes()
        .filter(({ active }) => active.wal)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .map(({ active }) => active.wal!)
    );
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
  carStore(): CarActiveStore {
    return new CarActiveStoreImpl(this, this.active.car, new CarAttachedStoresImpl(this.attached));
  }
  fileStore(): FileActiveStore {
    return new FileActiveStoreImpl(this, this.active.file, new FileAttachedStoresImpl(this.attached));
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
        url: ensureURIDefaults(this.loadable.sthis, attached.name, gwp.car.url, URI.from(gwp.car.url), "car"),
      },
      file: {
        ...gwp.file,
        url: ensureURIDefaults(this.loadable.sthis, attached.name, undefined, URI.from(gwp.file.url), "file", { file: true }),
      },
      meta: {
        ...gwp.meta,
        url: ensureURIDefaults(this.loadable.sthis, attached.name, undefined, URI.from(gwp.meta.url), "meta"),
      },
      wal: gwp.wal
        ? {
            ...gwp.wal,
            url: ensureURIDefaults(this.loadable.sthis, attached.name, undefined, URI.from(gwp.wal.url), "wal"),
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
