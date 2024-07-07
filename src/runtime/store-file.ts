import type { AnyBlock, AnyLink, DbMeta } from "../blockstore/index.js";
import { MetaStore, DataStore, RemoteWAL, WALState } from "../blockstore/index.js";
import type { Loadable } from "../blockstore/index.js";
import { format, parse, ToString } from "@ipld/dag-json";
import { SysContainer } from "./sys-container.js";
import { Falsy } from "../types.js";
import { TestStore } from "../blockstore/types.js";
import { FILESTORE_VERSION } from "./store-file-version.js";
import { Logger, ResolveOnce } from "@adviser/cement";
import { ensureLogger } from "../utils.js";

function ensureVersion(url: URL): URL {
  const ret = new URL(url.toString());
  ret.searchParams.set("version", url.searchParams.get("version") || FILESTORE_VERSION);
  return ret;
}

const versionFiles = new Map<string, ResolveOnce<void>>();
async function ensureVersionFile(path: string, logger: Logger): Promise<string> {
  let once = versionFiles.get(path);
  if (!once) {
    once = new ResolveOnce<void>();
    versionFiles.set(path, once);
  }
  once.once(async () => {
    await SysContainer.mkdir(path, { recursive: true });
    const vFile = SysContainer.join(path, "version");
    const vFileStat = await SysContainer.stat(vFile).catch(() => undefined);
    if (!vFileStat) {
      await SysContainer.writefile(SysContainer.join(path, "version"), FILESTORE_VERSION);
      return;
    } else if (!vFileStat.isFile()) {
      throw logger.Error().Str("file", vFile).Msg(`version file is a directory`).AsError();
    }
    const v = await SysContainer.readfile(vFile);
    if (v.toString() !== FILESTORE_VERSION) {
      console.warn(`version mismatch:${vFile}: ${v.toString()}!=${FILESTORE_VERSION}`);
    }
  });
  return path;
}

async function getPath(url: URL, logger: Logger): Promise<string> {
  const basePath = url
    .toString()
    .replace(/^file:\/\//, "")
    .replace(/\?.*$/, "");
  const name = url.searchParams.get("name");
  if (!name) throw logger.Error().Str("url", url.toString()).Msg(`name not found`).AsError();
  const version = url.searchParams.get("version");
  if (!version) throw logger.Error().Str("url", url.toString()).Msg(`version not found`).AsError();
  // const index = url.searchParams.has("index");
  // if (index) name += index;
  return ensureVersionFile(SysContainer.join(basePath, version, name), logger);
}

function getStore(url: URL, logger: Logger): string {
  const result = url.searchParams.get("store");
  if (!result) throw logger.Error().Str("url", url.toString()).Msg(`store not found`).AsError();
  return result;
}

function getFileName(url: URL, key: string, logger: Logger): string {
  switch (getStore(url, logger)) {
    case "data":
      return key + ".car";
    case "meta":
      return key + ".json";
    default:
      throw logger.Error().Str("url", url.toString()).Msg(`unsupported store type`).AsError();
  }
}

function ensureIndexName(url: URL, name: string): string {
  if (url.searchParams.has("index")) {
    name = (url.searchParams.get("index")?.replace(/[^a-zA-Z0-9]/g, "") || "idx") + "-" + name;
  }
  return name;
}

export class FileRemoteWAL extends RemoteWAL {
  constructor(url: URL, loader: Loadable) {
    super(loader, ensureVersion(url));
  }

  readonly branches = new Set<string>();

  async filePathForBranch(branch: string): Promise<string> {
    return SysContainer.join(await getPath(this.url, this.logger), ensureIndexName(this.url, "wal"), branch + ".json");
  }

  async _load(branch = "main"): Promise<WALState | Falsy> {
    this.branches.add(branch);
    const filepath = await this.filePathForBranch(branch);
    const bytes = await SysContainer.readfile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === "ENOENT") return null;
      throw this.logger.Error().Str("filepath", filepath).Err(e).Msg("load").AsError();
    });
    return bytes && parse<WALState>(bytes.toString());
  }

  async _save(state: WALState, branch = "main"): Promise<void> {
    this.branches.add(branch);
    const encoded: ToString<WALState> = format(state);
    const filepath = await this.filePathForBranch(branch);
    await writePathFile(filepath, encoded);
  }
  async _close() {
    // no-op
  }

  async _destroy() {
    for (const branch of this.branches) {
      const filepath = await this.filePathForBranch(branch);
      await SysContainer.unlink(filepath).catch((e: Error & { code: string }) => {
        if (e.code === "ENOENT") return;
        throw this.logger.Error().Str("filepath", filepath).Err(e).Msg("destroy").AsError();
      });
    }
  }
}

