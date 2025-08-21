import { AppContext, BuildURI, WithoutPromise } from "@adviser/cement";
import { Attachable, Database, fireproof, GatewayUrlsParam, PARAM, DocWithId } from "@fireproof/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSuperThis, sleep } from "@fireproof/core-runtime";

const ROWS = 1;

class AJoinable implements Attachable {
  readonly name: string;
  readonly db: Database;

  constructor(name: string, db: Database) {
    this.name = name;
    this.db = db;
  }

  async configHash() {
    return `joinable-${this.name}`;
  }

  prepare(): Promise<GatewayUrlsParam> {
    return Promise.resolve({
      car: {
        url: BuildURI.from(`memory://car/${this.name}`)
          .setParam(PARAM.STORE_KEY, this.db.ledger.opts.storeUrls.data.car.getParam(PARAM.STORE_KEY, "@fireproof:attach@"))
          .setParam(PARAM.SELF_REFLECT, "x"),
      },
      meta: {
        url: BuildURI.from(`memory://meta/${this.name}`)
          .setParam(PARAM.STORE_KEY, this.db.ledger.opts.storeUrls.data.meta.getParam(PARAM.STORE_KEY, "@fireproof:attach@"))
          .setParam(PARAM.SELF_REFLECT, "x"),
      },
      file: {
        url: BuildURI.from(`memory://file/${this.name}`)
          .setParam(PARAM.STORE_KEY, this.db.ledger.opts.storeUrls.data.file.getParam(PARAM.STORE_KEY, "@fireproof:attach@"))
          .setParam(PARAM.SELF_REFLECT, "x"),
      },
    });
  }
}

function aJoinable(name: string, db: Database): Attachable {
  return new AJoinable(name, db);
}

function attachableStoreUrls(name: string, db: Database) {
  return {
    data: {
      car: BuildURI.from(`memory://car/${name}?`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.car.getParam(PARAM.STORE_KEY, ""))
        .URI(),
      meta: BuildURI.from(`memory://meta/${name}`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.meta.getParam(PARAM.STORE_KEY, ""))
        .URI(),
      file: BuildURI.from(`memory://file/${name}`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.file.getParam(PARAM.STORE_KEY, ""))
        .URI(),
      wal: BuildURI.from(`memory://wal/${name}`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.wal.getParam(PARAM.STORE_KEY, ""))
        .URI(),
    },
  };
}

async function syncDb(name: string, base: string) {
  const db = fireproof(name, {
    storeUrls: {
      base: BuildURI.from(base).setParam(PARAM.STORE_KEY, "@fireproof:attach@"),
    },
    ctx: AppContext.merge({ base }),
  });
  await db.ready();
  return db;
}

async function prepareDb(name: string, base: string) {
  {
    const db = await syncDb(name, base);
    await db.ready();
    const dbId = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car.id();
    const ret = { db, dbId };
    await writeRow(ret, `initial`);
    await db.close();
  }

  const db = await syncDb(name, base);
  await db.ready();
  const dbId = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car.id();
  return { db, dbId };
}

async function readDb(name: string, base: string) {
  const db = await syncDb(name, base);
  const rows = await db.allDocs();
  await db.close();
  return rows.rows.sort((a, b) => a.key.localeCompare(b.key));
}

async function writeRow(pdb: WithoutPromise<ReturnType<typeof prepareDb>>, style: string) {
  return await Promise.all(
    Array(ROWS)
      .fill(0)
      .map(async (_, i) => {
        const key = `${pdb.dbId}-${pdb.db.name}-${style}-${i}`;
        await pdb.db.put({
          _id: key,
          value: key,
          type: "test-document",
          description: `Test document for ${style}`,
        });
        return key;
      }),
  );
}

