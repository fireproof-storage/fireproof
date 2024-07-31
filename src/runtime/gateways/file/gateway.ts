import { SysContainer, SysFileSystem } from "../../sys-container.js";
import { TestStore } from "../../../blockstore/types.js";
import { StoreType } from "../../../types.js";
import { FILESTORE_VERSION } from "./version.js";
import { KeyedResolvOnce, Logger, Result } from "@adviser/cement";
import { ensureLogger, exception2Result, exceptionWrapper } from "../../../utils.js";
import { Gateway, GetResult, isNotFoundError, NotFoundError } from "../../../blockstore/gateway.js";
import { getFileName, getPath } from "./utils.js";

const versionFiles = new KeyedResolvOnce<void>();

export async function getFileSystem(url: URL): Promise<SysFileSystem> {
  const name = url.searchParams.get("fs");
  switch (name) {
    case "mem": {
      const { MemFileSystem } = await import("./mem-filesystem.js");
      return new MemFileSystem();
    }
    case "sys":
    default:
      return SysContainer;
  }
}

abstract class FileGateway implements Gateway {
  abstract readonly storeType: StoreType;
  readonly logger: Logger;
  _fs?: SysFileSystem;

  get fs(): SysFileSystem {
    if (!this._fs) throw this.logger.Error().Msg("fs not initialized").AsError();
    return this._fs;
  }

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async ensureVersionFile(path: string, logger: Logger): Promise<string> {
    await versionFiles.get(path).once(async () => {
      await this.fs.mkdir(path, { recursive: true });
      const vFile = SysContainer.join(path, "version");
      const vFileStat = await this.fs.stat(vFile).catch(() => undefined);
      if (!vFileStat) {
        await this.fs.writefile(SysContainer.join(path, "version"), FILESTORE_VERSION);
        return;
      } else if (!vFileStat.isFile()) {
        throw logger.Error().Str("file", vFile).Msg(`version file is a directory`).AsError();
      }
      const v = await this.fs.readfile(vFile);
      const vStr = (new TextDecoder()).decode(v);
      if (vStr !== FILESTORE_VERSION) {
        logger.Warn().Str("file", vFile).Str("from", vStr).Str("expected", FILESTORE_VERSION).Msg(`version mismatch`);
      }
    });
    return path;
  }
  start(baseURL: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      this._fs = await getFileSystem(baseURL);
      await this.fs.start();
      baseURL.searchParams.set("version", baseURL.searchParams.get("version") || FILESTORE_VERSION);
      baseURL.searchParams.set("store", baseURL.searchParams.get("store") || this.storeType);
      const url = await this.buildUrl(baseURL, "dummy");
      if (url.isErr()) return url;
      const dbdir = this.getFilePath(url.Ok());
      // remove dummy
      await this.fs.mkdir(SysContainer.dirname(dbdir), { recursive: true });
      const dbroot = SysContainer.dirname(dbdir);
      this.logger.Debug().Str("url", url.Ok().toString()).Str("dbroot", SysContainer.dirname(dbroot)).Msg("start");
      await this.ensureVersionFile(dbroot, this.logger);
    });
  }

  async buildUrl(baseUrl: URL, key: string): Promise<Result<URL>> {
    const url = new URL(baseUrl.toString());
    // url.pathname = SysContainer.join(getPath(baseUrl, this.logger), getFileName(baseUrl, key, this.logger));
    url.searchParams.set("key", key);
    return Result.Ok(url);
  }

  async close(): Promise<Result<void>> {
    return Result.Ok(undefined);
  }
  // abstract buildUrl(baseUrl: URL, key: string): Promise<Result<URL>>;

  getFilePath(url: URL): string {
    const key = url.searchParams.get("key");
    if (!key) throw this.logger.Error().Url(url).Msg(`key not found`).AsError();
    return SysContainer.join(getPath(url, this.logger), getFileName(url, this.logger));
  }

  async put(url: URL, body: Uint8Array): Promise<Result<void>> {
    return exception2Result(async () => {
      const file = await this.getFilePath(url);
      this.logger.Debug().Str("url", url.toString()).Str("file", file).Msg("put");
      await this.fs.writefile(file, body);
    });
  }

  async get(url: URL): Promise<GetResult> {
    return exceptionWrapper(async () => {
      const file = this.getFilePath(url);
      try {
        const res = await this.fs.readfile(file);
        this.logger.Debug().Url(url).Str("file", file).Msg("get");
        return Result.Ok(new Uint8Array(res));
      } catch (e: unknown) {
        // this.logger.Error().Err(e).Str("file", file).Msg("get");
        if (isNotFoundError(e)) {
          return Result.Err(new NotFoundError(`file not found: ${file}`));
        }
        return Result.Err(e as Error);
      }
    });
  }

  async delete(url: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      await this.fs.unlink(this.getFilePath(url));
    });
  }

  async destroy(baseURL: URL): Promise<Result<void>> {
    const url = await this.buildUrl(baseURL, "x");
    if (url.isErr()) return url;
    const filepath = SysContainer.dirname(this.getFilePath(url.Ok()));
    let files: string[] = [];
    try {
      files = await this.fs.readdir(filepath);
    } catch (e: unknown) {
      if (!isNotFoundError(e)) {
        throw this.logger.Error().Err(e).Str("dir", filepath).Msg("destroy:readdir").AsError();
      }
    }
    for (const file of files) {
      const pathed = SysContainer.join(filepath, file);
      try {
        await this.fs.unlink(pathed);
      } catch (e: unknown) {
        if (!isNotFoundError(e)) {
          throw this.logger.Error().Err(e).Str("file", pathed).Msg("destroy:unlink").AsError();
        }
      }
    }
    return Result.Ok(undefined);
  }
}

export class FileWALGateway extends FileGateway {
  readonly storeType = "wal";
  constructor(logger: Logger) {
    super(ensureLogger(logger, "FileWALGateway"));
  }
}

export class FileMetaGateway extends FileGateway {
  readonly storeType = "meta";
  constructor(logger: Logger) {
    super(ensureLogger(logger, "FileMetaGateway"));
  }
}

export class FileDataGateway extends FileGateway {
  readonly storeType = "data";
  readonly branches = new Set<string>();
  constructor(logger: Logger) {
    // console.log("FileDataGateway->", logger);
    super(ensureLogger(logger, "FileDataGateway"));
  }
}

export class FileTestStore implements TestStore {
  readonly logger: Logger;
  constructor(logger: Logger) {
    this.logger = ensureLogger(logger, "FileTestStore");
  }

  async get(iurl: URL, key: string) {
    const url = new URL(iurl.toString());
    url.searchParams.set("key", key);
    const dbFile = SysContainer.join(getPath(url, this.logger), getFileName(url, this.logger));
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Msg("get");
    const buffer = await (await getFileSystem(url)).readfile(dbFile);
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Len(buffer).Msg("got");
    return buffer;
  }
}
