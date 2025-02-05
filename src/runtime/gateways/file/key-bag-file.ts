import { Logger, URI } from "@adviser/cement";
import { SuperThis, SysFileSystem } from "../../../types.js";
import { KeyBagProvider, KeysItem, V1StorageKeyItem } from "../../key-bag.js";
import { isNotFoundError } from "../../../utils.js";
import { sysFileSystemFactory } from "./sys-file-system-factory.js";

interface KeyBagCtx {
  readonly dirName: string;
  readonly sysFS: SysFileSystem;
  readonly fName: string;
}

export class KeyBagProviderFile implements KeyBagProvider {
  async _prepare(id: string): Promise<KeyBagCtx> {
    await this.sthis.start();
    const sysFS = await sysFileSystemFactory(this.url);
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

  async get(id: string): Promise<V1StorageKeyItem | KeysItem | undefined> {
    const ctx = await this._prepare(id);
    try {
      const p = await ctx.sysFS.readfile(ctx.fName);
      const ki = JSON.parse(this.sthis.txt.decode(p));
      return ki;
    } catch (e) {
      if (isNotFoundError(e)) {
        return undefined;
      }
      throw this.logger.Error().Err(e).Str("file", ctx.dirName).Msg("read bag failed").AsError();
    }
  }

  async set(item: KeysItem): Promise<void> {
    const ctx = await this._prepare(item.name);
    const p = this.sthis.txt.encode(JSON.stringify(item, null, 2));
    await ctx.sysFS.writefile(ctx.fName, p);
  }
}
