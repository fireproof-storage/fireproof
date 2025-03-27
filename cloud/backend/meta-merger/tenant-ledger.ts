// import { ResolveOnce } from "@adviser/cement";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqlTenant } from "./tenant.js";
import { DrizzleDatebase } from "../hono-server.js";

export const sqlTenantLedger = sqliteTable(
  "TenantLedger",
  {
    tenant: text().references(() => sqlTenant.tenant),
    ledger: text(),
    createdAt: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenant, table.ledger] })],
);

export interface TenantLedgerRow {
  readonly tenant: string;
  readonly ledger: string;
  readonly createdAt: Date;
}

export class TenantLedgerSql {
  // static schema(drop = false) {
  //   return [
  //     ...TenantSql.schema(drop),
  //     ...conditionalDrop(
  //       drop,
  //       "TenantLedger",
  //       `
  //     CREATE TABLE IF NOT EXISTS TenantLedger(
  //       tenant TEXT NOT NULL,
  //       ledger TEXT NOT NULL,
  //       createdAt TEXT NOT NULL,
  //       PRIMARY KEY(tenant, ledger),
  //       FOREIGN KEY(tenant) REFERENCES Tenant(tenant)
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

  // readonly #sqlCreateTenantLedger = new ResolveOnce<SQLStatement[]>();
  // sqlCreateTenantLedger(): SQLStatement[] {
  //   // return this.#sqlCreateTenantLedger.once(() => {
  //   return TenantLedgerSql.schema().map((i) => this.db.prepare(i));
  //   // });
  // }

  // readonly #sqlInsertTenantLedger = new ResolveOnce<SQLStatement>();
  // sqlEnsureTenantLedger(): SQLStatement {
  //   // return this.#sqlInsertTenantLedger.once(() => {
  //   return this.db.prepare(`
  //       INSERT INTO TenantLedger(tenant, ledger, createdAt)
  //         SELECT ?, ?, ? WHERE
  //           NOT EXISTS(SELECT 1 FROM TenantLedger WHERE tenant = ? and ledger = ?)
  //     `);
  //   // });
  // }

  async ensure(t: TenantLedgerRow) {
    return this.db
      .insert(sqlTenantLedger)
      .values({
        tenant: t.tenant,
        ledger: t.ledger,
        createdAt: t.createdAt.toISOString(),
      })
      .onConflictDoNothing()
      .run();
  }
}
