import type { AnyBlock, AnyLink, DbMeta } from "../storage-engine/index.js";
import { MetaStore, DataStore, RemoteWAL, WALState } from "../storage-engine/index.js";
import type { Loadable } from "../storage-engine/index.js";
import { format, parse, ToString } from "@ipld/dag-json";
import { SysContainer } from "./sys-container.js";
import { Falsy } from "../types.js";

export function getPath(url: URL): string {
  return url.toString().replace(/^file:\/\//, "");
}

export class FileRemoteWAL extends RemoteWAL {
  constructor(dir: URL, loader: Loadable) {
    super(loader, dir);
  }

  filePathForBranch(branch: string): string {
    return SysContainer.join(getPath(this.url), "wal", branch + ".json");
  }

  async load(branch = "main"): Promise<WALState | Falsy> {
    await SysContainer.start();
    const filepath = this.filePathForBranch(branch);
    const bytes = await SysContainer.readfile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    return bytes && parse<WALState>(bytes.toString());
  }

  async save(state: WALState, branch = "main"): Promise<void> {
    const encoded: ToString<WALState> = format(state);
    const filepath = this.filePathForBranch(branch);
    await writePathFile(filepath, encoded);
  }
}

export class FileMetaStore extends MetaStore {
  readonly tag: string = "header-node-fs";

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  filePathForBranch(branch: string): string {
    return SysContainer.join(getPath(this.url), "meta", branch + ".json");
  }

  async load(branch = "main"): Promise<DbMeta[] | Falsy> {
    await SysContainer.start();
    const filepath = this.filePathForBranch(branch);
    const bytes = await SysContainer.readfile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === "ENOENT") return undefined;
      throw e;
    });
    // currently FS is last-write-wins, assumes single writer process
    return bytes ? [this.parseHeader(bytes.toString())] : null;
  }

  async save(meta: DbMeta, branch = "main") {
    const filepath = this.filePathForBranch(branch);
    const bytes = this.makeHeader(meta);
    await writePathFile(filepath, bytes);
    return undefined;
  }
}

export class FileDataStore extends DataStore {
  readonly tag: string = "car-node-fs";

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  async save(car: AnyBlock): Promise<void> {
    const filepath = this.cidPath(car.cid);
    // console.log("save->", filepath);
    await writePathFile(filepath, car.bytes);
  }

  private cidPath(cid: AnyLink) {
    return SysContainer.join(getPath(this.url), "data", cid.toString() + ".car");
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    await SysContainer.start();
    const filepath = this.cidPath(cid);
    const bytes = await SysContainer.readfile(filepath);
    return { cid, bytes: new Uint8Array(bytes) };
  }

  async remove(cid: AnyLink): Promise<void> {
    const filepath = this.cidPath(cid);
    await SysContainer.unlink(filepath);
  }
}

async function writePathFile(path: string, data: Uint8Array | string) {
  await SysContainer.mkdir(SysContainer.dirname(path), { recursive: true });
  return await SysContainer.writefile(path, data);
}