export class FileMetaStore extends MetaStore {
  readonly tag: string = "header-node-fs";
  readonly branches = new Set<string>();

  constructor(url: URL, name: string, logger: Logger) {
    super(name, ensureVersion(url), ensureLogger(logger, "FileMetaStore", { name, url }));
  }

  async filePathForBranch(branch: string): Promise<string> {
    return SysContainer.join(await getPath(this.url, this.logger), ensureIndexName(this.url, "meta"), branch + ".json");
  }

  async load(branch = "main"): Promise<DbMeta[] | Falsy> {
    this.branches.add(branch);
    await SysContainer.start();
    const filepath = await this.filePathForBranch(branch);
    const bytes = await SysContainer.readfile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === "ENOENT") return undefined;
      throw this.logger.Error().Str("filepath", filepath).Err(e).Msg("load").AsError();
    });
    // currently FS is last-write-wins, assumes single writer process
    return bytes ? [this.parseHeader(bytes.toString())] : null;
  }

  async save(meta: DbMeta, branch = "main") {
    this.branches.add(branch);
    const filepath = await this.filePathForBranch(branch);
    const bytes = this.makeHeader(meta);
    await writePathFile(filepath, bytes);
    return undefined;
  }
  async close() {
    // no-op
  }
  async destroy() {
    for (const branch of this.branches) {
      const filepath = await this.filePathForBranch(branch);
      await SysContainer.unlink(filepath).catch((e: Error & { code: string }) => {
        if (e.code === "ENOENT") return;
        throw this.logger.Error().Str("filepath", filepath).Err(e).Msg("destroy").AsError();
      });
    }
  }
}

export class FileDataStore extends DataStore {
  readonly tag: string = "car-node-fs";

  readonly logger: Logger;
  constructor(url: URL, name: string, logger: Logger) {
    super(name, ensureVersion(url));
    this.logger = ensureLogger(logger, "FileDataStore", { name, url });
  }

  private async cidPath(cid: AnyLink): Promise<string> {
    return SysContainer.join(await getPath(this.url, this.logger), ensureIndexName(this.url, "data"), cid.toString() + ".car");
  }

  async save(car: AnyBlock): Promise<void> {
    await SysContainer.start();
    const filepath = await this.cidPath(car.cid);
    // console.log("save->", filepath);
    await writePathFile(filepath, car.bytes);
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    await SysContainer.start();
    const filepath = await this.cidPath(cid);
    const bytes = await SysContainer.readfile(filepath);
    return { cid, bytes: new Uint8Array(bytes) };
  }

  async remove(cid: AnyLink): Promise<void> {
    const filepath = await this.cidPath(cid);
    // console.log("remove->", filepath);
    await SysContainer.unlink(filepath);
  }
  async close() {
    // no-op
  }
  async destroy() {
    const filepath = SysContainer.dirname(await this.cidPath("x" as unknown as AnyLink));
    try {
      const dir = await SysContainer.readdir(filepath);
      for (const file of dir) {
        try {
          await SysContainer.unlink(file);
        } catch (e: unknown) {
          if ((e as { code: string }).code !== "ENOENT") {
            throw this.logger.Error().Str("file", file).Msg("destroy");
          }
        }
      }
    } catch (e: unknown) {
      if ((e as { code: string }).code !== "ENOENT") {
        throw this.logger.Error().Str("dir", filepath).Msg("destroy");
      }
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
  readonly logger: Logger;
  constructor(
    readonly url: URL,
    logger: Logger,
  ) {
    this.logger = ensureLogger(logger, "FileTestStore", { url });
  }

  async get(key: string) {
    const dbFile = SysContainer.join(
      await getPath(this.url, this.logger),
      getStore(this.url, this.logger),
      getFileName(this.url, key, this.logger),
    );
    const buffer = await SysContainer.readfile(dbFile);
    return toArrayBuffer(buffer);
  }
}
