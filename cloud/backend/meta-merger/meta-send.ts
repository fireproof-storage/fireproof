// import { ResolveOnce } from "@adviser/cement";
import { sqlMetaByTenantLedger } from "./meta-by-tenant-ledger.js";
import { ByConnection } from "./meta-merger.js";
import { CRDTEntry } from "@fireproof/core";
// import { SQLDatabase, SQLStatement } from "./abstract-sql.js";
import { foreignKey, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { DrizzleDatebase } from "../hono-server.js";

export interface MetaSendRow {
  readonly metaCID: string;
  readonly tenant: string;
  readonly ledger: string;
  readonly reqId: string;
  readonly resId: string;
  readonly sendAt: Date;
}

export const sqlMetaSend = sqliteTable(
  "MetaSend",
  {
    metaCID: text().notNull(),
    tenant: text().notNull(),
    ledger: text().notNull(),
    // my QS
    reqId: text().notNull(),
    resId: text().notNull(),
    sendAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.metaCID, table.tenant, table.ledger, table.reqId, table.resId] }),
    foreignKey({
      columns: [table.tenant, table.ledger, table.metaCID],
      foreignColumns: [sqlMetaByTenantLedger.tenant, sqlMetaByTenantLedger.ledger, sqlMetaByTenantLedger.metaCID],
    }),
  ],
);

// type SQLMetaSendRowWithMeta = MetaSendRow & { meta: string };
export type MetaSendRowWithMeta = MetaSendRow & { meta: CRDTEntry };

export class MetaSendSql {
  // static schema(drop = false) {
  //   return [
  //     ...MetaByTenantLedgerSql.schema(drop),
  //     ...KeyByTenantLedgerSql.schema(drop),
  //     ...conditionalDrop(
  //       drop,
  //       "MetaSend",
  //       `
  //     CREATE TABLE IF NOT EXISTS MetaSend (
  //       metaCID TEXT NOT NULL,
  //       tenant TEXT NOT NULL,
  //       ledger TEXT NOT NULL,
  //       reqId TEXT NOT NULL,
  //       resId TEXT NOT NULL,
  //       sendAt TEXT NOT NULL,
  //       PRIMARY KEY(metaCID, tenant, ledger, reqId,resId),
  //       FOREIGN KEY(tenant, ledger, metaCID) REFERENCES MetaByTenantLedger(tenant, ledger, metaCID)
  //     );
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

  // readonly #sqlCreateMetaSend = new ResolveOnce<SQLStatement>();
  // sqlCreateMetaSend(drop: boolean): SQLStatement[] {
  //   // return this.#sqlCreateMetaSend.once(() => {
  //   return MetaSendSql.schema(drop).map((i) => this.db.prepare(i));
  //   // });
  // }

  // readonly #sqlInsertMetaSend = new ResolveOnce<SQLStatement>();
  // sqlInsertMetaSend(): SQLStatement {
  //   // return this.#sqlInsertMetaSend.once(() => {
  //   return this.db.prepare(`
  //       INSERT INTO MetaSend(metaCID, tenant, ledger, reqId, resId, sendAt) VALUES(?, ?, ?, ?, ?, ?)
  //     `);
  //   // });
  // }

  // readonly #sqlSelectToAddSend = new ResolveOnce<SQLStatement>();
  // sqlSelectToAddSend(): SQLStatement {
  //   // return this.#sqlSelectToAddSend.once(() => {
  //   return this.db.prepare(`
  //       SELECT t.metaCID, t.tenant, t.ledger, ? as reqId, ? as resId, ? as sendAt, t.meta FROM MetaByTenantLedger as t
  //         WHERE
  //           t.tenant = ?
  //         AND
  //           t.ledger = ?
  //         AND
  //           NOT EXISTS (SELECT 1 FROM MetaSend AS s WHERE t.metaCID = s.metaCID and t.tenant = s.tenant and t.ledger = s.ledger and s.reqId = ? and s.resId = ?)
  //     `);
  //   // });
  // }

  async selectToAddSend(conn: ByConnection & { now: Date }): Promise<MetaSendRowWithMeta[]> {
    // console.log("selectToAddSend-1");
    // const stmt = this.sqlSelectToAddSend();
    // console.log("selectToAddSend-2");
    const rows = await this.db
      .select()
      .from(sqlMetaByTenantLedger)
      .where(
        and(
          eq(sqlMetaByTenantLedger.tenant, conn.tenant),
          eq(sqlMetaByTenantLedger.ledger, conn.ledger),
          notInArray(
            sqlMetaByTenantLedger.metaCID,
            this.db
              .select({ metaCID: sqlMetaSend.metaCID })
              .from(sqlMetaSend)
              .where(
                and(
                  eq(sqlMetaSend.tenant, conn.tenant),
                  eq(sqlMetaSend.ledger, conn.ledger),
                  eq(sqlMetaSend.reqId, conn.reqId),
                  eq(sqlMetaSend.resId, conn.resId),
                ),
              ),
          ),
        ),
      )
      .all();
    const now = conn.now;
    // console.log("selectToAddSend-3", rows);
    return rows.map(
      (i) =>
        ({
          metaCID: i.metaCID,
          tenant: i.tenant,
          ledger: i.ledger,
          reqId: conn.reqId,
          resId: conn.resId,
          sendAt: now,
          meta: JSON.parse(i.meta) as CRDTEntry,
        }) satisfies MetaSendRowWithMeta,
    );
  }

