import { SQLDatabase, sqliteCoerceParams, SQLParams, SQLStatement } from "./abstract-sql.js";

import Database from "better-sqlite3";

export class BetterSQLStatement implements SQLStatement {
  readonly stmt: Database.Statement;
  constructor(stmt: Database.Statement) {
    this.stmt = stmt;
  }

  async run<T>(...iparams: SQLParams): Promise<T> {
    const res = (await this.stmt.run(...sqliteCoerceParams(iparams))) as T;
    // console.log("run", res);
    return res;
  }
  async all<T>(...params: SQLParams): Promise<T[]> {
    const res = (await this.stmt.all(...sqliteCoerceParams(params))) as T[];
    // console.log("all", res);
    return res;
  }
}

export class BetterSQLDatabase implements SQLDatabase {
  readonly db: Database.Database;
  constructor(dbOrPath: Database.Database | string) {
    if (typeof dbOrPath === "string") {
      this.db = new Database(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
  }

  prepare(sql: string): SQLStatement {
    return new BetterSQLStatement(this.db.prepare(sql));
  }
}
