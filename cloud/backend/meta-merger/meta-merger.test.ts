import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import { Connection, MetaMerge, MetaMerger } from "./meta-merger.js";
import { SuperThis } from "@fireproof/core-types";
import { V2SerializedMetaKey } from "@fireproof/core-types/blockstore";
import { describe, beforeAll, beforeEach, afterEach, it, expect } from "vitest";
import { testSuperThis } from "@fireproof/cloud-base";
// import { SQLDatabase } from "./abstract-sql.js";
// import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";

function sortCRDTEntries(rows: V2SerializedMetaKey) {
  return rows.metas.sort((a, b) => a.cid.localeCompare(b.cid));
}

function sortKeysEntries(rows: V2SerializedMetaKey) {
  return rows.keys.sort();
}

interface MetaConnection {
  readonly meta: V2SerializedMetaKey;
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
    } as V2SerializedMetaKey,
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

  it("like-with-websocket", async () => {
    const tenant = `tenant${sthis.timeOrderedNextId().str}`;
    const ledger = "ledger";
    const resId = `resId-${sthis.timeOrderedNextId().str}`;
    const reqId = `reqId-${sthis.timeOrderedNextId().str}`;

    const conns = [];

    // putMeta
    for (let i = 0; i < 10; i++) {
      const conn = {
        reqId: `${reqId}-${i}`,
        resId: `${resId}-${i}`,
      };
      conns.push(conn);

      await mm.addMeta({
        connection: {
          tenant: {
            tenant,
            ledger,
          },
          conn,
        },
        meta: {
          metas: [
            {
              cid: `cid-${i}`,
              parents: [],
              data: `data-${i}`,
            },
          ],
          keys: [`key-${i}`],
        },
      });
    }

    const res = await mm.metaToSend({
      tenant: {
        tenant,
        ledger,
      },
      conn: {
        reqId: `${reqId}-new`,
        resId: `${resId}-new`,
      },
    });

    expect(res).toEqual({
      keys: conns.map((_, i) => `key-${i}`),
      metas: conns.map((_, i) => ({
        cid: `cid-${i}`,
        parents: [],
        data: `data-${i}`,
      })),
    });

    for (const conn of conns) {
      const res = await mm.metaToSend({
        tenant: {
          tenant,
          ledger,
        },
        conn: {
          reqId: conn.reqId,
          resId: conn.resId,
        },
      });
      expect(res).toEqual({
        keys: conns.map((_, i) => `key-${i}`),
        metas: conns.map((_, i) => ({
          cid: `cid-${i}`,
          parents: [],
          data: `data-${i}`,
        })),
      });

      for (let i = 0; i < 3; i++) {
        const resAgain = await mm.metaToSend({
          tenant: {
            tenant,
            ledger,
          },
          conn: {
            reqId: conn.reqId,
            resId: conn.resId,
          },
        });
        expect(resAgain).toEqual({
          keys: conns.map((_, i) => `key-${i}`),
          metas: [],
        });
      }
    }

    for (let i = 0; i < conns.length; i++) {
      await mm.addMeta({
        connection: {
          tenant: {
            tenant,
            ledger,
          },
          conn: conns[i],
        },
        meta: {
          metas: [
            {
              cid: `cid-${i}-again`,
              parents: [],
              data: `data-${i}-again`,
            },
          ],
          keys: [`key-${i}`],
        },
      });
      for (const conn of conns) {
        const res = await mm.metaToSend({
          tenant: {
            tenant,
            ledger,
          },
          conn: {
            reqId: conn.reqId,
            resId: conn.resId,
          },
        });
        expect(res).toEqual({
          keys: conns.map((_, i) => `key-${i}`),
          metas: [
            {
              cid: `cid-${i}-again`,
              parents: [],
              data: `data-${i}-again`,
            },
          ],
        });
      }
    }

    for (let i = 0; i < conns.length; i += 2) {
      await mm.addMeta({
        connection: {
          tenant: {
            tenant,
            ledger,
          },
          conn: conns[i],
        },
        meta: {
          metas: [
            {
              cid: `cid-${i}-again-1`,
              parents: [],
              data: `data-${i}-again-1`,
            },
          ],
          keys: [`key-${i}`],
        },
      });
      await mm.metaToSend({
        tenant: {
          tenant,
          ledger,
        },
        conn: conns[i],
      });
    }

    for (let i = 0; i < conns.length; i++) {
      const res = await mm.metaToSend({
        tenant: {
          tenant,
          ledger,
        },
        conn: conns[i],
      });
      if (i % 2 === 0) {
        expect(res).toEqual({
          keys: conns.map((_, i) => `key-${i}`),
          metas: conns
            .map((_, j) => {
              if (!(j % 2 === 0 && i < j)) {
                return undefined;
              }
              return {
                cid: `cid-${j}-again-1`,
                parents: [],
                data: `data-${j}-again-1`,
              };
            })
            .filter((i) => !!i),
        });
      } else {
        expect(res).toEqual({
          keys: conns.map((_, i) => `key-${i}`),
          metas: conns
            .filter((_, j) => j % 2 === 0)
            .map((_, j) => ({
              cid: `cid-${j * 2}-again-1`,
              parents: [],
              data: `data-${j * 2}-again-1`,
            })),
        });
      }
    }
  });
});
