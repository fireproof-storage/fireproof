import { conditionalDrop, SQLDatabase, SQLStatement } from "./abstract-sql.js";
import { ByConnection } from "./meta-merger.js";
import { TenantLedgerSql } from "./tenant-ledger.js";

export interface KeysForTenantLedger {
  readonly tenant: string;
  readonly ledger: string;
  readonly keys: string[];
  readonly createdAt: Date;
}

export interface SQLMetaByTenantLedgerRow {
  readonly tenant: string;
  readonly ledger: string;
  readonly key: string;
  readonly createdAt: string;
}

export class KeyByTenantLedgerSql {
  static schema(drop = false) {
    return [
      ...conditionalDrop(
        drop,
        "KeyByTenantLedger",
        `
        CREATE TABLE IF NOT EXISTS KeyByTenantLedger(
          tenant TEXT NOT NULL,
          ledger TEXT NOT NULL,
          key TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          PRIMARY KEY (tenant, ledger, key),
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
  sqlCreateKeyByTenantLedger(): SQLStatement[] {
    // return this.#sqlCreateMetaByTenantLedger.once(() => {
    return KeyByTenantLedgerSql.schema().map((i) => this.db.prepare(i));
    // });
  }

  // readonly #sqlInsertMetaByTenantLedger = new ResolveOnce();
  sqlEnsureKeyByTenantLedger(): SQLStatement {
    // return this.#sqlInsertMetaByTenantLedger.once(() => {
    return this.db.prepare(`
          INSERT INTO KeyByTenantLedger(tenant, ledger, key, createdAt)
            SELECT ?, ?, ?, ? WHERE NOT EXISTS (
              SELECT 1 FROM KeyByTenantLedger WHERE key = ? and tenant = ? and ledger = ?
            )
        `);
    // });
  }

  // readonly #sqlDeleteByConnection = new ResolveOnce();
  sqlDeleteByTenantLedgerKey(): SQLStatement {
    // return this.#sqlDeleteByConnection.once(() => {
    return this.db.prepare(`
          DELETE FROM KeyByTenantLedger
            WHERE
              tenant = ?
            AND
              ledger = ?
            AND
              key = ?
        `);
    // });
  }

  async deleteByTenantLedgerKey(t: Omit<KeysForTenantLedger, "createdAt">): Promise<void> {
    const stmt = this.sqlDeleteByTenantLedgerKey();
    for (const key of t.keys) {
      await stmt.run(t.tenant, t.ledger, key);
    }
  }

  async ensure(t: KeysForTenantLedger): Promise<void> {
    const stmt = this.sqlEnsureKeyByTenantLedger();
    for (const key of t.keys) {
      await stmt.run(t.tenant, t.ledger, key, t.createdAt, key, t.tenant, t.ledger);
    }
  }

  sqlSelectByTenantLedger(): SQLStatement {
    return this.db.prepare(`
          SELECT tenant, ledger, key, createdAt
          FROM KeyByTenantLedger
          WHERE tenant = ? AND ledger = ? 
          ORDER BY key
        `);
  }

  async selectKeysByTenantLedger(conn: ByConnection): Promise<Omit<KeysForTenantLedger, "createdAt">> {
    const stmt = this.sqlSelectByTenantLedger();
    const rows = await stmt.all<SQLMetaByTenantLedgerRow>(conn.tenant, conn.ledger);
    return {
      tenant: conn.tenant,
      ledger: conn.ledger,
      keys: rows.map((r) => r.key),
    };
  }
}
