import { FILESTORE_VERSION } from "./version.js";
import { exception2Result, KeyedResolvOnce, Logger, Result, URI } from "@adviser/cement";
import { getFileName, getPath } from "./utils.js";
import { PARAM, SuperThis, SysFileSystem } from "../../../types.js";
import { ensureLogger, exceptionWrapper, isNotFoundError, NotFoundError } from "../../../utils.js";
import { Gateway, GetResult } from "../../../blockstore/gateway.js";
import { FPEnvelope } from "../../../blockstore/fp-envelope.js";
import { fpDeserialize, fpSerialize } from "../fp-envelope-serialize.js";

const versionFiles = new KeyedResolvOnce<string>();

export class FileGateway implements Gateway {
  // abstract readonly storeType: StoreType;
  readonly logger: Logger;
  readonly sthis: SuperThis;

  readonly fs: SysFileSystem;

  constructor(sthis: SuperThis, fs: SysFileSystem) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "FileGateway", { this: 1 });
    this.fs = fs;
  }

  async getVersionFromFile(path: string, logger: Logger): Promise<string> {
    return versionFiles.get(path).once(async () => {
      await this.fs.mkdir(path, { recursive: true });
      const vFile = this.sthis.pathOps.join(path, "version");
      const vFileStat = await this.fs.stat(vFile).catch(() => undefined);
      if (!vFileStat) {
        await this.fs.writefile(this.sthis.pathOps.join(path, "version"), FILESTORE_VERSION);
        return FILESTORE_VERSION;
      } else if (!vFileStat.isFile()) {
        throw logger.Error().Str("file", vFile).Msg(`version file is a directory`).AsError();
      }
      const v = await this.fs.readfile(vFile);
      const vStr = this.sthis.txt.decode(v);
      if (vStr !== FILESTORE_VERSION) {
        logger.Warn().Str("file", vFile).Str("from", vStr).Str("expected", FILESTORE_VERSION).Msg(`version mismatch`);
      }
      return vStr;
    });
  }

  start(baseURL: URI): Promise<Result<URI>> {
    return exception2Result(async () => {
      await this.fs.start();
      const url = baseURL.build();
      url.defParam(PARAM.VERSION, FILESTORE_VERSION);
      // url.defParam("store", this.storeType);
      const dbUrl = await this.buildUrl(url.URI(), "dummy");
      const dbdirFile = this.getFilePath(dbUrl.Ok());
      await this.fs.mkdir(this.sthis.pathOps.dirname(dbdirFile), { recursive: true });
      const dbroot = this.sthis.pathOps.dirname(dbdirFile);
      this.logger.Debug().Url(url.URI()).Str("dbroot", dbroot).Msg("start");
      url.setParam(PARAM.VERSION, await this.getVersionFromFile(dbroot, this.logger));
      return url.URI();
    });
  }

  async buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Result.Ok(baseUrl.build().setParam(PARAM.KEY, key).URI());
  }

  async close(): Promise<Result<void>> {
    return Result.Ok(undefined);
  }

  getFilePath(url: URI): string {
    const key = url.getParam(PARAM.KEY);
    if (!key) throw this.logger.Error().Url(url).Msg(`key not found`).AsError();
    return this.sthis.pathOps.join(getPath(url, this.sthis), getFileName(url, this.sthis));
  }

  async put<T>(url: URI, env: FPEnvelope<T>): Promise<Result<void>> {
    return exception2Result(async () => {
      const file = await this.getFilePath(url);
      this.logger.Debug().Str("url", url.toString()).Str("file", file).Msg("put");

      await this.fs.writefile(file, (await fpSerialize(this.sthis, env)).Ok());
    });
  }

  async get<S>(url: URI): Promise<GetResult<S>> {
    return exceptionWrapper(async () => {
      const file = this.getFilePath(url);
      try {
        this.logger.Debug().Url(url).Str("file", file).Msg("get");
        const res = await this.fs.readfile(file);
        return fpDeserialize(this.sthis, url, res) as Promise<GetResult<S>>;
      } catch (e: unknown) {
        if (isNotFoundError(e)) {
          return Result.Err(new NotFoundError(`file not found: ${file}`));
        }
        return Result.Err(e as Error);
      }
    });
  }

  async delete(url: URI): Promise<Result<void>> {
    return exception2Result(async () => {
      await this.fs.unlink(this.getFilePath(url));
    });
  }

  async destroy(baseURL: URI): Promise<Result<void>> {
    const url = await this.buildUrl(baseURL, "x");
    if (url.isErr()) return url;
    const filepath = this.sthis.pathOps.dirname(this.getFilePath(url.Ok()));
    let files: string[] = [];
    try {
      files = await this.fs.readdir(filepath);
    } catch (e: unknown) {
      if (!isNotFoundError(e)) {
        throw this.logger.Error().Err(e).Str("dir", filepath).Msg("destroy:readdir").AsError();
      }
    }
    for (const file of files) {
      const pathed = this.sthis.pathOps.join(filepath, file);
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

  async getPlain(iurl: URI, key: string) {
    const url = iurl.build().setParam(PARAM.KEY, key).URI();
    const dbFile = this.sthis.pathOps.join(getPath(url, this.sthis), getFileName(url, this.sthis));
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Msg("get");
    const buffer = await this.fs.readfile(dbFile);
    this.logger.Debug().Url(url).Str("dbFile", dbFile).Len(buffer).Msg("got");
    return Result.Ok(buffer);
  }
}
