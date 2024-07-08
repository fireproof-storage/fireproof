import type { AnyBlock, AnyLink, DbMeta } from "./types.js";
import { format, parse, ToString } from "@ipld/dag-json";

import { Falsy } from "../types.js";
import { Logger } from "@adviser/cement";

// const match = PACKAGE_VERSION.match(/^([^.]*\.[^.]*)/);
// if (!match) throw new Error("invalid version: " + PACKAGE_VERSION);
// export const STORAGE_VERSION = match[0];

abstract class VersionedStore {
  readonly STORAGE_VERSION: string;
  readonly name: string;
  readonly url: URL;
  readonly logger: Logger;
  constructor(name: string, url: URL, logger: Logger) {
    this.name = name;
    this.url = url;
    this.logger = logger;
    const sv = url.searchParams.get("version");
    if (!sv) throw this.logger.Error().Str("url", url.toString()).Msg(`version not found`);
    this.STORAGE_VERSION = sv;
  }

  abstract start(): Promise<void>;
}

export abstract class MetaStore extends VersionedStore {
  readonly tag: string = "header-base";

  makeHeader({ cars, key }: DbMeta): ToString<DbMeta> {
    const toEncode: DbMeta = { cars };
    if (key) toEncode.key = key;
    return format(toEncode);
  }

  parseHeader(headerData: ToString<DbMeta>): DbMeta {
    const got = parse<DbMeta>(headerData);
    return got;
  }

  abstract load(branch?: string): Promise<DbMeta[] | Falsy>;
  abstract save(dbMeta: DbMeta, branch?: string): Promise<DbMeta[] | Falsy>;
  abstract close(): Promise<void>;
  abstract destroy(): Promise<void>;
}

export interface DataSaveOpts {
  readonly public: boolean;
}

export abstract class DataStore extends VersionedStore {
  readonly tag: string = "car-base";

  // readonly STORAGE_VERSION: string = STORAGE_VERSION;
  // readonly name: string;
  // readonly url: URL;
  // constructor(name: string, url: URL) {
  //   this.name = name;
  //   this.url = url;
  // }

  abstract load(cid: AnyLink): Promise<AnyBlock>;
  abstract save(car: AnyBlock, opts?: DataSaveOpts): Promise</*AnyLink | */ void>;
  abstract remove(cid: AnyLink): Promise<void>;
  abstract close(): Promise<void>;
  abstract destroy(): Promise<void>;
}
