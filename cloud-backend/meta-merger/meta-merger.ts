import { CRDTEntry, ps } from "@fireproof/core";
import { MetaByTenantLedgerSql } from "./meta-by-tenant-ledger.js";
import { MetaSendSql } from "./meta-send.js";
import { TenantLedgerSql } from "./tenant-ledger.js";
import { TenantSql } from "./tenant.js";
import { SQLDatabase } from "./abstract-sql.js";
import { Logger } from "@adviser/cement";

type TenantLedger = ps.cloud.TenantLedger;
type QSId = ps.cloud.QSId;

export interface Connection {
  readonly tenant: TenantLedger;
  readonly conn: QSId;
}

export interface MetaMerge {
  // readonly logger Logger;
  readonly connection: Connection;
  readonly metas: CRDTEntry[];
  readonly now?: Date;
}

export interface ByConnection {
  readonly tenant: string;
  readonly ledger: string;
  readonly reqId: string;
  readonly resId: string;
}

function toByConnection(connection: Connection): ByConnection {
  return {
    ...connection.conn,
    ...connection.tenant,
  };
}

export function metaMerger(ctx: {
  readonly id: string;
  readonly logger: Logger;
  readonly dbFactory: () => SQLDatabase;
  // readonly sthis: SuperThis;
}) {
  return new MetaMerger(ctx.id, ctx.logger, ctx.dbFactory());
}

export class MetaMerger {
  readonly db: SQLDatabase;
  // readonly sthis: SuperThis;
  readonly sql: {
    readonly tenant: TenantSql;
    readonly tenantLedger: TenantLedgerSql;
    readonly metaByTenantLedger: MetaByTenantLedgerSql;
    readonly metaSend: MetaSendSql;
  };

  readonly logger: Logger;
  readonly id: string;

  constructor(id: string, logger: Logger, db: SQLDatabase) {
    this.db = db;
    this.id = id;
    this.logger = logger;
    // this.sthis = sthis;
    const tenant = new TenantSql(id, db);
    const tenantLedger = new TenantLedgerSql(id, db, tenant);
    this.sql = {
      tenant,
      tenantLedger,
      metaByTenantLedger: new MetaByTenantLedgerSql(id, db, tenantLedger),
      metaSend: new MetaSendSql(id, db),
    };
  }

  async createSchema(drop = false) {
    for (const i of this.sql.metaSend.sqlCreateMetaSend(drop)) {
      await i.run();
    }
  }

  async delMeta(
    mm: Omit<MetaMerge, "metas"> & { readonly metas?: CRDTEntry[] },
  ): Promise<{ now: Date; byConnection: ByConnection }> {
    const now = mm.now || new Date();
    const byConnection = toByConnection(mm.connection);
    const metaCIDs = (mm.metas ?? []).map((meta) => meta.cid);
    const connCIDs = {
      ...byConnection,
      // needs something with is not empty to delete
      metaCIDs: metaCIDs.length ? metaCIDs : [new Date().toISOString()],
    };
    await this.sql.metaSend.deleteByConnection(connCIDs);
    await this.sql.metaByTenantLedger.deleteByConnection(connCIDs);
    return { now, byConnection };
  }

  async addMeta(mm: MetaMerge) {
    if (!mm.metas.length) {
      return;
    }
    const { now, byConnection } = await this.delMeta(mm);
    await this.sql.tenantLedger.ensure({
      ...mm.connection.tenant,
      createdAt: now,
    });
    for (const meta of mm.metas) {
      try {
        await this.sql.metaByTenantLedger.ensure({
          ...byConnection,
          metaCID: meta.cid,
          meta: meta,
          updateAt: now,
        });
      } catch (e) {
        this.logger.Warn().Err(e).Str("metaCID", meta.cid).Msg("addMeta");
      }
    }
  }

  async metaToSend(sink: Connection, now = new Date()): Promise<CRDTEntry[]> {
    const bySink = toByConnection(sink);
    const rows = await this.sql.metaSend.selectToAddSend({ ...bySink, now });
    await this.sql.metaSend.insert(
      rows.map((row) => ({
        metaCID: row.metaCID,
        reqId: row.reqId,
        resId: row.resId,
        sendAt: row.sendAt,
      })),
    );
    return rows.map((row) => row.meta);
  }
}
