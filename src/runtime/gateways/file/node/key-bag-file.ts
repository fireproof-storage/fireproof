import { URI } from "@adviser/cement";
import { isNotFoundError, Logger } from "@fireproof/core";
import type { rt, SuperThis, SysFileSystem } from "@fireproof/core";
import { getFileSystem } from "./get-file-system.js";

interface KeyBagCtx {
  readonly dirName: string;
  readonly sysFS: SysFileSystem;
  readonly fName: string;
}

export class KeyBagProviderFile implements rt.kb.KeyBagProvider {
  async _prepare(id: string): Promise<KeyBagCtx> {
    await this.sthis.start();
    let sysFS: SysFileSystem;
    switch (this.url.protocol) {
      case "file:": {
        sysFS = await getFileSystem(this.url);
        break;
      }
      default:
        throw this.logger.Error().Url(this.url).Msg("unsupported protocol").AsError();
    }
    const dirName = this.url.pathname;
    await sysFS.mkdir(dirName, { recursive: true });
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

  async get(id: string): Promise<rt.kb.KeyItem | undefined> {
    const ctx = await this._prepare(id);
    try {
      const p = await ctx.sysFS.readfile(ctx.fName);
      const ki = JSON.parse(this.sthis.txt.decode(p)) as rt.kb.KeyItem;
      return ki;
    } catch (e) {
      if (isNotFoundError(e)) {
        return undefined;
      }
      throw this.logger.Error().Err(e).Str("file", ctx.dirName).Msg("read bag failed").AsError();
    }
  }

  async set(id: string, item: rt.kb.KeyItem): Promise<void> {
    const ctx = await this._prepare(id);
    const p = this.sthis.txt.encode(JSON.stringify(item, null, 2));
    await ctx.sysFS.writefile(ctx.fName, p);
  }
}
