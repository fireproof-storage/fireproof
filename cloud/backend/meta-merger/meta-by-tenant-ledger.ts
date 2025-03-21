import { CRDTEntry, } from "@fireproof/core";
import { sqlTenantLedger } from "./tenant-ledger.js";
import { ByConnection } from "./meta-merger.js";
import { foreignKey, primaryKey, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { eq, and, notInArray } from "drizzle-orm";

export interface MetaByTenantLedgerRow {
  readonly tenant: string;
  readonly ledger: string;
  readonly reqId: string;
  readonly resId: string;
  readonly metaCID: string;
  readonly meta: CRDTEntry;
  readonly updateAt: Date;
}

// interface SQLMetaByTenantLedgerRow {
//   readonly tenant: string;
//   readonly ledger: string;
//   readonly reqId: string;
//   readonly resId: string;
//   readonly metaCID: string;
//   readonly meta: string;
//   readonly updateAt: string;
// }


export const sqlMetaByTenantLedger = sqliteTable(
  "MetaByTenantLedger",
  {
    tenant: text().notNull(),
    ledger: text().notNull(),
    metaCID: text().notNull(),
    meta: text().notNull(),
    reqId: text().notNull(),
    resId: text().notNull(),
    updateAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenant, table.ledger, table.metaCID] }),
    index("MetaByTenantLedger-ReqIdResId").on(table.tenant, table.ledger, table.reqId, table.resId),
    foreignKey({
      columns: [table.tenant, table.ledger],
      foreignColumns: [sqlTenantLedger.tenant, sqlTenantLedger.ledger],
    }),
  ],
);

export class MetaByTenantLedgerSql {
  // static schema(drop = false) {
  //   return [
  //     ...TenantLedgerSql.schema(drop),
  //     ...conditionalDrop(
  //       drop,
  //       "MetaByTenantLedger",
  //       `
  //     CREATE TABLE IF NOT EXISTS MetaByTenantLedger(
  //       tenant TEXT NOT NULL,
  //       ledger TEXT NOT NULL,
  //       reqId TEXT NOT NULL,
  //       resId TEXT NOT NULL,
  //       metaCID TEXT NOT NULL,
  //       meta  TEXT NOT NULL,
  //       updatedAt TEXT NOT NULL,
  //       PRIMARY KEY (tenant, ledger, reqId, resId, metaCID),
  //       UNIQUE (tenant, ledger, metaCID),
  //       FOREIGN KEY (tenant, ledger) REFERENCES TenantLedger(tenant, ledger)
  //     )
  //   `,
  //     ),
  //   ];
  // }

  readonly db: LibSQLDatabase;
  readonly id: string;
  constructor(id: string, db: LibSQLDatabase) {
    this.db = db;
    this.id = id;
  }

  // readonly #sqlCreateMetaByTenantLedger = new ResolveOnce();
  // sqlCreateMetaByTenantLedger(): SQLStatement[] {
  //   // return this.#sqlCreateMetaByTenantLedger.once(() => {
  //   return MetaByTenantLedgerSql.schema().map((i) => this.db.prepare(i));
  //   // });
  // }


  // readonly #sqlDeleteByConnection = new ResolveOnce();
  // sqlDeleteByConnection(): SQLStatement {
  //   // return this.#sqlDeleteByConnection.once(() => {
  //   const stmt = this.db.prepare(`
  //       DELETE FROM MetaByTenantLedger
  //         WHERE
  //           tenant = ?
  //         AND
  //           ledger = ?
  //         AND
  //           reqId = ?
  //         AND
  //           resId = ?
  //         AND
  //           metaCID NOT IN (SELECT value FROM json_each(?))
  //     `);
  //   return stmt;
  //   // });
  // }

  async deleteByConnection(t: ByConnection, waitingMetaCIDS: string[]) {
    return this.db.delete(sqlMetaByTenantLedger).where(
      and(
        eq(sqlMetaByTenantLedger.tenant, t.tenant),
        eq(sqlMetaByTenantLedger.ledger, t.ledger),
        notInArray(sqlMetaByTenantLedger.metaCID, waitingMetaCIDS),
      ),
    )
  }

    // readonly #sqlInsertMetaByTenantLedger = new ResolveOnce();
    // sqlEnsureMetaByTenantLedger(): SQLStatement {
    //   // return this.#sqlInsertMetaByTenantLedger.once(() => {
    //   return this.db.prepare(`
    //       INSERT INTO MetaByTenantLedger(tenant, ledger, reqId, resId, metaCID, meta, updatedAt)
    //         SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
    //           SELECT 1 FROM MetaByTenantLedger WHERE metaCID = ? AND tenant = ? AND ledger = ? 
    //         )
    //     `);
    //   // });
    // }

  async ensure(t: MetaByTenantLedgerRow) {
    // const stmt = this.sqlEnsureMetaByTenantLedger();
    return this.db.insert(sqlMetaByTenantLedger).values([{
      ...t,
      meta: JSON.stringify(t.meta),
      updateAt: t.updateAt.toISOString(),
    }]).onConflictDoNothing().run();
  }

  // sqlSelectByConnection(): SQLStatement {
  //   return this.db.prepare(`
  //       SELECT tenant, ledger, reqId, resId, metaCID, meta, updatedAt
  //       FROM MetaByTenantLedger
  //       WHERE tenant = ? AND ledger = ? AND reqId = ? AND resId = ?
  //       ORDER BY updatedAt
  //     `);
  // }

  async selectByConnection(conn: ByConnection): Promise<MetaByTenantLedgerRow[]> {
    // const stmt = this.sqlSelectByConnection();
    // const rows = await stmt.all<SQLMetaByTenantLedgerRow>(conn.tenant, conn.ledger, conn.reqId, conn.resId);
    const rows = await this.db.select().from(sqlMetaByTenantLedger).where(
      and(
        eq(sqlMetaByTenantLedger.tenant, conn.tenant),
        eq(sqlMetaByTenantLedger.ledger, conn.ledger),
        eq(sqlMetaByTenantLedger.reqId, conn.reqId),
        eq(sqlMetaByTenantLedger.resId, conn.resId),
      ),
    ).all();
    return rows.map(
      (row) =>
        ({
          ...row,
          meta: JSON.parse(row.meta),
          updateAt: new Date(row.updateAt),
        }) satisfies MetaByTenantLedgerRow,
    );
  }
}
