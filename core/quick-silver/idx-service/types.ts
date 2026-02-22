export interface MetaEntry {
  readonly type: string;
  readonly key: string;
  readonly payload: unknown;
}

export interface IdxEntry {
  readonly idxName: string;
  readonly serializedKey: string;
  readonly keys: string[];
  readonly cidUrl: string;
  readonly primaryKey?: string;
  readonly meta?: MetaEntry[];
  readonly deleted?: boolean;
}

export interface AddToIdxOpts {
  readonly dbname: string;
  readonly idxName: string;
  readonly keys: string[];
  readonly cidUrl: string;
  readonly primaryKey?: string;
  readonly meta?: MetaEntry[];
}

export interface DeleteFromIdxOpts {
  readonly dbname: string;
  readonly idxName: string;
  readonly keys: string[];
}

export interface IdxServiceOpts {
  readonly prefix?: string;
}

export interface IdxQueryOpts {
  readonly dbname: string;
  readonly idxName: string;
  readonly keys?: string[];
  readonly order?: "asc" | "desc";
  readonly select?: (row: IdxEntry) => boolean;
  readonly includeDeleted?: boolean;
}
