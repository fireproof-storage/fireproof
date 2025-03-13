// import { ResolveOnce } from "@adviser/cement";
import { conditionalDrop, SQLDatabase, SQLStatement } from "./abstract-sql.js";

export interface TenantRow {
  readonly tenant: string;
  readonly createdAt: Date;
}

export class TenantSql {
  static schema(drop = false): string[] {
    return [
      ...conditionalDrop(
        drop,
        "Tenant",
        `
      CREATE TABLE IF NOT EXISTS Tenant(
        tenant TEXT NOT NULL PRIMARY KEY,
        createdAt TEXT NOT NULL
      )
    `,
      ),
    ];
  }

  readonly db: SQLDatabase;
  readonly id: string;
  constructor(id: string, db: SQLDatabase) {
    this.db = db;
    this.id = id;
  }

  // readonly #sqlCreateTenant = new ResolveOnce<SQLStatement[]>();
  sqlCreateTenant(): SQLStatement[] {
    // return this.#sqlCreateTenant.once(() => {
    return TenantSql.schema().map((i) => this.db.prepare(i));
    // });
  }

  // readonly #sqlInsertTenant = new ResolveOnce<SQLStatement>();
  sqlEnsureTenant(): SQLStatement {
    // return this.#sqlInsertTenant.once(() => {
    return this.db.prepare(`
        INSERT INTO Tenant(tenant, createdAt)
          SELECT ?, ? WHERE NOT EXISTS(SELECT 1 FROM Tenant WHERE tenant = ?)
      `);
    // });
  }

  async ensure(t: TenantRow) {
    const stmt = this.sqlEnsureTenant();
    return stmt.run(t.tenant, t.createdAt, t.tenant);
  }
}
