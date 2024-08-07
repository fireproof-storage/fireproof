import { URI } from "@adviser/cement";
import { isNotFoundError, Logger } from "../utils.js";
import { KeyBagProvider, KeyItem } from "./key-bag.js";
import { SuperThis, SysFileSystem } from "../types.js";

interface KeyBagCtx {
  readonly dirName: string;
  readonly sysFS: SysFileSystem;
  readonly fName: string;
}

export class KeyBagProviderFile implements KeyBagProvider {
  async _prepare(id: string): Promise<KeyBagCtx> {
    await this.sthis.start();
    let sysFS: SysFileSystem;
    switch (this.url.protocol) {
      case "file:": {
        const { getFileSystem } = await import("./gateways/file/utils.js");
        sysFS = await getFileSystem(this.url);
        this.logger.Debug().Str("fs", sysFS.constructor.name).Msg("_prepare-0");
        break;
      }
      default:
        throw this.logger.Error().Url(this.url).Msg("unsupported protocol").AsError();
    }
    const dirName = this.url.pathname;
    this.logger.Debug().Str("pathName", dirName).Str("fs", sysFS.constructor.name).Msg("_prepare-1");
    await sysFS.mkdir(dirName, { recursive: true });
    this.logger.Debug().Str("pathName", dirName).Str("fs", sysFS.constructor.name).Msg("_prepare-2");
    return {
      dirName,
      sysFS,
      fName: this.sthis.pathOps.join(dirName, `${id.replace(/[^a-zA-Z0-9]/g, "_")}.json`),
    };
  }

  private readonly url: URI;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  constructor(url: URI, sthis: SuperThis) {
    this.url = url;
    this.sthis = sthis;
    this.logger = sthis.logger;
  }

  async get(id: string): Promise<KeyItem | undefined> {
    this.logger.Debug().Str("id", id).Msg("get bag-0");
    const ctx = await this._prepare(id);
    this.logger.Debug().Str("id", id).Str("fname", ctx.fName).Msg("get bag-1");
    // console.log("get bag-1", ctx.sysFS);
    try {
      const p = await ctx.sysFS.readfile(ctx.fName);
      const ki = JSON.parse(this.sthis.txt.decode(p)) as KeyItem;
      return ki;
    } catch (e) {
      this.logger.Debug().Str("id", id).Msg("get bag-3");
      if (isNotFoundError(e)) {
        return undefined;
      }
      throw this.logger.Error().Err(e).Str("file", ctx.dirName).Msg("read bag failed").AsError();
    }
  }

  async set(id: string, item: KeyItem): Promise<void> {
    const ctx = await this._prepare(id);
    const p = this.sthis.txt.encode(JSON.stringify(item, null, 2));
    await ctx.sysFS.writefile(ctx.fName, p);
  }
}
