import type { AnyBlock, AnyLink, DbMeta } from "./types";
import { format, parse, ToString } from "@ipld/dag-json";

import { PACKAGE_VERSION } from "./version";
const match = PACKAGE_VERSION.match(/^([^.]*\.[^.]*)/);
if (!match) throw new Error("invalid version: " + PACKAGE_VERSION);
export const STORAGE_VERSION = match[0];

abstract class VersionedStore {
  readonly STORAGE_VERSION: string = STORAGE_VERSION;
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
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

  abstract load(branch?: string): Promise<DbMeta[] | null>;
  abstract save(dbMeta: DbMeta, branch?: string): Promise<DbMeta[] | null>;
}

interface DataSaveOpts {
  readonly public: boolean;
}

export abstract class DataStore {
  readonly tag: string = "car-base";

  readonly STORAGE_VERSION: string = STORAGE_VERSION;
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }

  abstract load(cid: AnyLink | AnyLink[]): Promise<AnyBlock>;
  abstract save(car: AnyBlock, opts?: DataSaveOpts): Promise<void | AnyLink>;
  abstract remove(cid: AnyLink): Promise<void>;
}
