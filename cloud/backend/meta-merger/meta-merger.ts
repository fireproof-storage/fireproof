import { ps, rt } from "@fireproof/core";
import { MetaByTenantLedgerSql } from "./meta-by-tenant-ledger.js";
import { MetaSendSql } from "./meta-send.js";
import { TenantLedgerSql } from "./tenant-ledger.js";
import { TenantSql } from "./tenant.js";
import { SQLDatabase } from "./abstract-sql.js";
import { Logger } from "@adviser/cement";
import { KeyByTenantLedgerSql } from "./key-by-tenant-ledger.js";

type TenantLedger = ps.cloud.TenantLedger;
type QSId = ps.cloud.QSId;

export interface Connection {
  readonly tenant: TenantLedger;
  readonly conn: QSId;
}

export interface MetaMerge {
  // readonly logger Logger;
  readonly connection: Connection;
  readonly meta: rt.V2SerializedMetaKey;
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
    readonly keyByTenantLedger: KeyByTenantLedgerSql;
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
      keyByTenantLedger: new KeyByTenantLedgerSql(id, db, tenantLedger),
      metaSend: new MetaSendSql(id, db),
    };
  }

  async createSchema(drop = false) {
    for (const i of this.sql.metaSend.sqlCreateMetaSend(drop)) {
      await i.run();
    }
  }

  async delMeta(mm: MetaMerge): Promise<{ now: Date; byConnection: ByConnection }> {
    const now = mm.now || new Date();
    const byConnection = toByConnection(mm.connection);
    const metaCIDs = mm.meta.metas.map((meta) => meta.cid);
    const connCIDs = {
      ...byConnection,
      metaCIDs: metaCIDs,
    };
    // console.log("delMeta", mm);
    await this.sql.keyByTenantLedger.deleteByTenantLedgerKey({
      ...byConnection,
      keys: mm.meta.keys,
    });

    await this.sql.metaSend.deleteByConnection(connCIDs);
    const waitingMetaCIDS = await this.sql.metaSend.getToSendMetaCIDs(byConnection.tenant, byConnection.ledger);
    await this.sql.metaByTenantLedger.deleteByConnection(connCIDs, waitingMetaCIDS);
    return { now, byConnection };
  }

  async addMeta(mm: MetaMerge) {
    if (!mm.meta.metas.length) {
      return;
    }
    const { now, byConnection } = await this.delMeta(mm);
    await this.sql.tenantLedger.ensure({
      ...mm.connection.tenant,
      createdAt: now,
    });
    await this.sql.keyByTenantLedger.ensure({
      ...byConnection,
      keys: mm.meta.keys,
      createdAt: now,
    });
    // console.log("addMeta", byConnection, mm.meta);
    for (const meta of mm.meta.metas) {
      try {
        // console.log("addMeta", byConnection, meta);
        await this.sql.metaByTenantLedger.ensure({
          ...byConnection,
          metaCID: meta.cid,
          meta: meta,
          updateAt: now,
        });
      } catch (e) {
        this.logger.Error().Err(e).Str("metaCID", meta.cid).Msg("addMeta");
      }
    }
  }

  async metaToSend(sink: Connection, now = new Date()): Promise<rt.V2SerializedMetaKey> {
    const bySink = toByConnection(sink);
    const rows = await this.sql.metaSend.selectToAddSend({ ...bySink, now });
    // console.log("metaToSend", bySink, rows);
    if (rows.length) {
      await this.sql.metaSend.insert(
        rows.map((row) => ({
          metaCID: row.metaCID,
          tenant: row.tenant,
          ledger: row.ledger,
          reqId: row.reqId,
          resId: row.resId,
          sendAt: row.sendAt,
        })),
      );
    }
    const { keys } = await this.sql.keyByTenantLedger.selectKeysByTenantLedger(bySink);
    return {
      keys,
      metas: rows.map((row) => row.meta),
    };
  }
}
