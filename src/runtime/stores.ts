import { join, dirname } from "node:path";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import type { AnyBlock, AnyLink, DbMeta } from "../storage-engine";
import { MetaStore, DataStore, RemoteWAL, WALState } from "../storage-engine";
import type { Loadable, Loader } from "../storage-engine";
import { format, parse, ToString } from "@ipld/dag-json";
import { dataDir, decodeFile, encodeFile } from "./files";
import { StoreRuntime, StoreOpts } from "../storage-engine/types";

function toURL(path: string | URL): URL {
  if (path instanceof URL) return path;
  return new URL(path, "file:");
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
    makeMetaStore: (loader: Loader) => new FileMetaStore(stores.meta, loader.name),

    makeDataStore: (name: string) => new FileDataStore(stores.data, name),

    makeRemoteWAL: (loader: Loadable) => new FileRemoteWAL(stores.remoteWAL, loader),

    encodeFile,
    decodeFile,
  };
}

class FileRemoteWAL extends RemoteWAL {
  constructor(dir: URL, loader: Loadable) {
    super(loader, dir);
  }

  filePathForBranch(branch: string): string {
    return join(this.url.pathname, this.loader.name, "wal", branch + ".json");
  }

  async load(branch = "main"): Promise<WALState | null> {
    const filepath = this.filePathForBranch(branch);
    const bytes = await readFile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    return bytes ? parse<WALState>(bytes.toString()) : null;
  }

  async save(state: WALState, branch = "main"): Promise<void> {
    const encoded: ToString<WALState> = format(state);
    const filepath = this.filePathForBranch(branch);
    await writePathFile(filepath, encoded);
  }
}

class FileMetaStore extends MetaStore {
  readonly tag: string = "header-node-fs";

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  filePathForBranch(branch: string): string {
    return join(this.url.pathname, this.name, "meta", branch + ".json");
  }

  async load(branch = "main"): Promise<DbMeta[] | null> {
    const filepath = this.filePathForBranch(branch);
    const bytes = await readFile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    // currently FS is last-write-wins, assumes single writer process
    return bytes ? [this.parseHeader(bytes.toString())] : null;
  }

  async save(meta: DbMeta, branch = "main") {
    const filepath = this.filePathForBranch(branch);
    const bytes = this.makeHeader(meta);
    await writePathFile(filepath, bytes);
    return null;
  }
}

class FileDataStore extends DataStore {
  readonly tag: string = "car-node-fs";

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  async save(car: AnyBlock): Promise<void> {
    const filepath = this.cidPath(car.cid);
    await writePathFile(filepath, car.bytes);
  }

  private cidPath(cid: AnyLink) {
    return join(this.url.pathname, this.name, "data", cid.toString() + ".car");
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    const filepath = this.cidPath(cid);
    const bytes = await readFile(filepath);
    return { cid, bytes: new Uint8Array(bytes) };
  }

  async remove(cid: AnyLink): Promise<void> {
    const filepath = this.cidPath(cid);
    await unlink(filepath);
  }
}

async function writePathFile(path: string, data: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true });
  return await writeFile(path, data);
}