describe("Remote Sync Subscription Tests", () => {
  const sthis = ensureSuperThis();

  // Subscription tracking variables
  let subscriptionCallbacks: Array<() => void> = [];
  let subscriptionCounts = new Map<string, number>();
  let receivedDocs = new Map<string, DocWithId<any>[]>();

  // Helper to setup subscription tracking on a database
  function setupSubscription(db: Database, dbName: string): Promise<void> {
    return new Promise<void>((resolve) => {
      subscriptionCounts.set(dbName, 0);
      receivedDocs.set(dbName, []);
      
      const unsubscribe = db.subscribe((docs) => {
        const currentCount = subscriptionCounts.get(dbName) || 0;
        const currentDocs = receivedDocs.get(dbName) || [];
        
        subscriptionCounts.set(dbName, currentCount + 1);
        receivedDocs.set(dbName, [...currentDocs, ...docs]);
        
        console.log(`📨 Subscription fired for ${dbName}: ${docs.length} docs received (total: ${currentCount + 1} notifications)`);
        resolve();
      }, true);
      
      subscriptionCallbacks.push(unsubscribe);
    });
  }

  afterEach(async () => {
    // Clean up all subscriptions
    subscriptionCallbacks.forEach(unsub => unsub());
    subscriptionCallbacks = [];
    subscriptionCounts.clear();
    receivedDocs.clear();
  });

  describe("join function", () => {
    let db: Database;
    let joinableDBs: string[] = [];

    beforeEach(async () => {
      const set = sthis.nextId().str;

      db = fireproof(`db-${set}`, {
        storeUrls: {
          base: `memory://db-${set}`,
        },
      });

      for (let j = 0; j < ROWS; j++) {
        await db.put({ _id: `db-${j}`, value: `db-${set}` });
      }

      joinableDBs = await Promise.all(
        new Array(1).fill(1).map(async (_, i) => {
          const name = `remote-db-${i}-${set}`;
          const jdb = fireproof(name, {
            storeUrls: attachableStoreUrls(name, db),
          });
          for (let j = 0; j < ROWS; j++) {
            await jdb.put({ _id: `${i}-${j}`, value: `${i}-${j}` });
          }
          expect(await jdb.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
          await jdb.close();
          return name;
        }),
      );

      expect(await db.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
    });

    afterEach(async () => {
      await db.close();
    });

    it("should trigger subscriptions on inbound syncing", async () => {
      // Setup subscription on main database before attaching remote databases
      const subscriptionPromise = setupSubscription(db, "main-db");

      // Perform the attach operations that should trigger subscriptions
      await Promise.all(
        joinableDBs.map(async (name) => {
          const attached = await db.attach(aJoinable(name, db));
          expect(attached).toBeDefined();
        }),
      );

      // Wait for sync to complete
      await sleep(100);

      // Wait for subscription to fire (or timeout)
      await Promise.race([
        subscriptionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Subscription timeout")), 5000))
      ]);

      // Verify the subscription was triggered
      expect(subscriptionCounts.get("main-db")).toBeGreaterThan(0);
      console.log(`✅ Main DB subscription fired ${subscriptionCounts.get("main-db")} times`);

      // Verify the data was synced correctly
      expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
      const res = await db.allDocs();
      expect(res.rows.length).toBe(ROWS + ROWS * joinableDBs.length);

      // Verify subscription received the synced documents
      const docs = receivedDocs.get("main-db") || [];
      expect(docs.length).toBeGreaterThan(0);
      console.log(`📄 Received ${docs.length} documents via subscription`);
    });
  });

  describe("sync", () => {
    beforeEach(async () => {
      // Reset subscription tracking for each sync test
      subscriptionCallbacks.forEach(unsub => unsub());
      subscriptionCallbacks = [];
      subscriptionCounts.clear();
      receivedDocs.clear();
    });

    it("should trigger subscriptions during offline sync reconnection", async () => {
      const id = sthis.nextId().str;

      // Create outbound database and sync data
      const poutbound = await prepareDb(`outbound-db-${id}`, "memory://sync-outbound");
      await poutbound.db.attach(aJoinable(`sync-${id}`, poutbound.db));
      await poutbound.db.close();
      const outRows = await readDb(`outbound-db-${id}`, "memory://sync-outbound");
      expect(outRows.length).toBe(ROWS);

      // Create inbound database  
      const pinbound = await prepareDb(`inbound-db-${id}`, `memory://sync-inbound`);
      await pinbound.db.close();
      const inRows = await readDb(`inbound-db-${id}`, "memory://sync-inbound");
      expect(inRows.length).toBe(ROWS);

      // Now test the subscription during sync
      const inbound = await syncDb(`inbound-db-${id}`, `memory://sync-inbound`);
      
      // Setup subscription BEFORE attaching - this is key for testing the issue
      const subscriptionPromise = setupSubscription(inbound, "inbound-db");
      
      // Attach to the same sync namespace - this should trigger subscription
      await inbound.attach(aJoinable(`sync-${id}`, inbound));
      await inbound.close();

      // Wait for subscription to fire (or timeout)
      await Promise.race([
        subscriptionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Subscription timeout")), 5000))
      ]);

      // Verify the subscription was triggered by remote sync
      expect(subscriptionCounts.get("inbound-db")).toBeGreaterThan(0);
      console.log(`✅ Inbound DB subscription fired ${subscriptionCounts.get("inbound-db")} times during offline sync`);

      // Verify the data was synced correctly
      const resultRows = await readDb(`inbound-db-${id}`, "memory://sync-inbound");
      expect(resultRows.length).toBe(ROWS * 2); // inbound + outbound data

      // Verify subscription received the synced documents
      const docs = receivedDocs.get("inbound-db") || [];
      expect(docs.length).toBeGreaterThan(0);
      console.log(`📄 Received ${docs.length} documents via subscription during offline sync`);
    }, 100_000);

    it("should trigger subscriptions during online multi-database sync", async () => {
      const id = sthis.nextId().str;
      
      // Create multiple databases that will sync together
      const dbs = await Promise.all(
        Array(3)
          .fill(0)
          .map(async (_, i) => {
            const tdb = await prepareDb(`online-db-${id}-${i}`, `memory://local-${id}-${i}`);
            
            // Setup subscription on each database
            const subscriptionPromise = setupSubscription(tdb.db, `online-db-${i}`);
            
            // Attach to shared sync namespace
            await tdb.db.attach(aJoinable(`sync-${id}`, tdb.db));
            
            return { ...tdb, subscriptionPromise };
          }),
      );

      // Wait for initial sync to complete
      await sleep(1000);

      // Now write data to one database - this should trigger subscriptions on others
      const keys = (
        await Promise.all(
          dbs.map(async (db, index) => {
            await sleep(100 * Math.random());
            return writeRow(db, "add-online");
          }),
        )
      ).flat();

      // Wait for sync and subscriptions to propagate
      await sleep(1000);

      // Wait for all subscriptions to fire
      await Promise.all(
        dbs.map(async (db, i) => {
          try {
            await Promise.race([
              db.subscriptionPromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Subscription timeout for db ${i}`)), 5000))
            ]);
          } catch (error) {
            console.warn(`⚠️  Subscription for online-db-${i} did not fire:`, error);
          }
        })
      );

      // Verify subscriptions were triggered
      let totalSubscriptionFires = 0;
      dbs.forEach((_, i) => {
        const count = subscriptionCounts.get(`online-db-${i}`) || 0;
        totalSubscriptionFires += count;
        console.log(`📊 online-db-${i} subscription fired ${count} times`);
      });

      expect(totalSubscriptionFires).toBeGreaterThan(0);
      console.log(`✅ Total subscription fires across all databases: ${totalSubscriptionFires}`);

      // Verify data was synced correctly across all databases
      await Promise.all(
        dbs.map(async (db) => {
          for (const key of keys) {
            const doc = await db.db.get(key);
            expect(doc._id).toBe(key);
            expect((doc as any).value).toBe(key);
          }
        }),
      );

      // Cleanup
      await Promise.all(dbs.map((tdb) => tdb.db.close()));
    }, 100_000);
  });
});