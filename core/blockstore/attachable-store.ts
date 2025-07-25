import { KeyedResolvOnce, CoerceURI, isCoerceURI, URI, AppContext } from "@adviser/cement";
import { toSortedArray } from "@adviser/cement/utils";
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
} from "@fireproof/core-types-blockstore";
import { ensureURIDefaults, hashObject } from "@fireproof/core-runtime";
import {
  Attachable,
  AttachContext,
  Attached,
  DataAndMetaAndWalAndBaseStore,
  GatewayUrls,
  GatewayUrlsParam,
} from "@fireproof/core-types-base";

class AttachedImpl implements Attached {
  readonly keyed: string;
  readonly gatewayUrls: GatewayUrls;
  readonly stores: DataAndMetaAndWalAndBaseStore;
  private readonly attachCtx: AttachContext;
  constructor(keyed: string, gws: GatewayUrls, stores: DataAndMetaAndWalStore, actx: Partial<AttachContext>) {
    this.keyed = keyed;
    this.gatewayUrls = gws;
    this.stores = new DataAndMetaAndWalAndBaseStore(stores);
    this.attachCtx = {
      detach: async () => {
        /* noop */
      },
      ctx: new AppContext(),
      ...actx,
    };
  }
  async detach(): Promise<void> {
    // console.log("detach", this.keyed, this.attachCtx.ctx);
    const toClose = [this.stores.car.close(), this.stores.file.close(), this.stores.meta.close()];
    if (this.stores.wal) {
      toClose.push(this.stores.wal.close());
    }
    await Promise.all(toClose);
    this.attachCtx.detach();
  }
  ctx(): AppContext {
    return this.attachCtx.ctx;
  }
  status(): ReturnType<Attached["status"]> {
    return "attached";
  }
}

class FileActiveStoreImpl extends FileActiveStore {
  readonly ref: ActiveStore;
  readonly active: FileStore;
  protected readonly attached: FileAttachedStores;

  constructor(ref: ActiveStore, active: FileStore, attached: FileAttachedStores) {
    super();
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
  local(): FileStore {
    return this.attached.local();
  }
  remotes(): FileStore[] {
    return this.attached.remotes();
  }
}

class CarActiveStoreImpl extends CarActiveStore {
  readonly ref: ActiveStore;
  readonly active: CarStore;
  protected readonly attached: CarAttachedStores;

