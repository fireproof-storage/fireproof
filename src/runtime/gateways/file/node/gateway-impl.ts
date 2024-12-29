import { FILESTORE_VERSION } from "../version.js";
import { exception2Result, KeyedResolvOnce, Logger, Result, URI } from "@adviser/cement";
import { ensureLogger, exceptionWrapper, isNotFoundError, NotFoundError, bs } from "@fireproof/core";
import { getFileName, getPath } from "./utils.js";
import type { SuperThis, SysFileSystem } from "@fireproof/core";
import { getFileSystem } from "./get-file-system.js";

const versionFiles = new KeyedResolvOnce<string>();

export class FileGateway implements bs.Gateway {
  // abstract readonly storeType: StoreType;
  readonly logger: Logger;
  readonly sthis: SuperThis;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = sthis.logger;
  }

  async getVersionFromFile(fs: SysFileSystem, path: string, logger: Logger): Promise<string> {
    return versionFiles.get(path).once(async () => {
      await fs.mkdir(path, { recursive: true });
      const vFile = this.sthis.pathOps.join(path, "version");
      const vFileStat = await fs.stat(vFile).catch(() => undefined);
      if (!vFileStat) {
        await fs.writefile(this.sthis.pathOps.join(path, "version"), FILESTORE_VERSION);
        return FILESTORE_VERSION;
      } else if (!vFileStat.isFile()) {
        throw logger.Error().Str("file", vFile).Msg(`version file is a directory`).AsError();
      }
      const v = await fs.readfile(vFile);
      const vStr = this.sthis.txt.decode(v);
      if (vStr !== FILESTORE_VERSION) {
        logger.Warn().Str("file", vFile).Str("from", vStr).Str("expected", FILESTORE_VERSION).Msg(`version mismatch`);
      }
      return vStr;
    });
  }

  start(baseURL: URI): Promise<Result<URI>> {
    return exception2Result(async () => {
      const fs = await getFileSystem(baseURL);
      const url = baseURL.build();
      url.defParam("version", FILESTORE_VERSION);
      // url.defParam("store", this.storeType);
      const dbUrl = await this.buildUrl(url.URI(), "dummy");
      const dbdirFile = this.getFilePath(dbUrl.Ok());
      await fs.mkdir(this.sthis.pathOps.dirname(dbdirFile), { recursive: true });
      const dbroot = this.sthis.pathOps.dirname(dbdirFile);
      this.logger.Debug().Url(url.URI()).Str("dbroot", dbroot).Msg("start");
      url.setParam("version", await this.getVersionFromFile(fs, dbroot, this.logger));
      return url.URI();
    });
  }

  async buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Result.Ok(baseUrl.build().setParam("key", key).URI());
  }

  async close(): Promise<Result<void>> {
    return Result.Ok(undefined);
  }
  // abstract buildUrl(baseUrl: URL, key: string): Promise<Result<URL>>;

  getFilePath(url: URI): string {
    const key = url.getParam("key");
    if (!key) throw this.logger.Error().Url(url).Msg(`key not found`).AsError();
    return this.sthis.pathOps.join(getPath(url, this.sthis), getFileName(url, this.sthis));
  }

  async put(url: URI, body: Uint8Array): Promise<Result<void>> {
    return exception2Result(async () => {
      const file = await this.getFilePath(url);
      this.logger.Debug().Str("url", url.toString()).Str("file", file).Msg("put");
      await getFileSystem(url).then((fs) => fs.writefile(file, body));
    });
  }

  async get(url: URI): Promise<bs.GetResult> {
    return exceptionWrapper(async () => {
      const file = this.getFilePath(url);
      try {
        const res = await getFileSystem(url).then((fs) => fs.readfile(file));
        this.logger.Debug().Url(url.asURL()).Str("file", file).Msg("get");
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

  async delete(url: URI): Promise<Result<void>> {
    return exception2Result(async () => {
      await getFileSystem(url).then((fs) => fs.unlink(this.getFilePath(url)));
    });
  }

  async destroy(baseURL: URI): Promise<Result<void>> {
    const url = await this.buildUrl(baseURL, "x");
    if (url.isErr()) return url;
    const filepath = this.sthis.pathOps.dirname(this.getFilePath(url.Ok()));
    const fs = await getFileSystem(baseURL);
    let files: string[] = [];
    try {
      files = await fs.readdir(filepath);
    } catch (e: unknown) {
      if (!isNotFoundError(e)) {
        throw this.logger.Error().Err(e).Str("dir", filepath).Msg("destroy:readdir").AsError();
      }
    }
    for (const file of files) {
      const pathed = this.sthis.pathOps.join(filepath, file);
      try {
        await fs.unlink(pathed);
      } catch (e: unknown) {
        if (!isNotFoundError(e)) {
          throw this.logger.Error().Err(e).Str("file", pathed).Msg("destroy:unlink").AsError();
        }
      }
    }
    return Result.Ok(undefined);
  }
}

export class FileTestGateway implements bs.TestGateway {
  readonly logger: Logger;
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis) {
    this.logger = ensureLogger(sthis, "FileTestStore");
    this.sthis = sthis;
  }

  async get(iurl: URI, key: string) {
    const url = iurl.build().setParam("key", key).URI();
    const dbFile = this.sthis.pathOps.join(getPath(url, this.sthis), getFileName(url, this.sthis));
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Msg("get");
    const buffer = await (await getFileSystem(url)).readfile(dbFile);
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Len(buffer).Msg("got");
    return buffer;
  }
}
