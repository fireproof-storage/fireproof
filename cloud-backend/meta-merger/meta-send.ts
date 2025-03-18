// import { ResolveOnce } from "@adviser/cement";
import { MetaByTenantLedgerSql } from "./meta-by-tenant-ledger.js";
import { ByConnection } from "./meta-merger.js";
import { CRDTEntry } from "@fireproof/core";
import { conditionalDrop, SQLDatabase, SQLStatement } from "./abstract-sql.js";
import { KeyByTenantLedgerSql } from "./key-by-tenant-ledger.js";

export interface MetaSendRow {
  readonly metaCID: string;
  readonly reqId: string;
  readonly resId: string;
  readonly sendAt: Date;
}

type SQLMetaSendRowWithMeta = MetaSendRow & { meta: string };
export type MetaSendRowWithMeta = MetaSendRow & { meta: CRDTEntry };

export class MetaSendSql {
  static schema(drop = false) {
    return [
      ...MetaByTenantLedgerSql.schema(drop),
      ...KeyByTenantLedgerSql.schema(drop),
      ...conditionalDrop(
        drop,
        "MetaSend",
        `
      CREATE TABLE IF NOT EXISTS MetaSend (
        metaCID TEXT NOT NULL,
        reqId TEXT NOT NULL,
        resId TEXT NOT NULL,
        sendAt TEXT NOT NULL,
        PRIMARY KEY(metaCID,reqId,resId),
        FOREIGN KEY(metaCID) REFERENCES MetaByTenantLedger(metaCID)
      );
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

  // readonly #sqlCreateMetaSend = new ResolveOnce<SQLStatement>();
  sqlCreateMetaSend(drop: boolean): SQLStatement[] {
    // return this.#sqlCreateMetaSend.once(() => {
    return MetaSendSql.schema(drop).map((i) => this.db.prepare(i));
    // });
  }

  // readonly #sqlInsertMetaSend = new ResolveOnce<SQLStatement>();
  sqlInsertMetaSend(): SQLStatement {
    // return this.#sqlInsertMetaSend.once(() => {
    return this.db.prepare(`
        INSERT INTO MetaSend(metaCID, reqId, resId, sendAt) VALUES(?, ?, ?, ?)
      `);
    // });
  }

  // readonly #sqlSelectToAddSend = new ResolveOnce<SQLStatement>();
  sqlSelectToAddSend(): SQLStatement {
    // return this.#sqlSelectToAddSend.once(() => {
    return this.db.prepare(`
        SELECT t.metaCID, ? as reqId, ? as resId, ? as sendAt, t.meta FROM MetaByTenantLedger as t
          WHERE
            t.tenant = ?
          AND
            t.ledger = ?
          AND
            NOT EXISTS (SELECT 1 FROM MetaSend AS s WHERE t.metaCID = s.metaCID and s.reqId = ? and s.resId = ?)
      `);
    // });
  }

  async selectToAddSend(conn: ByConnection & { now: Date }): Promise<MetaSendRowWithMeta[]> {
    // console.log("selectToAddSend-1");
    const stmt = this.sqlSelectToAddSend();
    // console.log("selectToAddSend-2");
    try {
      const rows = await stmt.all<SQLMetaSendRowWithMeta>(
        conn.reqId,
        conn.resId,
        conn.now,
        conn.tenant,
        conn.ledger,
        conn.reqId,
        conn.resId,
      );
      // console.log("selectToAddSend-3", rows);
      return rows.map(
        (i) =>
          ({
            metaCID: i.metaCID,
            reqId: i.reqId,
            resId: i.resId,
            sendAt: new Date(i.sendAt),
            meta: JSON.parse(i.meta) as CRDTEntry,
          }) satisfies MetaSendRowWithMeta,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("selectToAddSend:error", this.id, e);
      throw e;
    }
  }

  async insert(t: MetaSendRow[]) {
    const stmt = this.sqlInsertMetaSend();
    for (const i of t) {
      await stmt.run(i.metaCID, i.reqId, i.resId, i.sendAt.toISOString());
    }
  }

  // readonly #sqlDeleteByConnection = new ResolveOnce<SQLStatement>();
  sqlDeleteByMetaCID(): SQLStatement {
    // return this.#sqlDeleteByConnection.once(() => {
    return this.db.prepare(`
      DELETE FROM MetaSend
        WHERE metaCID in (SELECT metaCID FROM MetaByTenantLedger
                          WHERE
                            tenant = ?
                          AND
                            ledger = ?
                          AND
                            reqId = ?
                          AND
                            resId = ?
                          AND
                            metaCID NOT IN (SELECT value FROM json_each(?)))
      `);
    // });
  }

  async deleteByConnection(dmi: ByConnection & { metaCIDs: string[] }) {
    const stmt = this.sqlDeleteByMetaCID();
    return stmt.run(dmi.tenant, dmi.ledger, dmi.reqId, dmi.resId, JSON.stringify(dmi.metaCIDs));
  }
}
