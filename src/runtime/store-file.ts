import type { AnyBlock, AnyLink, DbMeta } from "../storage-engine/index.js";
import { MetaStore, DataStore, RemoteWAL, WALState } from "../storage-engine/index.js";
import type { Loadable } from "../storage-engine/index.js";
import { format, parse, ToString } from "@ipld/dag-json";
import { SysContainer } from "./sys-container.js";
import { Falsy } from "../types.js";
import { TestStore } from "../storage-engine/types.js";

function getPath(url: URL): string {
  return url
    .toString()
    .replace(/^file:\/\//, "")
    .replace(/\?.*$/, "");
}

function getStore(url: URL): string {
  const result = url.searchParams.get("store");
  if (!result) throw new Error(`store not found:${url.toString()}`);
  return result;
}

function getFileName(url: URL, key: string): string {
  switch (getStore(url)) {
    case "data":
      return key + ".car";
    case "meta":
      return key + ".json";
    default:
      throw new Error(`unsupported store type:${url.toString()}`);
  }
}

export class FileRemoteWAL extends RemoteWAL {
  constructor(dir: URL, loader: Loadable) {
    super(loader, dir);
  }

  readonly branches = new Set<string>();

  filePathForBranch(branch: string): string {
    return SysContainer.join(getPath(this.url), "wal", branch + ".json");
  }

  async _load(branch = "main"): Promise<WALState | Falsy> {
    this.branches.add(branch);
    const filepath = this.filePathForBranch(branch);
    const bytes = await SysContainer.readfile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    return bytes && parse<WALState>(bytes.toString());
  }

  async _save(state: WALState, branch = "main"): Promise<void> {
    this.branches.add(branch);
    const encoded: ToString<WALState> = format(state);
    const filepath = this.filePathForBranch(branch);
    await writePathFile(filepath, encoded);
  }
  async _close() {
    // no-op
  }

  async _destroy() {
    for (const branch of this.branches) {
      const filepath = this.filePathForBranch(branch);
      await SysContainer.unlink(filepath).catch((e: Error & { code: string }) => {
        if (e.code === "ENOENT") return;
        throw e;
      });
    }
  }
}

export class FileMetaStore extends MetaStore {
  readonly tag: string = "header-node-fs";
  readonly branches = new Set<string>();

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  filePathForBranch(branch: string): string {
    return SysContainer.join(getPath(this.url), "meta", branch + ".json");
  }

  async load(branch = "main"): Promise<DbMeta[] | Falsy> {
    this.branches.add(branch);
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
    this.branches.add(branch);
    const filepath = this.filePathForBranch(branch);
    const bytes = this.makeHeader(meta);
    await writePathFile(filepath, bytes);
    return undefined;
  }
  async close() {
    // no-op
  }
  async destroy() {
    for (const branch of this.branches) {
      const filepath = this.filePathForBranch(branch);
      await SysContainer.unlink(filepath).catch((e: Error & { code: string }) => {
        if (e.code === "ENOENT") return;
        throw e;
      });
    }
  }
}

export class FileDataStore extends DataStore {
  readonly tag: string = "car-node-fs";

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  private cidPath(cid: AnyLink) {
    return SysContainer.join(getPath(this.url), "data", cid.toString() + ".car");
  }

  async save(car: AnyBlock): Promise<void> {
    await SysContainer.start();
    const filepath = this.cidPath(car.cid);
    // console.log("save->", filepath);
    await writePathFile(filepath, car.bytes);
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    await SysContainer.start();
    const filepath = this.cidPath(cid);
    const bytes = await SysContainer.readfile(filepath);
    return { cid, bytes: new Uint8Array(bytes) };
  }

  async remove(cid: AnyLink): Promise<void> {
    const filepath = this.cidPath(cid);
    // console.log("remove->", filepath);
    await SysContainer.unlink(filepath);
  }
  async close() {
    // no-op
  }
  async destroy() {
    const filepath = SysContainer.dirname(this.cidPath("x" as unknown as AnyLink));
    try {
      const dir = await SysContainer.readdir(filepath);
      for (const file of dir) {
        try {
          await SysContainer.unlink(file);
        } catch (e: unknown) {
          if ((e as { code: string }).code !== "ENOENT") throw e;
        }
      }
    } catch (e: unknown) {
      if ((e as { code: string }).code !== "ENOENT") throw e;
    }
  }
}

async function writePathFile(path: string, data: Uint8Array | string) {
  await SysContainer.mkdir(SysContainer.dirname(path), { recursive: true });
  return await SysContainer.writefile(path, data);
}

function toArrayBuffer(buffer: Buffer) {
  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return view;
}

export class FileTestStore implements TestStore {
  constructor(readonly url: URL) {}

  async get(key: string) {
    const dbFile = SysContainer.join(getPath(this.url), getStore(this.url), getFileName(this.url, key));
    const buffer = await SysContainer.readfile(dbFile);
    return toArrayBuffer(buffer);
  }
}
