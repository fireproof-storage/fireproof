import { Logger, Result } from "@adviser/cement";
import type { RunResult } from "better-sqlite3";

export interface DBConnection {
  connect(): Promise<void>;
  readonly opts: SQLOpts;
}

export interface SQLStore<IType, KType, OType = IType[]> {
  readonly dbConn: DBConnection;
  start(url: URL): Promise<void>;
  insert(url: URL, ose: IType): Promise<RunResult>;
  select(url: URL, car: KType): Promise<OType>;
  delete(url: URL, car: KType): Promise<RunResult>;
  close(url: URL): Promise<Result<void>>;
  destroy(url: URL): Promise<Result<void>>;
}

export interface SQLTableNames {
  readonly data: string;
  readonly meta: string;
  readonly wal: string;
}

export const DefaultSQLTableNames: SQLTableNames = {
  data: "Datas",
  meta: "Metas",
  wal: "Wals",
};

export interface SQLOpts {
  readonly url: URL;
  readonly sqlFlavor: "sqlite" | "mysql" | "postgres";
  readonly tableNames: SQLTableNames;
  readonly logger: Logger;
  readonly textEncoder: TextEncoder;
  readonly textDecoder: TextDecoder;
}

export interface WalKey {
  readonly name: string;
  readonly branch: string;
}

export interface WalRecord extends WalKey {
  readonly state: Uint8Array;
  readonly updated_at: Date;
}

export type WalSQLStore = SQLStore<WalRecord, WalKey>;

export interface MetaType {
  readonly name: string;
  readonly branch: string;
  readonly meta: Uint8Array;
}

export interface MetaRecordKey {
  readonly name: string;
  readonly branch: string;
}

export interface MetaRecord extends MetaRecordKey {
  readonly meta: Uint8Array;
  readonly updated_at: Date;
}

export type MetaSQLStore = SQLStore<MetaRecord, MetaRecordKey>;

export interface DataRecord {
  readonly name: string;
  readonly car: string;
  readonly data: Uint8Array;
  readonly updated_at: Date;
}

export type DataSQLStore = SQLStore<DataRecord, string>;
