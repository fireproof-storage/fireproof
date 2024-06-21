import { Loader, Loadable } from "./loader";
import { RemoteWAL } from "./remote-wal";
import { DataStore, MetaStore } from "./store";
import { StoreOpts, StoreRuntime } from "./types";

// import type { FileDataStore, FileMetaStore } from "../runtime/store-file";


function toURL(path: string | URL): URL {
    if (path instanceof URL) return path;
    return new URL(path, "file:");
}

async function dataStoreFactory(url: URL, name: string): Promise<DataStore> {
    switch (url.protocol) {
        case "file:": {
            const { FileDataStore } = await import("../runtime/store-file")
            return new FileDataStore(url, name);
        }
        default:
            throw new Error(`unsupported data store ${url.protocol}`);
    }
}

async function metaStoreFactory(url: URL, loader: Loader): Promise<MetaStore> {
    switch (url.protocol) {
        case "file:": {
            const { FileMetaStore } = await import("../runtime/store-file")
            return new FileMetaStore(url, loader.name);
        }
        default:
            throw new Error(`unsupported meta store ${url.protocol}`);
    }
}

async function remoteWalFactory(url: URL, loader: Loadable): Promise<RemoteWAL> {
    switch (url.protocol) {
        case "file:": {
            const { FileRemoteWAL } = await import("../runtime/store-file")
            return new FileRemoteWAL(url, loader);
        }
        case "sqlite:": {
            // const { WalStoreFactory } = await import("../runtime/store-sql/wal-type")
            // return new WalStoreFactory(url);
            throw new Error(`unsupported remote WAL store ${url.protocol}`);
        }
        default:
            throw new Error(`unsupported remote WAL store ${url.protocol}`);
    }
}

export function toStoreRuntime(opts: StoreOpts = {}): StoreRuntime {
    const stores = {
        meta: toURL(opts.stores?.meta || dataDir()),
        data: toURL(opts.stores?.data || dataDir()),
        indexes: toURL(opts.stores?.indexes || dataDir()),
        remoteWAL: toURL(opts.stores?.remoteWAL || dataDir()),
    };
    return {
        stores,

        makeMetaStore: (loader: Loader) => metaStoreFactory(stores.meta, loader),
        makeDataStore: (name: string) => dataStoreFactory(stores.data, name),
        makeRemoteWAL: (loader: Loadable) => remoteWalFactory(stores.remoteWAL, loader),

        encodeFile,
        decodeFile,
    };
}