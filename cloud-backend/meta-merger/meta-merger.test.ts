// import type { Database } from "better-sqlite3";
import { Connection, MetaMerger } from "./meta-merger.js";
import { CRDTEntry, ensureSuperThis } from "@fireproof/core";
import { SQLDatabase } from "./abstract-sql.js";

function sortCRDTEntries(rows: CRDTEntry[]) {
  return rows.sort((a, b) => a.cid.localeCompare(b.cid));
}

interface MetaConnection {
  readonly metas: CRDTEntry[];
  readonly connection: Connection;
}

function toCRDTEntries(rows: MetaConnection[]) {
  return rows.reduce((r, i) => [...r, ...i.metas], [] as CRDTEntry[]);
}

// function filterConnection(ref: MetaConnection[], connection: Connection) {
//   return toCRDTEntries(ref.filter((r) =>
//       (r.connection.tenant.tenant === connection.tenant.tenant &&
//       r.connection.tenant.ledger === connection.tenant.ledger &&
//       r.connection.conn.reqId === connection.conn.reqId &&
//       r.connection.conn.resId === connection.conn.resId)))
// }

function getSQLFlavours(): { name: string; factory: () => Promise<SQLDatabase> }[] {
  return [
    {
      name: "bettersql",
      factory: async () => {
        const { BetterSQLDatabase } = await import("./bettersql-abstract-sql.js");
        return new BetterSQLDatabase("./dist/test.db");
      },
    },
  ];
}

describe.each(getSQLFlavours())("$name - MetaMerger", (flavour) => {
  // let db: SQLDatabase;
  const sthis = ensureSuperThis();
  const logger = sthis.logger;
  let mm: MetaMerger;
  beforeAll(async () => {
    //    db = new Database(':memory:');
    const db = await flavour.factory();
    mm = new MetaMerger("bong", logger, db);
    await mm.createSchema();
  });

  let connection: Connection;
  beforeEach(() => {
    connection = {
      tenant: {
        tenant: `tenant${sthis.timeOrderedNextId().str}`,
        ledger: "ledger",
      },
      conn: {
        reqId: "reqId",
        resId: `resId-${sthis.timeOrderedNextId().str}`,
      },
    } satisfies Connection;
  });

  afterEach(async () => {
    await mm.delMeta({
      connection,
    });
  });

  it("insert nothing", async () => {
    await mm.addMeta({
      connection,
      metas: [],
      now: new Date(),
    });
    const rows = await mm.metaToSend(connection);
    expect(rows).toEqual([]);
  });

  it("insert one multiple", async () => {
    const cid = sthis.timeOrderedNextId().str;
    for (let i = 0; i < 10; i++) {
      const metas = Array(i).fill({
        cid: cid,
        parents: [],
        data: "MomRkYXRho",
      });
      await mm.addMeta({
        connection,
        metas,
        now: new Date(),
      });
      const rows = await mm.metaToSend(connection);
      if (i === 1) {
        expect(rows).toEqual(metas);
      } else {
        expect(rows).toEqual([]);
      }
    }
  });

  it("insert multiple", async () => {
    const conns = [];
    for (let i = 0; i < 10; i++) {
      const metas = Array(i)
        .fill({
          cid: "x",
          parents: [],
          data: "MomRkYXRho",
        })
        .map((m) => ({ ...m, cid: sthis.timeOrderedNextId().str }));
      const conn = {
        ...connection.conn,
        reqId: sthis.timeOrderedNextId().str,
      };
      conns.push(conn);
      await mm.addMeta({
        connection: {
          ...connection,
          conn,
        } satisfies Connection,
        metas,
        now: new Date(),
      });
      const rows = await mm.metaToSend(connection);
      expect(sortCRDTEntries(rows)).toEqual(sortCRDTEntries(metas));
    }
    await Promise.all(
      conns.map(async (conn) =>
        mm.delMeta({
          connection: { ...connection, conn },
          metas: [],
        }),
      ),
    );
  });

  it("metaToSend to sink", async () => {
    const connections = Array(2)
      .fill(connection)
      .map((c) => ({ ...c, conn: { ...c.conn, reqId: sthis.timeOrderedNextId().str } }));
    const ref: MetaConnection[] = [];
    for (const connection of connections) {
      const metas = Array(2)
        .fill({
          cid: "x",
          parents: [],
          data: "MomRkYXRho",
        })
        .map((m) => ({ ...m, cid: sthis.timeOrderedNextId().str }));
      ref.push({ metas, connection });
      await mm.addMeta({
        connection,
        metas,
        now: new Date(),
      });
    }
    // wrote 10 connections with 3 metas each
    for (const connection of connections) {
      const rows = await mm.metaToSend(connection);
      expect(sortCRDTEntries(rows)).toEqual(sortCRDTEntries(toCRDTEntries(ref)));
      const rowsEmpty = await mm.metaToSend(connection);
      expect(sortCRDTEntries(rowsEmpty)).toEqual([]);
    }
    const newConnections = Array(2)
      .fill(connection)
      .map((c) => ({ ...c, conn: { ...c.conn, reqId: sthis.timeOrderedNextId().str } }));
    for (const connection of newConnections) {
      const rows = await mm.metaToSend(connection);
      expect(sortCRDTEntries(rows)).toEqual(sortCRDTEntries(toCRDTEntries(ref)));
      const rowsEmpty = await mm.metaToSend(connection);
      expect(sortCRDTEntries(rowsEmpty)).toEqual([]);
    }
    await Promise.all(
      connections.map(async (connection) =>
        mm.delMeta({
          connection,
          metas: [],
        }),
      ),
    );
  });

  it("delMeta", async () => {
    await mm.addMeta({
      connection,
      metas: [
        {
          cid: `del-${sthis.timeOrderedNextId().str}`,
          parents: [],
          data: "MomRkYXRho",
        },
        {
          cid: `del-${sthis.timeOrderedNextId().str}`,
          parents: [],
          data: "MomRkYXRho",
        },
      ],
      now: new Date(),
    });
    const rows = await mm.metaToSend(connection);
    expect(rows.length).toBe(2);
    await mm.delMeta({
      connection,
      metas: rows,
      now: new Date(),
    });
    const rowsDel = await mm.metaToSend(connection);
    expect(rowsDel.length).toBe(0);
  });
});
