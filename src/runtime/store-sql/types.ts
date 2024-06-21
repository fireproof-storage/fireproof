import { RunResult } from "better-sqlite3";

export interface DBConnection {
  connect(): Promise<void>;
}

export interface SQLStore<IType, KType, OType = IType[]> {
  start(): Promise<SQLStore<IType, KType>>;
  insert(ose: IType): Promise<RunResult>;
  select(car: KType): Promise<OType>;
  delete(car: KType): Promise<RunResult>;
}
