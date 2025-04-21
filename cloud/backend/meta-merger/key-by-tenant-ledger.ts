// import { conditionalDrop, SQLDatabase, SQLStatement } from "./abstract-sql.js";
import { ByConnection } from "./meta-merger.js";
// import { TenantLedgerSql } from "./tenant-ledger.js";
import { foreignKey, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqlTenantLedger } from "./tenant-ledger.js";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleDatebase } from "../hono-server.js";

export interface KeysForTenantLedger {
  readonly tenant: string;
  readonly ledger: string;
  readonly keys: string[];
  readonly createdAt: Date;
}

// export interface SQLMetaByTenantLedgerRow {
//   readonly tenant: string;
//   readonly ledger: string;
//   readonly key: string;
//   readonly createdAt: string;
// }

export const sqlKeyByTenantLedger = sqliteTable(
  "KeyByTenantLedger",
  {
    tenant: text().notNull(),
    ledger: text().notNull(),
    key: text().notNull(),
    createdAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenant, table.ledger, table.key] }),
    foreignKey({
      columns: [table.tenant, table.ledger],
      foreignColumns: [sqlTenantLedger.tenant, sqlTenantLedger.ledger],
    }),
  ],
);

export class KeyByTenantLedgerSql {
  // static schema(drop = false) {
  //   return [
  //     ...conditionalDrop(
  //       drop,
  //       "KeyByTenantLedger",
  //       `
  //       CREATE TABLE IF NOT EXISTS KeyByTenantLedger(
  //         tenant TEXT NOT NULL,
  //         ledger TEXT NOT NULL,
  //         key TEXT NOT NULL,
  //         createdAt TEXT NOT NULL,
  //         PRIMARY KEY (tenant, ledger, key),
  //         FOREIGN KEY (tenant, ledger) REFERENCES TenantLedger(tenant, ledger)
  //       )
  //     `,
  //     ),
  //   ];
  // }

  readonly db: DrizzleDatebase;
  // readonly tenantLedgerSql: TenantLedgerSql;
  readonly id: string;
  constructor(id: string, db: DrizzleDatebase) {
    this.db = db;
    this.id = id;
  }

  // readonly #sqlCreateMetaByTenantLedger = new ResolveOnce();
  // sqlCreateKeyByTenantLedger(): SQLStatement[] {
  //   // return this.#sqlCreateMetaByTenantLedger.once(() => {
  //   return KeyByTenantLedgerSql.schema().map((i) => this.db.prepare(i));
  //   // });
  // }

  // readonly #sqlInsertMetaByTenantLedger = new ResolveOnce();

  // readonly #sqlDeleteByConnection = new ResolveOnce();
  // sqlDeleteByTenantLedgerKey(): SQLStatement {
  //   // return this.#sqlDeleteByConnection.once(() => {
  //   return this.db.prepare(`
  //         DELETE FROM KeyByTenantLedger
  //           WHERE
  //             tenant = ?
  //           AND
  //             ledger = ?
  //           AND
  //             key = ?
  //       `);
  //   // });
  // }

  async deleteByTenantLedgerKey(t: Omit<KeysForTenantLedger, "createdAt">) {
    if (!t.keys.length) {
      return;
    }
    return this.db
      .delete(sqlKeyByTenantLedger)
      .where(
        and(
          eq(sqlKeyByTenantLedger.tenant, t.tenant),
          eq(sqlKeyByTenantLedger.ledger, t.ledger),
          inArray(sqlKeyByTenantLedger.key, t.keys),
        ),
      )
      .run();
  }

  // sqlEnsureKeyByTenantLedger(): SQLStatement {
  //   // return this.#sqlInsertMetaByTenantLedger.once(() => {
  //   return this.db.prepare(`
  //         INSERT INTO KeyByTenantLedger(tenant, ledger, key, createdAt)
  //           SELECT ?, ?, ?, ? WHERE NOT EXISTS (
  //             SELECT 1 FROM KeyByTenantLedger WHERE key = ? and tenant = ? and ledger = ?
  //           )
  //       `);
  //   // });
  // }

  async ensure(t: KeysForTenantLedger) {
    const ret = await this.db
      .insert(sqlKeyByTenantLedger)
      .values(
        t.keys.map((key) => ({
          tenant: t.tenant,
          ledger: t.ledger,
          key: key,
          createdAt: t.createdAt.toISOString(),
        })),
      )
      .onConflictDoNothing()
      .run();
    return ret;
  }

  // sqlSelectByTenantLedger(): SQLStatement {
  //   return this.db.prepare(`
  //         SELECT tenant, ledger, key, createdAt
  //         FROM KeyByTenantLedger
  //         WHERE tenant = ? AND ledger = ?
  //         ORDER BY key
  //       `);
  // }

  async selectKeysByTenantLedger(conn: ByConnection): Promise<Omit<KeysForTenantLedger, "createdAt">> {
    // const stmt = this.sqlSelectByTenantLedger();
    const rows = await this.db
      .select()
      .from(sqlKeyByTenantLedger)
      .where(and(eq(sqlKeyByTenantLedger.tenant, conn.tenant), eq(sqlKeyByTenantLedger.ledger, conn.ledger)))
      .orderBy(sqlKeyByTenantLedger.key)
      .all();
    return {
      tenant: conn.tenant,
      ledger: conn.ledger,
      keys: rows.map((r) => r.key),
    };
  }
}
