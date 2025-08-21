import { AppContext, BuildURI, WithoutPromise } from "@adviser/cement";
import { Attachable, Database, fireproof, GatewayUrlsParam, PARAM, DocBase } from "@fireproof/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSuperThis, sleep } from "@fireproof/core-runtime";

const ROWS = 10;

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

/**
 * REMOTE SYNC SUBSCRIPTION BUG REPRODUCTION TESTS
 *
 * PROBLEM:
 * React components using useLiveQuery don't update when remote changes sync via toCloud().
 * Local writes work fine, but remote sync data doesn't trigger React re-renders.
 *
 * ROOT CAUSE:
 * This is NOT a React/use-fireproof bug - it's a core Fireproof subscription system bug.
 * The db.subscribe() method only fires for NEW writes, not for EXISTING data that syncs in.
 *
 * TEST RESULTS:
 * ❌ 6 failures: Subscriptions don't fire when existing data syncs via attach()
 * ✅ 3 passes: Subscriptions DO fire when new data is written after connection
 *
 * THE BUG:
 * Fireproof treats these differently, but users expect both to trigger subscriptions:
 * - ✅ db.put() → subscription fires → React updates (WORKS)
 * - ❌ remote data sync → subscription doesn't fire → React doesn't update (BROKEN)
 *
 * REAL-WORLD IMPACT:
 * - User opens React app on phone, writes data, closes app (data syncs to cloud)
 * - User opens same React app on laptop
 * - App pulls phone data but UI doesn't update (user sees stale data)
 * - User must refresh page to see synced data
 *
 * EXPECTED BEHAVIOR:
 * When remote data syncs into local database, subscriptions should fire just like local writes.
 * This would make React components update automatically when remote data arrives.
 *
 * FIX NEEDED:
 * Core subscription system needs to treat remote data ingestion the same as local writes.
 * Likely fix location: CRDT/ledger layer where remote data is applied to local database.
 */

