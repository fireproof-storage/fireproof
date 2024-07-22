import { SysContainer } from "./sys-container.js";
import { TestStore } from "../blockstore/types.js";
import { FILESTORE_VERSION } from "./store-file-version.js";
import { Logger, ResolveOnce, Result } from "@adviser/cement";
import { ensureLogger, exception2Result, exceptionWrapper } from "../utils.js";
import { Gateway, GetResult, isNotFoundError, NotFoundError } from "../blockstore/gateway.js";
import { getFileName, getPath } from "./store-file-utils.js";

const versionFiles = new Map<string, ResolveOnce<void>>();
async function ensureVersionFile(path: string, logger: Logger): Promise<string> {
  let once = versionFiles.get(path);
  if (!once) {
    once = new ResolveOnce<void>();
    versionFiles.set(path, once);
  }
  await once.once(async () => {
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

abstract class FileGateway implements Gateway {
  readonly logger: Logger;
  constructor(logger: Logger) {
    this.logger = logger;
  }
  start(baseURL: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      await SysContainer.start();
      baseURL.searchParams.set("version", baseURL.searchParams.get("version") || FILESTORE_VERSION);
      const url = await this.buildUrl(baseURL, "dummy");
      if (url.isErr()) return url;
      const dbdir = this.getFilePath(url.Ok());
      // remove dummy
      await SysContainer.mkdir(SysContainer.dirname(dbdir), { recursive: true });
      const dbroot = SysContainer.dirname(dbdir);
      this.logger.Debug().Str("url", url.Ok().toString()).Str("dbroot", SysContainer.dirname(dbroot)).Msg("start");
      await ensureVersionFile(dbroot, this.logger);
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
      await SysContainer.writefile(file, body);
    });
  }
  async get(url: URL): Promise<GetResult> {
    return exceptionWrapper(async () => {
      const file = this.getFilePath(url);
      try {
        const res = await SysContainer.readfile(file);
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
      await SysContainer.unlink(this.getFilePath(url));
    });
  }

  async destroy(baseURL: URL): Promise<Result<void>> {
    const url = await this.buildUrl(baseURL, "x");
    if (url.isErr()) return url;
    const filepath = SysContainer.dirname(this.getFilePath(url.Ok()));
    let dir: string[] = [];
    try {
      dir = await SysContainer.readdir(filepath);
    } catch (e: unknown) {
      if (!isNotFoundError(e)) {
        throw this.logger.Error().Err(e).Str("dir", filepath).Msg("destroy:readdir").AsError();
      }
    }
    for (const file of dir) {
      const pathed = SysContainer.join(filepath, file);
      try {
        await SysContainer.unlink(pathed);
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
  constructor(logger: Logger) {
    super(ensureLogger(logger, "FileWALGateway"));
  }
}

export class FileMetaGateway extends FileGateway {
  constructor(logger: Logger) {
    super(ensureLogger(logger, "FileMetaGateway"));
  }
}

export class FileDataGateway extends FileGateway {
  readonly branches = new Set<string>();
  constructor(logger: Logger) {
    // console.log("FileDataGateway->", logger);
    super(ensureLogger(logger, "FileDataGateway"));
  }
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
    // readonly url: URL,
    logger: Logger,
  ) {
    this.logger = ensureLogger(logger, "FileTestStore");
  }

  async get(iurl: URL, key: string) {
    const url = new URL(iurl.toString());
    url.searchParams.set("key", key);
    const dbFile = SysContainer.join(getPath(url, this.logger), getFileName(url, this.logger));
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Msg("get");
    const buffer = await SysContainer.readfile(dbFile);
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Len(buffer).Msg("got");
    return toArrayBuffer(buffer);
  }
}
