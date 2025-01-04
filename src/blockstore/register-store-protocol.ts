import { BuildURI, runtimeFn, URI } from "@adviser/cement";
import { SuperThis } from "../types";
import { Gateway, TestGateway } from "./gateway";
import { FILESTORE_VERSION } from "../runtime/gateways/file/version";
import { MemoryGateway, MemoryTestGateway } from "../runtime/gateways/memory/gateway";

export interface GatewayFactoryItem {
  readonly protocol: string;
  // readonly overrideBaseURL?: string; // if this set it overrides the defaultURL
  // readonly overrideRegistration?: boolean; // if this is set, it will override the registration
  readonly isDefault?: boolean;

  readonly defaultURI: (sthis: SuperThis) => URI;

  readonly gateway: (sthis: SuperThis) => Promise<Gateway>;
  readonly test: (sthis: SuperThis) => Promise<TestGateway>;
  // which switches between file and indexdb
  // readonly data: (logger: Logger) => Promise<Gateway>;
  // readonly meta: (logger: Logger) => Promise<Gateway>;
  // readonly wal: (logger: Logger) => Promise<Gateway>;
  // readonly test: (logger: Logger) => Promise<TestStore>;
}

const storeFactory = new Map<string, GatewayFactoryItem>();

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

export function registerStoreProtocol(item: GatewayFactoryItem): () => void {
  let protocol = item.protocol;
  if (!protocol.endsWith(":")) {
    protocol += ":";
  }
  // if (storeFactory.has(protocol)) {
  //   if (!item.overrideBaseURL && storeFactory.get(protocol) !== item) {
  //     throw new Error(`we need a logger here`);
  //     // const logger = ensureLogger(sthis, "registerStoreProtocol", { protocol });
  //     // logger.Warn().Msg(`protocol ${protocol} already registered`);
  //     return () => {
  //       /* no-op */
  //     };
  //   }
  // }
  // we need to clear the overrideBaseURL if it is set
  if (item.isDefault) {
    Array.from(storeFactory.values()).forEach((items) => {
      (items as { isDefault: boolean }).isDefault = false;
    });
  }
  storeFactory.set(protocol, item);
  return () => {
    storeFactory.delete(protocol);
  };
}

export function getGatewayFactoryItem(protocol: string): GatewayFactoryItem | undefined {
  return storeFactory.get(protocol);
}

export function fileGatewayFactoryItem(): GatewayFactoryItem {
  return {
    protocol: "file:",
    isDefault: true,
    defaultURI: (sthis) => {
      // might not work on windows
      return BuildURI.from("file://")
        .pathname(`${sthis.env.get("HOME")}/.fireproof/${FILESTORE_VERSION.replace(/-.*$/, "")}`)
        .URI();
    },
    gateway: async (sthis) => {
      const { FileGateway } = await import("../runtime/gateways/file/gateway.js");
      return new FileGateway(sthis);
    },
    test: async (sthis) => {
      const { FileTestStore } = await import("../runtime/gateways/file/gateway.js");
      return new FileTestStore(sthis);
    },
  };
}

if (runtimeFn().isBrowser) {
  registerStoreProtocol({
    protocol: "indexdb:",
    isDefault: true,
    defaultURI: () => {
      return BuildURI.from("indexdb://").pathname("fp").URI();
    },
    gateway: async (logger) => {
      const { IndexDBGateway } = await import("../runtime/gateways/indexdb/gateway.js");
      return new IndexDBGateway(logger);
    },
    test: async (logger) => {
      const { IndexDBTestStore } = await import("../runtime/gateways/indexdb/gateway.js");
      return new IndexDBTestStore(logger);
    },
  });
} else {
  registerStoreProtocol(fileGatewayFactoryItem());
}

const memory = new Map<string, Uint8Array>();
registerStoreProtocol({
  protocol: "memory:",
  isDefault: false,
  defaultURI: () => {
    return BuildURI.from("memory://").pathname("ram").URI();
  },
  gateway: async () => {
    return new MemoryGateway(memory);
  },
  test: async () => {
    return new MemoryTestGateway(memory);
  },
});
