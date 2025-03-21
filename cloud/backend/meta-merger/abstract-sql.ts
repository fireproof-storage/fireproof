// import { RunResult } from "better-sqlite3";

// export function now() {
//   return new Date().toISOString();
// }

// export interface SqlLiteStmt {
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   bind(...args: any[]): any;
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   run(...args: any[]): Promise<RunResult>;
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   get<T>(...args: any[]): Promise<T>;
// }

// export interface SqlLite {
//   prepare(sql: string): SqlLiteStmt;
// }

// export interface SqlLiteDBDialect {

// }

// export type SQLLiteFlavor = BaseSQLiteDatabase<'async', unknown>;

export interface SQLDatabase {
  prepare(sql: string): SQLStatement;
}

export type SQLParams = (string | number | Date)[];

// export type SQLRow = Record<string, unknown>;

export interface SQLStatement {
  run<T = void>(...params: SQLParams): Promise<T>;
  all<T>(...params: SQLParams): Promise<T[]>;
}

export function conditionalDrop(drop: boolean, tabName: string, create: string): string[] {
  if (!drop) {
    return [create];
  }
  return [`DROP TABLE IF EXISTS ${tabName}`, create];
}

export function sqliteCoerceParams(params: SQLParams): (string | number)[] {
  return params.map((i) => {
    if (i instanceof Date) {
      return i.toISOString();
    }
    return i;
  });
}
