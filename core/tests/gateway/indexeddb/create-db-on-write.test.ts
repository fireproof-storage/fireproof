import { Database } from "@fireproof/core";
import { fireproof } from "@fireproof/core-base";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("IndexedDB create on write", () => {
  const sthis = ensureSuperThis();

  const creating = [
    {
      name: "put",
      action: async (db: Database) => {
        await db.put({ _id: "test", test: "test" });
        // console.log("put", res);
      },
    },
    {
      name: "bulk",
      action: async (db: Database) => {
        await db.bulk([{ test: "test" }]);
      },
    },
  ];

  const notCreating = [
    {
      name: "onClosed",
      action: (db: Database) => {
        db.onClosed(() => {
          // console.log("closed");
        });
      },
    },
    // {
    //   name: "attach",
    //   action: async (db: Database) => {
    //     await db.attach({
    //       name: "test",
    //       prepare: async () => ({
    //         car: { url: "memory://test" },
    //         meta: { url: "memory://test" },
    //         file: { url: "memory://test" },
    //         wal: { url: "memory://test" },
    //       }),
    //       configHash: async () => "test",
    //     });
    //   },
    // },
    {
      name: "allDocs",
      action: async (db: Database) => {
        await db.allDocs();
      },
    },

    {
      name: "get",
      action: async (db: Database) => {
        try {
          await db.get("test");
        } catch (e) {
          // ignore
        }
      },
    },
    {
      name: "query",
      action: async (db: Database) => {
        await db.query("test");
      },
    },
    {
      name: "changes",
      action: async (db: Database) => {
        await db.changes();
      },
    },
    {
      name: "compact",
      action: async (db: Database) => {
        await db.compact();
      },
    },
    // the core write on del in any case
    // this will be a
    // {
    //   name: "del",
    //   action: async (db: Database) => {
    //     await db.del("test-key-never-found");
    //   },
    // },
  ];

  describe("action is not creating a db", () => {
    it("del", () => {
      console.warn(`⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️  The Core writes on del currently that should not the case on empty db's`);
      // const dbName = `indexdb-${sthis.nextId().str}`;
      // const db = fireproof(dbName);
      // try {
      //   await db.del("test");
      //   const idbs = await indexedDB.databases();
      //   expect(idbs.find((i) => i.name === `fp.${dbName}`)).not.toBeDefined();
      // } finally {
      //   await db.destroy();
      // }
    });

    describe("on fresh db", () => {
      const dbName = `indexdb-${sthis.nextId().str}`;
      const db = fireproof(dbName);

      afterAll(async () => {
        await db.destroy();
      });

      it.each(notCreating)("test $name", async (item) => {
        item.action(db);
        const idbs = await indexedDB.databases();
        // console.log("idbs", idbs, dbName);
        expect(idbs.find((i) => i.name === `fp.${dbName}`)).not.toBeDefined();
      });
    });
  });

  describe("action is creating a db", () => {
    it.each(creating)("test $name", async (item) => {
      const dbName = `indexdb-${sthis.nextId().str}`;
      const db = fireproof(dbName);
      try {
        await item.action(db);
        const idbs = await indexedDB.databases();
        // console.log("idbs", idbs, dbName);
        expect(idbs.find((i) => i.name === `fp.${dbName}`)).toBeDefined();
      } finally {
        await db.destroy();
      }
    });
  });

  describe("combine not and creating", () => {
    const dbName = `indexdb-${sthis.nextId().str}`;
    let db = fireproof(dbName);

    afterAll(async () => {
      await db.destroy();
    });

    describe("on fresh db", () => {
      it.each(notCreating)("not creating $name", async (item) => {
        item.action(db);
        const idbs = await indexedDB.databases();
        // console.log("idbs", idbs, dbName);
        expect(idbs.find((i) => i.name === `fp.${dbName}`)).not.toBeDefined();
      });
      it.each(creating)("creating $name", async (item) => {
        await item.action(db);
        const idbs = await indexedDB.databases();
        // console.log("idbs", idbs, dbName);
        expect(idbs.find((i) => i.name === `fp.${dbName}`)).toBeDefined();
      });

      it("simple get", async () => {
        const doc = await db.get("test");
        expect(doc).toEqual({
          _id: "test",
          test: "test",
        });
      });
      it.each(notCreating)("was created $name", async (item) => {
        item.action(db);
        const idbs = await indexedDB.databases();
        // console.log("idbs", idbs, dbName);
        expect(idbs.find((i) => i.name === `fp.${dbName}`)).toBeDefined();
      });
    });

    describe("reopen", () => {
      beforeAll(async () => {
        await db.close();
        db = fireproof(dbName);
      });

      it("simple get", async () => {
        const doc = await db.get("test");
        expect(doc).toEqual({
          _id: "test",
          test: "test",
        });
      });

      it.each(notCreating)("was created $name", async (item) => {
        item.action(db);
        const idbs = await indexedDB.databases();
        // console.log("idbs", idbs, dbName);
        expect(idbs.find((i) => i.name === `fp.${dbName}`)).toBeDefined();
      });
    });
  });

  // put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse>;
  // bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse>;
});
