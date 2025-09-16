import { BuildURI, Lazy, ResolveOnce, runtimeFn, URI } from "@adviser/cement";
import { SuperThis, PARAM } from "@fireproof/core-types-base";
import { SerdeGateway, Gateway } from "@fireproof/core-types-blockstore";
import { MemoryGateway } from "@fireproof/core-gateways-memory";
import { FileGateway, FILESTORE_VERSION, sysFileSystemFactory } from "@fireproof/core-gateways-file";
import { DefSerdeGateway, INDEXEDDB_VERSION } from "@fireproof/core-gateways-base";
import { CloudGateway } from "@fireproof/core-gateways-cloud";
import { FPSyncProtocol } from "../types/protocols/sync/index.js";

export interface SerdeGatewayFactoryItem {
  readonly protocol: string;
  readonly isDefault?: boolean;
  defaultURI(sthis: SuperThis): URI;
  serdegateway(sthis: SuperThis): Promise<SerdeGateway>;
  fpsync(sthis: SuperThis, uri: URI): Promise<FPSyncProtocol<unknown>>;
}

class OneSerdeGatewayFactoryItem implements SerdeGatewayFactoryItem {
  readonly once = new ResolveOnce<SerdeGateway>();

  readonly item: SerdeGatewayFactoryItem;

  constructor(sgfi: SerdeGatewayFactoryItem) {
    this.item = sgfi;
  }

  get protocol(): string {
    return this.item.protocol;
  }

  get isDefault(): boolean {
    return this.item.isDefault ?? false;
  }

  set isDefault(value: boolean) {
    // test only
    (this.item as { isDefault: boolean }).isDefault = value;
  }

  defaultURI(sthis: SuperThis): URI {
    return this.item.defaultURI(sthis);
  }

  async serdegateway(sthis: SuperThis): Promise<SerdeGateway> {
    return this.once.once(() => this.item.serdegateway(sthis));
  }

  fpsync = Lazy((sthis: SuperThis, uri: URI) => this.item.fpsync(sthis, uri));
}

const storeFactory = new Map<string, OneSerdeGatewayFactoryItem>();

export function getDefaultURI(sthis: SuperThis, protocol?: string): URI {
  if (protocol) {
    if (!protocol.endsWith(":")) {
      protocol += ":";
    }
    const gfi = storeFactory.get(protocol);
    if (gfi) {
      return gfi.defaultURI(sthis);
    }
  }
  const found = Array.from(storeFactory.values()).find((item) => item.isDefault);
  if (!found) {
    throw sthis.logger.Error().Msg("no default found").AsError();
  }
  return found.defaultURI(sthis);
}

export interface SerdeOrGatewayFactoryItem {
  readonly protocol: string;
  readonly isDefault?: boolean;

  readonly defaultURI: (sthis: SuperThis) => URI;

  readonly serdegateway?: (sthis: SuperThis) => Promise<SerdeGateway>;
  readonly gateway?: (sthis: SuperThis) => Promise<Gateway>;

  readonly fpsync: (sthis: SuperThis, uri: URI) => Promise<FPSyncProtocol<unknown>>;
}

export function registerStoreProtocol(item: SerdeOrGatewayFactoryItem): () => void {
  console.log("registerStoreProtocol", item.protocol);
  let protocol = item.protocol;
  if (!protocol.endsWith(":")) {
    protocol += ":";
  }
  if (!item.serdegateway && !item.gateway) {
    throw new Error(`registerStoreProtocol needs a gateway or serdegateway`);
  }
  let serdegateway: (sthis: SuperThis) => Promise<SerdeGateway>;
  if (item.gateway) {
    serdegateway = async (sthis) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const m = await item.gateway!(sthis);
      // console.log("Gateway Plug in DefSerdeGateway", m);
      return new DefSerdeGateway(m);
    };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    serdegateway = item.serdegateway!;
  }
  if (item.isDefault) {
    Array.from(storeFactory.values()).forEach((items) => {
      (items as { isDefault: boolean }).isDefault = false;
    });
  }
  // console.log("registerStoreProtocol", protocol, item.isDefault);
  storeFactory.set(
    protocol,
    new OneSerdeGatewayFactoryItem({
      ...item,
      serdegateway,
    }),
  );
  return () => {
    storeFactory.delete(protocol);
  };
}

