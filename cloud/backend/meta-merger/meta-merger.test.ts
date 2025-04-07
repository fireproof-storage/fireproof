import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import { Connection, MetaMerge, MetaMerger } from "./meta-merger.js";
import { rt, SuperThis } from "@fireproof/core";
import { testSuperThis } from "../../test-super-this.js";
// import { SQLDatabase } from "./abstract-sql.js";
// import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";

function sortCRDTEntries(rows: rt.V2SerializedMetaKey) {
  return rows.metas.sort((a, b) => a.cid.localeCompare(b.cid));
}

function sortKeysEntries(rows: rt.V2SerializedMetaKey) {
  return rows.keys.sort();
}

interface MetaConnection {
  readonly meta: rt.V2SerializedMetaKey;
  readonly connection: Connection;
}

function toCRDTEntries(rows: MetaConnection[]) {
  return rows.reduce(
    (r, i) => {
      r.metas.push(...i.meta.metas);
      r.keys.push(...i.meta.keys);
      return r;
    },
    {
      metas: [],
      keys: [],
    } as rt.V2SerializedMetaKey,
  );
}

// function filterConnection(ref: MetaConnection[], connection: Connection) {
//   return toCRDTEntries(ref.filter((r) =>
//       (r.connection.tenant.tenant === connection.tenant.tenant &&
//       r.connection.tenant.ledger === connection.tenant.ledger &&
//       r.connection.conn.reqId === connection.conn.reqId &&
//       r.connection.conn.resId === connection.conn.resId)))
// }

function getSQLFlavours(sthis: SuperThis): { name: string; factory: () => Promise<LibSQLDatabase> }[] {
  return [
    {
      name: "libsql",
      factory: async () => {
        // import type { Client } from "@libsql/client";
        const { createClient } = await import("@libsql/client");
        return drizzle(
          createClient({
            url: sthis.env.get("FP_TEST_SQL_URL") as string,
          }),
        );
      },
    },
  ];
}

describe("$name - MetaMerger", () => {
  // let db: SQLDatabase;
  const sthis = testSuperThis();
  const flavour = getSQLFlavours(sthis)[0];
  const logger = sthis.logger;
  let mm: MetaMerger;
  beforeAll(async () => {
    //    db = new Database(':memory:');
    const db = await flavour.factory();
    mm = new MetaMerger("bong", logger, db);
    // await mm.createSchema();
  });

  let metaMerge: MetaMerge;
  beforeEach(() => {
    metaMerge = {
      connection: {
        tenant: {
          tenant: `tenant${sthis.timeOrderedNextId().str}`,
          ledger: "ledger",
        },
        conn: {
          reqId: "reqId",
          resId: `resId-${sthis.timeOrderedNextId().str}`,
        },
      },
      meta: {
        metas: [],
        keys: [],
      },
    } satisfies MetaMerge;
  });

  afterEach(async () => {
    await mm.delMeta(metaMerge);
  });

  it("insert nothing", async () => {
    await mm.addMeta({
      ...metaMerge,
      meta: {
        metas: [],
        keys: [],
      },
      now: new Date(),
    });
    const rows = await mm.metaToSend(metaMerge.connection);
    expect(rows).toEqual({
      metas: [],
      keys: [],
    });
  });

  it("insert one multiple", async () => {
    const cid = sthis.timeOrderedNextId().str;
    for (let i = 0; i < 10; i++) {
      const meta = {
        metas: Array(i).fill({
          cid,
          parents: [],
          data: "MomRkYXRho",
        }),
        keys: Array(i).fill("key"),
      };
      // console.log("metas", i, metas);
      await mm.addMeta({
        ...metaMerge,
        meta,
        now: new Date(),
      });
      const rows = await mm.metaToSend(metaMerge.connection);
      if (i === 1) {
        expect(rows).toEqual(meta);
      } else {
        expect(rows).toEqual({
          metas: [],
          keys: i ? ["key"] : [],
        });
      }
    }
  });

  it("insert multiple", async () => {
    const conns = [];
    const keys = [] as string[];
    for (let i = 0; i < 10; i++) {
      const meta = {
        metas: Array(i)
          .fill({
            cid: "x",
            parents: [],
            data: "MomRkYXRho",
          })
          .map((m) => ({ ...m, cid: sthis.timeOrderedNextId().str })),
        keys: Array(i)
          .fill("key")
          .map(() => sthis.timeOrderedNextId().str),
      };
      const conn = {
        ...metaMerge.connection,
        reqId: sthis.timeOrderedNextId().str,
      };
      conns.push(conn);
      await mm.addMeta({
        ...metaMerge,
        meta,
        now: new Date(),
      });
      const rows = await mm.metaToSend(metaMerge.connection);
      expect(sortCRDTEntries(rows)).toEqual(sortCRDTEntries(meta));
      keys.push(...meta.keys);
      expect(sortKeysEntries(rows)).toEqual(keys.sort());
    }
    await Promise.all(
      conns.map(async (conn) =>
        mm.delMeta({
          connection: conn,
          meta: {
            metas: [],
            keys: [],
          },
        }),
      ),
    );
  });

  it("metaToSend to sink", async () => {
    const connections = Array(2)
      .fill(metaMerge.connection)
      .map((c) => ({ ...c, conn: { ...c.conn, reqId: sthis.timeOrderedNextId().str } }));
    const ref: MetaConnection[] = [];
    for (const connection of connections) {
      const meta = {
        metas: Array(2)
          .fill({
            cid: "x",
            parents: [],
            data: "MomRkYXRho",
          })
          .map((m) => ({ ...m, cid: sthis.timeOrderedNextId().str })),
        keys: Array(2)
          .fill("key")
          .map(() => sthis.timeOrderedNextId().str),
      };
      ref.push({ meta, connection });
      await mm.addMeta({
        connection,
        meta,
        now: new Date(),
      });
    }
    // wrote 10 connections with 3 metas each
    for (const connection of connections) {
      const rows = await mm.metaToSend(connection);
      // console.log("connection", connection, rows, JSON.stringify(ref, null,2));
      expect(sortCRDTEntries(rows)).toEqual(sortCRDTEntries(toCRDTEntries(ref)));
      const rowsEmpty = await mm.metaToSend(connection);
      expect(sortCRDTEntries(rowsEmpty)).toEqual([]);
    }

    const newConnections = Array(2)
      .fill(metaMerge.connection)
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
          meta: {
            metas: [],
            keys: [],
          },
        }),
      ),
    );
  });

  it("delMeta", async () => {
    await mm.addMeta({
      ...metaMerge,
      meta: {
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
        keys: ["hello", "world"],
      },
      now: new Date(),
    });
    const rows = await mm.metaToSend(metaMerge.connection);
    expect(rows.metas.length).toBe(2);
    expect(rows.keys.length).toBe(2);
    await mm.delMeta({
      connection: metaMerge.connection,
      meta: rows,
      now: new Date(),
    });
    const rowsDel = await mm.metaToSend(metaMerge.connection);
    expect(rowsDel.metas.length).toBe(0);
    expect(rowsDel.keys.length).toBe(0);
  });
});
