// import { ResolveOnce } from "@adviser/cement";
// import { SQLStatement } from "./abstract-sql.js";

import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { DrizzleDatebase } from "../hono-server.js";

export const sqlTenant = sqliteTable("Tenant", {
  tenant: text().primaryKey(),
  createdAt: text().notNull(),
});

export interface TenantRow {
  readonly tenant: string;
  readonly createdAt: Date;
}

export class TenantSql {
  // static schema(drop = false): string[] {
  //   return [
  //     ...conditionalDrop(
  //       drop,
  //       "Tenant",
  //       `
  //     CREATE TABLE IF NOT EXISTS Tenant(
  //       tenant TEXT NOT NULL PRIMARY KEY,
  //       createdAt TEXT NOT NULL
  //     )
  //   `,
  //     ),
  //   ];
  // }

  readonly db: DrizzleDatebase;
  readonly id: string;
  constructor(id: string, db: DrizzleDatebase) {
    this.db = db;
    this.id = id;
  }

  // // readonly #sqlCreateTenant = new ResolveOnce<SQLStatement[]>();
  // sqlCreateTenant(): SQLStatement[] {
  //   // return this.#sqlCreateTenant.once(() => {
  //   return TenantSql.schema().map((i) => this.db.prepare(i));
  //   // });
  // }

  // readonly #sqlInsertTenant = new ResolveOnce<SQLStatement>();
  // sqlEnsureTenant(): SQLStatement {
  //   // return this.#sqlInsertTenant.once(() => {
  //   return this.db.prepare(`
  //       INSERT INTO Tenant(tenant, createdAt)
  //         SELECT ?, ? WHERE NOT EXISTS(SELECT 1 FROM Tenant WHERE tenant = ?)
  //     `);
  //   // });
  // }

  ensure(t: TenantRow) {
    return this.db
      .insert(sqlTenant)
      .values({
        tenant: t.tenant,
        createdAt: t.createdAt.toISOString(),
      })
      .onConflictDoNothing()
      .run();
  }
}
