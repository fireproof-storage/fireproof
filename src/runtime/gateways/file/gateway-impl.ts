import { FILESTORE_VERSION } from "./version.js";
import { exception2Result, KeyedResolvOnce, Result, URI } from "@adviser/cement";
import { getFileName, getPath } from "./utils.js";
import { PARAM, SuperThis, SysFileSystem } from "../../../types.js";
import { exceptionWrapper, isNotFoundError, NotFoundError } from "../../../utils.js";
import { Gateway, GetResult } from "../../../blockstore/gateway.js";

const versionFiles = new KeyedResolvOnce<string>();

export class FileGateway implements Gateway {
  // abstract readonly storeType: StoreType;
  readonly fs: SysFileSystem;

  constructor(sthis: SuperThis, fs: SysFileSystem) {
    this.fs = fs;
  }

  async getVersionFromFile(path: string, sthis: SuperThis): Promise<string> {
    return versionFiles.get(path).once(async () => {
      await this.fs.mkdir(path, { recursive: true });
      const vFile = sthis.pathOps.join(path, "version");
      const vFileStat = await this.fs.stat(vFile).catch(() => undefined);
      if (!vFileStat) {
        await this.fs.writefile(sthis.pathOps.join(path, "version"), FILESTORE_VERSION);
        return FILESTORE_VERSION;
      } else if (!vFileStat.isFile()) {
        throw sthis.logger.Error().Str("file", vFile).Msg(`version file is a directory`).AsError();
      }
      const v = await this.fs.readfile(vFile);
      const vStr = sthis.txt.decode(v);
      if (vStr !== FILESTORE_VERSION) {
        sthis.logger.Warn().Str("file", vFile).Str("from", vStr).Str("expected", FILESTORE_VERSION).Msg(`version mismatch`);
      }
      return vStr;
    });
  }

  start(baseURL: URI, sthis: SuperThis): Promise<Result<URI>> {
    return exception2Result(async () => {
      await this.fs.start();
      const url = baseURL.build();
      url.defParam(PARAM.VERSION, FILESTORE_VERSION);
      // url.defParam("store", this.storeType);
      const dbUrl = await this.buildUrl(url.URI(), "dummy");
      const dbdirFile = this.getFilePath(dbUrl.Ok(), sthis);
      await this.fs.mkdir(sthis.pathOps.dirname(dbdirFile), { recursive: true });
      const dbroot = sthis.pathOps.dirname(dbdirFile);
      sthis.logger.Debug().Url(url.URI()).Str("dbroot", dbroot).Msg("start");
      url.setParam(PARAM.VERSION, await this.getVersionFromFile(dbroot, sthis));
      return url.URI();
    });
  }

  async buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Result.Ok(baseUrl.build().setParam(PARAM.KEY, key).URI());
  }

  async close(): Promise<Result<void>> {
    return Result.Ok(undefined);
  }

  getFilePath(url: URI, sthis: SuperThis): string {
    const key = url.getParam(PARAM.KEY);
    if (!key) throw sthis.logger.Error().Url(url).Msg(`key not found`).AsError();
    const urlGen = url.getParam(PARAM.URL_GEN);
    switch (urlGen) {
      case "default":
        return sthis.pathOps.join(getPath(url, sthis), getFileName(url, sthis));
      case "fromEnv":
        return sthis.pathOps.join(getPath(url, sthis), key);
      default:
        break;
    }
    return sthis.pathOps.join(getPath(url, sthis), getFileName(url, sthis));
  }

  async put(url: URI, bytes: Uint8Array, sthis: SuperThis): Promise<Result<void>> {
    return exception2Result(async () => {
      const file = await this.getFilePath(url, sthis);
      sthis.logger.Debug().Str("url", url.toString()).Str("file", file).Msg("put");
      await this.fs.writefile(file, bytes);
    });
  }

  async get(url: URI, sthis: SuperThis): Promise<GetResult> {
    return exceptionWrapper(async () => {
      const file = this.getFilePath(url, sthis);
      try {
        sthis.logger.Debug().Url(url).Str("file", file).Msg("get");
        const res = await this.fs.readfile(file);
        return Result.Ok(res);
      } catch (e: unknown) {
        if (isNotFoundError(e)) {
          return Result.Err(new NotFoundError(`file not found: ${file}`));
        }
        return Result.Err(e as Error);
      }
    });
  }

  async delete(url: URI, sthis: SuperThis): Promise<Result<void>> {
    return exception2Result(async () => {
      await this.fs.unlink(this.getFilePath(url, sthis));
    });
  }

  async destroy(baseURL: URI, sthis: SuperThis): Promise<Result<void>> {
    const url = await this.buildUrl(baseURL, "x");
    if (url.isErr()) return url;
    const filepath = sthis.pathOps.dirname(this.getFilePath(url.Ok(), sthis));
    let files: string[] = [];
    try {
      files = await this.fs.readdir(filepath);
    } catch (e: unknown) {
      if (!isNotFoundError(e)) {
        throw sthis.logger.Error().Err(e).Str("dir", filepath).Msg("destroy:readdir").AsError();
      }
    }
    for (const file of files) {
      const pathed = sthis.pathOps.join(filepath, file);
      try {
        await this.fs.unlink(pathed);
      } catch (e: unknown) {
        if (!isNotFoundError(e)) {
          throw sthis.logger.Error().Err(e).Str("file", pathed).Msg("destroy:unlink").AsError();
        }
      }
    }
    return Result.Ok(undefined);
  }

  async getPlain(iurl: URI, key: string, sthis: SuperThis) {
    const url = iurl.build().setParam(PARAM.KEY, key).URI();
    const dbFile = sthis.pathOps.join(getPath(url, sthis), getFileName(url, sthis));
    sthis.logger.Debug().Url(url).Str("dbFile", dbFile).Msg("get");
    const buffer = await this.fs.readfile(dbFile);
    sthis.logger.Debug().Url(url).Str("dbFile", dbFile).Len(buffer).Msg("got");
    return Result.Ok(buffer);
  }
}
