// import { ResolveOnce } from "@adviser/cement";
import { conditionalDrop, SQLDatabase, SQLStatement } from "./abstract-sql.js";
import { TenantSql } from "./tenant.js";

export interface TenantLedgerRow {
  readonly tenant: string;
  readonly ledger: string;
  readonly createdAt: Date;
}

export class TenantLedgerSql {
  static schema(drop = false) {
    return [
      ...TenantSql.schema(drop),
      ...conditionalDrop(
        drop,
        "TenantLedger",
        `
      CREATE TABLE IF NOT EXISTS TenantLedger(
        tenant TEXT NOT NULL,
        ledger TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(tenant, ledger),
        FOREIGN KEY(tenant) REFERENCES Tenant(tenant)
      )
    `,
      ),
    ];
  }

  readonly db: SQLDatabase;
  readonly tenantSql: TenantSql;
  readonly id: string;
  constructor(id: string, db: SQLDatabase, tenantSql: TenantSql) {
    this.db = db;
    this.tenantSql = tenantSql;
    this.id = id;
  }

  // readonly #sqlCreateTenantLedger = new ResolveOnce<SQLStatement[]>();
  sqlCreateTenantLedger(): SQLStatement[] {
    // return this.#sqlCreateTenantLedger.once(() => {
    return TenantLedgerSql.schema().map((i) => this.db.prepare(i));
    // });
  }

  // readonly #sqlInsertTenantLedger = new ResolveOnce<SQLStatement>();
  sqlEnsureTenantLedger(): SQLStatement {
    // return this.#sqlInsertTenantLedger.once(() => {
    return this.db.prepare(`
        INSERT INTO TenantLedger(tenant, ledger, createdAt)
          SELECT ?, ?, ? WHERE
            NOT EXISTS(SELECT 1 FROM TenantLedger WHERE tenant = ? and ledger = ?)
      `);
    // });
  }

  async ensure(t: TenantLedgerRow) {
    await this.tenantSql.ensure({ tenant: t.tenant, createdAt: t.createdAt });
    const stmt = this.sqlEnsureTenantLedger();
    const ret = stmt.run(t.tenant, t.ledger, t.createdAt, t.tenant, t.ledger);
    return ret;
  }
}
