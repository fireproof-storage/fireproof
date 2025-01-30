import { BuildURI, runtimeFn, URI } from "@adviser/cement";
import { PARAM, SuperThis } from "../types.js";
import type { SerdeGateway } from "./serde-gateway.js";
import { FILESTORE_VERSION } from "../runtime/gateways/file/version.js";
import { INDEXEDDB_VERSION } from "../runtime/gateways/indexeddb-version.js";
import type { Gateway } from "./gateway.js";

import { FileGateway } from "../runtime/gateways/file/gateway-impl.js";
import { MemoryGateway } from "../runtime/gateways/memory/gateway.js";
import { sysFileSystemFactory } from "../runtime/gateways/file/sys-file-system-factory.js";
import { DefSerdeGateway } from "../runtime/gateways/def-serde-gateway.js";

export interface SerdeGatewayFactoryItem {
  readonly protocol: string;
  // readonly overrideBaseURL?: string; // if this set it overrides the defaultURL
  // readonly overrideRegistration?: boolean; // if this is set, it will override the registration
  readonly isDefault?: boolean;

  defaultURI(sthis: SuperThis): URI;

  serdegateway(sthis: SuperThis): Promise<SerdeGateway>;

  // readonly gateway?: (sthis: SuperThis) => Promise<SerdeGateway>;
  // readonly test: (sthis: SuperThis, gfi: GatewayFactoryItem) => Promise<TestGateway>;
  // which switches between file and indexeddb
  // readonly data: (logger: Logger) => Promise<Gateway>;
  // readonly meta: (logger: Logger) => Promise<Gateway>;
  // readonly wal: (logger: Logger) => Promise<Gateway>;
  // readonly test: (logger: Logger) => Promise<TestStore>;
}

const storeFactory = new Map<string, SerdeGatewayFactoryItem>();

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
}

export function registerStoreProtocol(item: SerdeOrGatewayFactoryItem): () => void {
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
  storeFactory.set(protocol, {
    ...item,
    serdegateway,
  });
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
      const { GatewayImpl } = await import("@fireproof/core/indexeddb");
      return new GatewayImpl();
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
});