export function getGatewayFactoryItem(protocol: string): SerdeGatewayFactoryItem | undefined {
  return storeFactory.get(protocol);
}

export function defaultGatewayFactoryItem(): SerdeGatewayFactoryItem {
  const found = Array.from(storeFactory.values()).find((item) => item.isDefault);
  if (!found) {
    throw new Error("no default found");
  }
  return found;
}

function defaultURI(sthis: SuperThis) {
  const rt = runtimeFn();
  return (
    BuildURI.from("file://")
      // .pathname(`${sthis.env.get("HOME")}/.fireproof/${FILESTORE_VERSION.replace(/-.*$/, "")}`)
      .pathname(`${sthis.env.get("HOME")}/.fireproof/${FILESTORE_VERSION.replace(/-.*$/, "")}`)
      .setParam(PARAM.VERSION, FILESTORE_VERSION)
      .setParam(PARAM.URL_GEN, "default")
      .setParam(PARAM.RUNTIME, rt.isNodeIsh ? "node" : rt.isDeno ? "deno" : "unknown")
      .URI()
  );
}

if (runtimeFn().isNodeIsh || runtimeFn().isDeno) {
  registerStoreProtocol({
    protocol: "file:",
    isDefault: true,
    defaultURI,
    gateway: async (sthis) => {
      return new FileGateway(sthis, await sysFileSystemFactory(defaultURI(sthis)));
    },
    fpsync: async (_sthis, _uri) => {
      throw new Error("fpsync for file: Not implemented");
      // const { fileFPSync } = await import("@fireproof/core-gateways-file");
      // return fileFPSync(sthis, uri) as Promise<FPSyncProtocol<unknown>>;
    },
  });
}

if (runtimeFn().isBrowser) {
  registerStoreProtocol({
    protocol: "indexeddb:",
    isDefault: true,
    defaultURI: () => {
      return BuildURI.from("indexeddb://")
        .pathname("fp")
        .setParam(PARAM.VERSION, INDEXEDDB_VERSION)
        .setParam(PARAM.RUNTIME, "browser")
        .URI();
    },
    gateway: async () => {
      const { GatewayImpl } = await import("@fireproof/core-gateways-indexeddb");
      return new GatewayImpl();
    },
    fpsync: async (sthis, uri) => {
      const { indexedDBFPSync } = await import("@fireproof/core-gateways-indexeddb");
      return indexedDBFPSync(sthis, uri) as Promise<FPSyncProtocol<unknown>>;
    },
  });
}

const memory = new Map<string, Uint8Array>();
registerStoreProtocol({
  protocol: "memory:",
  isDefault: false,
  defaultURI: () => {
    return BuildURI.from("memory://").pathname("ram").URI();
  },
  gateway: async (sthis) => {
    return new MemoryGateway(sthis, memory);
  },
  fpsync: () => {
    throw new Error("fpsync for memory: Not implemented");
    // memoryFPSync as (sthis: SuperThis, uri: URI) => Promise<FPSyncProtocol<unknown>>,
  }
});

//const onceRegisterFireproofCloudStoreProtocol = new KeyedResolvOnce<() => void>();
// export function registerFireproofCloudStoreProtocol(protocol = "fpcloud:") {
// return onceRegisterFireproofCloudStoreProtocol.get(protocol).once(() => {
URI.protocolHasHostpart("fpcloud");
registerStoreProtocol({
  protocol: "fpcloud",
  defaultURI() {
    return URI.from("fpcloud://fireproof.cloud/");
  },
  serdegateway: async (sthis: SuperThis) => {
    return new CloudGateway(sthis);
  },
  fpsync: async () => {
    throw new Error("fpsync for fpcloud: Not implemented");
  },
});