  constructor(ref: ActiveStore, active: CarStore, attached: CarAttachedStores) {
    super();
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
  local(): CarStore {
    return this.attached.local();
  }
  remotes(): CarStore[] {
    return [this.active, ...this.attached.remotes().filter((i) => i !== this.active)];
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

class MetaActiveStoreImpl extends MetaActiveStore {
  readonly ref: ActiveStore;
  readonly active: MetaStore;
  protected readonly attached: MetaAttachedStores;

  constructor(ref: ActiveStore, active: MetaStore, attached: MetaAttachedStores) {
    super();
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }
  local(): MetaStore {
    return this.attached.local();
  }
  remotes(): MetaStore[] {
    return [this.active, ...this.attached.remotes().filter((i) => i !== this.active)];
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

class WALActiveStoreImpl extends WALActiveStore {
  readonly ref: ActiveStore;
  readonly active: WALStore;
  protected readonly attached: WALAttachedStores;

  constructor(ref: ActiveStore, active: WALStore, attached: WALAttachedStores) {
    super();
    this.ref = ref;
    this.active = active;
    this.attached = attached;
  }

  local(): WALStore {
    return this.attached.local();
  }
  remotes(): WALStore[] {
    return this.attached.remotes();
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

  local(): LocalActiveStore {
    return this.attached.local();
  }
  remotes(): ActiveStore[] {
    return this.attached.remotes();
    // return  [
    //   this.attached.remotes().filter(i => i !== this.active)
    // ]
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

  // console.log("createAttachedStores", JSON.stringify(gup), name);
  const cfgId = await hashObject(gup);

  return await ar.attach(
    {
      name,
      configHash: async () => cfgId,
      prepare: async () => gup,
    },
    (at) => Promise.resolve(at),
  );
}

export class AttachedRemotesImpl implements AttachedStores {
  private readonly _remotes = new KeyedResolvOnce<Attached>();

  readonly loadable: Loadable;
  // readonly attactedFileStore: DataStore;
  // readonly attactedCarStore: DataStore;
  // readonly attactedMetaStore: MetaStore;

  _local?: Attached;

  readonly id: string;

  constructor(loadable: Loadable) {
    this.loadable = loadable;
    this.id = loadable.sthis.nextId().str;
    // console.log(
    //   "AttachedRemotesImpl",
    //   this.id,
    //   loadable.ebOpts.storeUrls.car.getParam("index", "noidx"),
    //   loadable.blockstoreParent?.crdtParent?.ledgerParent?.name,
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
    // console.log(
    //   "activate",
    //   this.id,
    //   this._local?.gatewayUrls.car.url.toString(),
    //   this._remotes.values().map((i) => i.value.Ok().gatewayUrls.car.url.toString()),
    //   this.loadable.blockstoreParent?.crdtParent?.ledgerParent?.name,
    // );
    // if (isLoadable(store)) {
    if (isCoerceURI(store)) {
      const activateUrl = URI.from(store);
      let maxScore = 0;
      let maxStore: DataAndMetaStore | undefined;
      for (const { value } of this._remotes.values()) {
        if (value.isErr()) {
          continue;
        }
        for (const url of value.Ok().stores.baseStores.map((i) => i.url())) {
          const mr = url.match(activateUrl);
          if (mr.score > maxScore) {
            maxScore = mr.score;
            maxStore = value.Ok().stores;
          }
        }
      }
      if (!maxStore) {
        throw this.loadable.sthis.logger.Error().Url(activateUrl).Msg("no store found").AsError();
      }
      store = maxStore;
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

  // needed for React Statemanagement
  readonly _keyedAttachable = new KeyedResolvOnce<Attached>();
  async attach(attachable: Attachable, onAttach: (at: Attached) => Promise<Attached>): Promise<Attached> {
    const keyed = await attachable.configHash();
    // console.log("attach-enter", keyed, this.loadable.blockstoreParent?.crdtParent?.ledgerParent?.name);
    const ret = await this._keyedAttachable.get(keyed).once(async () => {
      const gwp = await attachable.prepare(this.loadable.blockstoreParent?.crdtParent?.ledgerParent);
      // this._local?.gatewayUrls.car.url.getParam("name");
      const gws: GatewayUrls = {
        car: {
          ...gwp.car,
          url: ensureURIDefaults(
            this.loadable.sthis,
            { name: attachable.name, localURI: this._local?.gatewayUrls.car.url },
            undefined,
            URI.from(gwp.car.url),
            "car",
          ),
        },
        file: {
          ...gwp.file,
          url: ensureURIDefaults(
            this.loadable.sthis,
            { name: attachable.name, localURI: this._local?.gatewayUrls.file.url },
            undefined,
            URI.from(gwp.file.url),
            "file",
            { file: true },
          ),
        },
        meta: {
          ...gwp.meta,
          url: ensureURIDefaults(
            this.loadable.sthis,
            { name: attachable.name, localURI: this._local?.gatewayUrls.meta.url },
            undefined,
            URI.from(gwp.meta.url),
            "meta",
          ),
        },
        wal: gwp.wal
          ? {
              ...gwp.wal,
              url: ensureURIDefaults(
                this.loadable.sthis,
                { name: attachable.name, localURI: this._local?.gatewayUrls.wal?.url },
                undefined,
                URI.from(gwp.wal.url),
                "wal",
              ),
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
      const ret = await this._remotes.get(key).once(async () => {
        const rt = toStoreRuntime(this.loadable.sthis);
        const result = new AttachedImpl(
          keyed,
          gws,
          await rt.makeStores({
            byStore: gws,
            loader: this.loadable,
          }),
          {
            detach: async () => this._remotes.unget(key),
            ctx: gwp.ctx,
          },
        );
        if (result.stores.wal) {
          if (this._local) {
            throw this.loadable.sthis.logger
              .Error()
              .Any({ urls: result.gatewayUrls })
              .Msg("local store could only set once")
              .AsError();
          }
          this._local = result;
        }
        return result;
      });
      const rex = await onAttach?.(ret);
      return rex;
    });
    return ret;
  }
}
