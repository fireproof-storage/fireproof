import { URI } from "@adviser/cement";
import { isNotFoundError, Logger } from "../utils.js";
import { KeyBagProvider, KeyItem } from "./key-bag.js";
import { SysContainer, SysFileSystem } from "./sys-container.js";

interface KeyBagCtx {
  readonly dirName: string;
  readonly sysFS: SysFileSystem;
  readonly fName: string;
}

export class KeyBagProviderFile implements KeyBagProvider {
  async _prepare(id: string): Promise<KeyBagCtx> {
    let sysFS: SysFileSystem;
    switch (this.url.protocol) {
      case "file:": {
        const { getFileSystem } = await import("./gateways/file/utils.js");
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
      fName: SysContainer.join(dirName, `${id.replace(/[^a-zA-Z0-9]/g, "_")}.json`),
    };
  }

  constructor(
    private readonly url: URI,
    readonly logger: Logger,
  ) {}

  async get(id: string): Promise<KeyItem | undefined> {
    const ctx = await this._prepare(id);
    try {
      const p = await ctx.sysFS.readfile(ctx.fName);
      return JSON.parse(new TextDecoder().decode(p)) as KeyItem;
    } catch (e) {
      if (isNotFoundError(e)) {
        return undefined;
      }
      throw this.logger.Error().Err(e).Str("file", ctx.dirName).Msg("read bag failed").AsError();
    }
  }

  async set(id: string, item: KeyItem): Promise<void> {
    const ctx = await this._prepare(id);
    const p = new TextEncoder().encode(JSON.stringify(item, null, 2));
    await ctx.sysFS.writefile(ctx.fName, p);
  }
}