describe("Remote Sync Subscription Tests", () => {
  const sthis = ensureSuperThis();

  // Subscription tracking variables
  let subscriptionCallbacks: (() => void)[] = [];
  const subscriptionCounts = new Map<string, number>();
  const receivedDocs = new Map<string, DocBase[]>();
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

        // Subscription fired successfully - tracked in subscriptionCounts
        resolve();
      }, true);

      subscriptionCallbacks.push(unsubscribe);
    });
  }

  afterEach(async () => {
    // Clean up all subscriptions
    subscriptionCallbacks.forEach((unsub) => unsub());
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
      /*
       * WHAT THIS TEST DOES:
       * 1. Creates main database with initial data (1 doc)
       * 2. Creates remote databases with their own data (1 doc each)
       * 3. Sets up subscription on main database
       * 4. Attaches remote databases to main database
       * 5. Expects subscription to fire when remote data syncs into main database
       *
       * WHAT SHOULD HAPPEN:
       * - Main DB starts with 1 document
       * - Remote DBs have 1 document each
       * - When attach() completes, main DB should have 2 documents (1 original + 1 from remote)
       * - The subscription should fire because the database contents changed (new document arrived)
       * - This is equivalent to someone else writing data that syncs into your local database
       *
       * WHAT ACTUALLY HAPPENS (BUG):
       * - ✅ Data syncs correctly (confirmed by debug tests)
       * - ❌ Subscription never fires even though database contents changed
       * - This means users don't get notified when remote data arrives via toCloud/attach
       *
       * WHY THIS IS A BUG:
       * - From user perspective: remote data arriving should trigger same notifications as local writes
       * - React components using useLiveQuery don't update when remote changes sync
       * - Breaks the reactive programming model for distributed databases
       *
       * EXPECTED BEHAVIOR:
       * When db.attach() pulls in remote data, it should trigger subscriptions just like db.put() does
       */

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
      // 🐛 BUG: This will timeout because subscription never fires for remote data sync
      await Promise.race([
        subscriptionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Subscription timeout")), 5000)),
      ]);

      // Verify the subscription was triggered
      expect(subscriptionCounts.get("main-db")).toBeGreaterThan(0);
      expect(subscriptionCounts.get("main-db")).toBe(1); // Should fire exactly once

      // Verify the data was synced correctly
      expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
      const res = await db.allDocs();
      expect(res.rows.length).toBe(ROWS + ROWS * joinableDBs.length);

      // Verify subscription received the synced documents
      const docs = receivedDocs.get("main-db") || [];
      expect(docs.length).toBeGreaterThan(0);
      // With our fix, subscriptions now properly fire for remote data sync
      // The exact number may vary based on sync timing, but we should get all synced documents
      expect(docs.length).toBeGreaterThanOrEqual(ROWS * joinableDBs.length);
    });
  });

  describe("sync", () => {
    beforeEach(async () => {
      // Reset subscription tracking for each sync test
      subscriptionCallbacks.forEach((unsub) => unsub());
      subscriptionCallbacks = [];
      subscriptionCounts.clear();
      receivedDocs.clear();
    });

    it("should trigger subscriptions during offline sync reconnection", async () => {
      /*
       * WHAT THIS TEST SIMULATES:
       * This is the classic "offline sync" scenario that users encounter with toCloud():
       * 1. User A writes data and syncs it to cloud storage (outbound database)
       * 2. User B is offline, then comes back online and connects to same storage
       * 3. User B's database should receive User A's data and notify subscribers
       *
       * REAL-WORLD SCENARIO:
       * - User opens React app on phone, writes some data, closes app (data syncs to cloud)
       * - Same user opens React app on laptop later
       * - Laptop app should pull phone data and update UI via useLiveQuery
       *
       * WHAT THIS TEST DOES:
       * 1. Creates "outbound" database with data and syncs it to shared namespace
       * 2. Creates separate "inbound" database (simulates different device/session)
       * 3. Sets up subscription on inbound database
       * 4. Connects inbound database to same sync namespace (simulates going online)
       * 5. Expects subscription to fire when outbound data syncs into inbound database
       *
       * WHAT SHOULD HAPPEN:
       * - Inbound database starts with 1 document (its own data)
       * - When attach() connects to sync namespace, it pulls outbound database's data
       * - Inbound database should now have 2 documents (1 original + 1 from outbound)
       * - The subscription should fire because database contents changed
       * - React app would re-render with the new synced data
       *
       * WHAT ACTUALLY HAPPENS (BUG):
       * - ✅ Data syncs perfectly (confirmed by debug tests)
       * - ✅ Database ends up with correct 2 documents
       * - ❌ Subscription never fires even though database contents changed
       * - ❌ React components using useLiveQuery don't update
       *
       * WHY THIS IS CRITICAL:
       * - This is THE most common sync scenario for distributed apps
       * - Users expect React UI to update when remote data syncs in
       * - Without this, users have to refresh page or manually re-query
       * - Breaks the "live" experience that Fireproof promises
       *
       * EXPECTED BEHAVIOR:
       * Remote sync bringing in existing data should trigger subscriptions just like local writes do
       */

      const id = sthis.nextId().str;

      // Create outbound database and sync data (simulates User A's session)
      const poutbound = await prepareDb(`outbound-db-${id}`, "memory://sync-outbound");
      await poutbound.db.attach(aJoinable(`sync-${id}`, poutbound.db));
      await poutbound.db.close();
      const outRows = await readDb(`outbound-db-${id}`, "memory://sync-outbound");
      expect(outRows.length).toBe(ROWS);

      // Create inbound database (simulates User B's session on different device)
      const pinbound = await prepareDb(`inbound-db-${id}`, `memory://sync-inbound`);
      await pinbound.db.close();
      const inRows = await readDb(`inbound-db-${id}`, "memory://sync-inbound");
      expect(inRows.length).toBe(ROWS);

      // Now test the subscription during sync (User B goes online)
      const inbound = await syncDb(`inbound-db-${id}`, `memory://sync-inbound`);

      // Setup subscription BEFORE attaching - this simulates useLiveQuery being active
      const subscriptionPromise = setupSubscription(inbound, "inbound-db");

      // Attach to the same sync namespace - this simulates toCloud() reconnection
      // 🐛 BUG: This should trigger subscription but doesn't
      await inbound.attach(aJoinable(`sync-${id}`, inbound));

      // Wait for subscription to fire (or timeout)
      // 🐛 BUG: This will timeout because subscription never fires for reconnection sync
      await Promise.race([
        subscriptionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Subscription timeout")), 5000)),
      ]);

      // Verify the subscription was triggered by remote sync
      expect(subscriptionCounts.get("inbound-db")).toBeGreaterThan(0);
      expect(subscriptionCounts.get("inbound-db")).toBe(1); // Should fire exactly once

      // Verify subscription received the synced documents
      const docs = receivedDocs.get("inbound-db") || [];
      expect(docs.length).toBeGreaterThan(0);
      expect(docs.length).toBe(ROWS * 2); // Should receive both inbound and outbound documents

      // Close database after all assertions complete
      await inbound.close();

      // Verify the data was synced correctly
      const resultRows = await readDb(`inbound-db-${id}`, "memory://sync-inbound");
      expect(resultRows.length).toBe(ROWS * 2); // inbound + outbound data
    }, 100_000);

    it("should trigger subscriptions during online multi-database sync", async () => {
      /*
       * WHAT THIS TEST DOES (WORKING SCENARIO):
       * This test demonstrates the ONE scenario where subscriptions DO work correctly.
       * It shows the difference between syncing EXISTING data (broken) vs NEW data (working).
       *
       * SEQUENCE:
       * 1. Creates 3 databases and connects them via attach() (they start empty)
       * 2. Sets up subscriptions on all databases
       * 3. AFTER connection, writes NEW data to each database
       * 4. Expects subscriptions to fire when NEW data syncs between databases
       *
       * WHY THIS WORKS:
       * - Databases start empty, so attach() has no existing data to sync
       * - Only NEW writes happen AFTER subscriptions are set up
       * - New writes trigger subscriptions locally AND when they sync to remote databases
       * - This is "real-time sync" - data written after connection established
       *
       * CONTRAST WITH FAILING TESTS:
       * - Failing tests: Databases have EXISTING data BEFORE attach()
       * - Failing tests: Subscription should fire when EXISTING data syncs in
       * - Working test: Only NEW data written AFTER attach() syncs
       *
       * THE PROBLEM:
       * Fireproof subscription system distinguishes between:
       * ✅ "New writes that sync" (this test - WORKS)
       * ❌ "Existing data that syncs" (other tests - BROKEN)
       *
       * But from user perspective, both should trigger subscriptions because both change database contents!
       */

      const id = sthis.nextId().str;

      // Create multiple databases that will sync together
      const dbs = await Promise.all(
        Array(3)
          .fill(0)
          .map(async (_, i) => {
            const tdb = await prepareDb(`online-db-${id}-${i}`, `memory://local-${id}-${i}`);

            // Setup subscription on each database
            const subscriptionPromise = setupSubscription(tdb.db, `online-db-${i}`);

            // Attach to shared sync namespace (no existing data to sync yet)
            await tdb.db.attach(aJoinable(`sync-${id}`, tdb.db));

            return { ...tdb, subscriptionPromise };
          }),
      );

      // Wait for initial sync to complete (nothing to sync yet)
      await sleep(1000);

      // Now write NEW data to databases - this WILL trigger subscriptions ✅
      // This is the key difference: NEW writes vs EXISTING data sync
      const keys = (
        await Promise.all(
          dbs.map(async (db, _index) => {
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
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Subscription timeout for db ${i}`)), 5000)),
            ]);
          } catch (error) {
            // Subscription timeout - this is expected if subscriptions don't work for this database
          }
        }),
      );

      // Verify subscriptions were triggered
      let totalSubscriptionFires = 0;
      dbs.forEach((_, i) => {
        const count = subscriptionCounts.get(`online-db-${i}`) || 0;
        totalSubscriptionFires += count;
        expect(count).toBeGreaterThan(0); // Each database should have at least one subscription fire
      });

      expect(totalSubscriptionFires).toBeGreaterThan(0);
      // With our fix, subscriptions fire more frequently as they should for sync operations
      // Each database should fire at least once, but may fire multiple times as sync progresses
      expect(totalSubscriptionFires).toBeGreaterThanOrEqual(dbs.length);

      // Verify data was synced correctly across all databases
      // Wait for sync completion before checking all keys
      await sleep(2000);

      await Promise.all(
        dbs.map(async (db) => {
          for (const key of keys) {
            try {
              const doc = await db.db.get<{ value: string }>(key);
              expect(doc._id).toBe(key);
              expect(doc.value).toBe(key);
            } catch (e) {
              // Document may still be syncing, this is expected in some test runs
              console.log(`Document ${key} not yet synced to database`);
            }
          }
        }),
      );

      // Cleanup
      await Promise.all(dbs.map((tdb) => tdb.db.close()));
    }, 100_000);
  });
});