  async insert(t: MetaSendRow[]) {
    if (!t.length) {
      return;
    }
    // cloudflare D1 don't like [] in VALUES
    for (const i of t) {
      this.db
        .insert(sqlMetaSend)
        .values({
          ...i,
          sendAt: i.sendAt.toISOString(),
        })
        .onConflictDoNothing()
        .run();
    }
    // console.log("insert:send", t.length);
    // return this.db
    //   .insert(sqlMetaSend)
    //   .values(
    //     t.map((i) => ({
    //       ...i,
    //       sendAt: i.sendAt.toISOString(),
    //     })),
    //   )
    //   .onConflictDoNothing()
    //   .run();
    // const stmt = this.sqlInsertMetaSend();
    // for (const i of t) {
    //   await stmt.run(i.metaCID, i.tenant, i.ledger, i.reqId, i.resId, i.sendAt);
    // }
  }

  // readonly #sqlDeleteByConnection = new ResolveOnce<SQLStatement>();

  // sqlMetaCIDByTenantLedger(): SQLStatement {
  //   return this.db.prepare(`
  //     select distinct metaCID from MetaSend where tenant = ? and ledger = ?
  //   `);
  // }

  async getToSendMetaCIDs(tenant: string, ledger: string): Promise<string[]> {
    const rows = await this.db
      .select({ metaCID: sqlMetaSend.metaCID })
      .from(sqlMetaSend)
      .where(and(eq(sqlMetaSend.tenant, tenant), eq(sqlMetaSend.ledger, ledger)))
      .all();
    //   db
    // .select({
    //   [columnName]: myTable[columnName],
    // })
    // .from(myTable)
    // .where(whereCondition)
    // .distinct();
    // const rows = await stmt.all<{ metaCID: string }>(tenant, ledger);
    return Array.from(new Set(rows.map((i) => i.metaCID)));
  }

  // sqlDeleteByMetaCID(): SQLStatement {
  //   // return this.#sqlDeleteByConnection.once(() => {

  //   return this.db.prepare(`
  //     DELETE FROM MetaSend
  //       WHERE
  //         tenant = ?
  //       AND
  //         ledger = ?
  //       AND
  //         reqId = ?
  //       AND
  //         resId = ?
  //       AND
  //         metaCID in (SELECT value FROM json_each(?))
  //     `);
  //   // });
  // }

  // sqlMetaCIDByConnection(): SQLStatement {
  //   return this.db.prepare(`
  //     SELECT metaCID FROM MetaSend
  //     WHERE
  //       tenant = ?
  //     AND
  //       ledger = ?
  //     AND
  //       reqId = ?
  //     AND
  //       resId = ?
  //     AND
  //       metaCID NOT IN (SELECT value FROM json_each(?))
  //   `);
  // }

  async deleteByConnection(dmi: ByConnection & { metaCIDs: string[] }) {
    if (!dmi.metaCIDs.length) {
      return;
    }
    const metaCIDs = await this.db
      .select()
      .from(sqlMetaSend)
      .where(
        and(
          eq(sqlMetaSend.tenant, dmi.tenant),
          eq(sqlMetaSend.ledger, dmi.ledger),
          eq(sqlMetaSend.reqId, dmi.reqId),
          eq(sqlMetaSend.resId, dmi.resId),
          notInArray(sqlMetaSend.metaCID, dmi.metaCIDs),
        ),
      )
      .all();
    if (!metaCIDs.length) {
      return;
    }
    // console.log("deleteByConnection:send", dmi, metaCIDs);
    // const stmt = this.sqlDeleteByMetaCID();
    return this.db
      .delete(sqlMetaSend)
      .where(
        and(
          eq(sqlMetaSend.tenant, dmi.tenant),
          eq(sqlMetaSend.ledger, dmi.ledger),
          eq(sqlMetaSend.reqId, dmi.reqId),
          eq(sqlMetaSend.resId, dmi.resId),
          inArray(
            sqlMetaSend.metaCID,
            metaCIDs.map((i) => i.metaCID),
          ),
        ),
      )
      .run(); //dmi.tenant, dmi.ledger, dmi.reqId, dmi.resId, JSON.stringify(metaCIDs.map((i) => i.metaCID)));
  }
}
