import { CRDTEntry } from "@fireproof/core";
import { TenantLedgerSql } from "./tenant-ledger.js";
import { ByConnection } from "./meta-merger.js";
import { conditionalDrop, SQLDatabase, SQLStatement } from "./abstract-sql.js";

export interface MetaByTenantLedgerRow {
  readonly tenant: string;
  readonly ledger: string;
  readonly reqId: string;
  readonly resId: string;
  readonly metaCID: string;
  readonly meta: CRDTEntry;
  readonly updateAt: Date;
}

interface SQLMetaByTenantLedgerRow {
  readonly tenant: string;
  readonly ledger: string;
  readonly reqId: string;
  readonly resId: string;
  readonly metaCID: string;
  readonly meta: string;
  readonly updateAt: string;
}

/*
SELECT * FROM Mitarbeiter e1
WHERE NOT EXISTS
(
    SELECT 1 FROM Mitarbeiter e2
    WHERE e1.employee_id=e2.employee_id und e2.employee_name LIKE 'A%'
);
 */

export class MetaByTenantLedgerSql {
  static schema(drop = false) {
    return [
      ...TenantLedgerSql.schema(drop),
      ...conditionalDrop(
        drop,
        "MetaByTenantLedger",
        `
      CREATE TABLE IF NOT EXISTS MetaByTenantLedger(
        tenant TEXT NOT NULL,
        ledger TEXT NOT NULL,
        reqId TEXT NOT NULL,
        resId TEXT NOT NULL,
        metaCID TEXT NOT NULL,
        meta  TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (tenant, ledger, reqId, resId, metaCID),
        UNIQUE(metaCID),
        FOREIGN KEY (tenant, ledger) REFERENCES TenantLedger(tenant, ledger)
      )
    `,
      ),
    ];
  }

  readonly db: SQLDatabase;
  readonly tenantLedgerSql: TenantLedgerSql;
  readonly id: string;
  constructor(id: string, db: SQLDatabase, tenantLedgerSql: TenantLedgerSql) {
    this.db = db;
    this.tenantLedgerSql = tenantLedgerSql;
    this.id = id;
  }

  // readonly #sqlCreateMetaByTenantLedger = new ResolveOnce();
  sqlCreateMetaByTenantLedger(): SQLStatement[] {
    // return this.#sqlCreateMetaByTenantLedger.once(() => {
    return MetaByTenantLedgerSql.schema().map((i) => this.db.prepare(i));
    // });
  }

  // readonly #sqlInsertMetaByTenantLedger = new ResolveOnce();
  sqlEnsureMetaByTenantLedger(): SQLStatement {
    // return this.#sqlInsertMetaByTenantLedger.once(() => {
    return this.db.prepare(`
        INSERT INTO MetaByTenantLedger(tenant, ledger, reqId, resId, metaCID, meta, updatedAt)
          SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
            SELECT 1 FROM MetaByTenantLedger WHERE metaCID = ?
          )
      `);
    // });
  }

  // readonly #sqlDeleteByConnection = new ResolveOnce();
  sqlDeleteByConnection(): SQLStatement {
    // return this.#sqlDeleteByConnection.once(() => {
    return this.db.prepare(`
        DELETE FROM MetaByTenantLedger
          WHERE
            tenant = ?
          AND
            ledger = ?
          AND
            reqId = ?
          AND
            resId = ?
          AND
            metaCID NOT IN (SELECT value FROM json_each(?))
      `);
    // });
  }

  /*
   * select * from MetaByTenantLedger where tenant = 'tenant' and ledger = 'ledger' group by metaCID
   */

  // readonly #sqlSelectByMetaCIDs = new ResolveOnce<Statement>()
  // sqlSelectByMetaCIDs(): Statement<string[], SQLMetaByTenantLedgerRow> {
  //   return this.#sqlSelectByMetaCIDs.once(() => {
  //     return this.db.prepare(`
  //       SELECT tenant, ledger, reqId, resId, metaCID, meta, updatedAt
  //       FROM MetaByTenantLedger
  //       WHERE metaCID in ?
  //     `);
  //   })
  // }
  // async selectByMetaCIDs(metaCIDs: string[]): Promise<MetaByTenantLedgerRow[]> {
  //   const stmt = this.sqlSelectByMetaCIDs();
  //   const rows = await stmt.all(metaCIDs)
  //   return rows.map(row => ({
  //     ...row,
  //     meta: JSON.parse(row.meta),
  //     updateAt: new Date(row.updateAt)
  //   } satisfies MetaByTenantLedgerRow))
  // }

  async deleteByConnection(t: ByConnection & { metaCIDs: string[] }) {
    const stmt = this.sqlDeleteByConnection();
    return stmt.run(t.tenant, t.ledger, t.reqId, t.resId, JSON.stringify(t.metaCIDs));
  }

  async ensure(t: MetaByTenantLedgerRow) {
    const stmt = this.sqlEnsureMetaByTenantLedger();
    return stmt.run(t.tenant, t.ledger, t.reqId, t.resId, t.metaCID, JSON.stringify(t.meta), t.updateAt.toISOString(), t.metaCID);
  }

  sqlSelectByConnection(): SQLStatement {
    return this.db.prepare(`
        SELECT tenant, ledger, reqId, resId, metaCID, meta, updatedAt
        FROM MetaByTenantLedger
        WHERE tenant = ? AND ledger = ? AND reqId = ? AND resId = ?
        ORDER BY updatedAt
      `);
  }

  async selectByConnection(conn: ByConnection): Promise<MetaByTenantLedgerRow[]> {
    const stmt = this.sqlSelectByConnection();
    const rows = await stmt.all<SQLMetaByTenantLedgerRow>(conn.tenant, conn.ledger, conn.reqId, conn.resId);
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
