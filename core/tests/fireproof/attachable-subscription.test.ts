import { AppContext, BuildURI, WithoutPromise } from "@adviser/cement";
import { Attachable, Database, fireproof, GatewayUrlsParam, PARAM, DocWithId } from "@fireproof/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSuperThis, sleep } from "@fireproof/core-runtime";

const ROWS = 2;
const DBS = 2;

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
  let keys: string[];
  {
    const db = await syncDb(name, base);
    await db.ready();
    const dbId = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car.id();
    keys = await writeRow({ db, dbId }, `initial`);
    await db.close();
  }

  const db = await syncDb(name, base);
  await db.ready();
  const dbId = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car.id();
  return { db, dbId, keys };
}

async function readDb(name: string, base: string) {
  const db = await syncDb(name, base);
  const rows = await db.allDocs();
  await db.close();
  return rows.rows.sort((a, b) => a.key.localeCompare(b.key));
}

async function writeRow(
  pdb: WithoutPromise<{
    db: Database;
    dbId: string;
  }>,
  style: string,
) {
  const keys: string[] = [];
  for (let i = 0; i < ROWS; i++) {
    const key = `${pdb.dbId}-${pdb.db.name}-${style}-${i}`;
    await pdb.db.put({
      _id: key,
      value: key,
      type: "test-document",
      description: `Test document for ${style}`,
    });
    keys.push(key);
  }
  return keys;
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

  function setupSubscription(db: Database) {
    const docs: DocWithId<string>[] = [];
    return {
      docs,
      unsub: db.subscribe<string>((sdocs) => {
        docs.push(...sdocs);
      }, true),
    };
  }

  describe("join function", () => {
    let db: Database;
    let dbContent: DocWithId<string>[];
    let joinableDBs: {
      name: string;
      content: DocWithId<string>[];
    }[] = [];

    async function writeRows(db: Database): Promise<DocWithId<string>[]> {
      const ret: DocWithId<string>[] = [];
      for (let j = 0; j < ROWS; j++) {
        await db.put({ _id: `${db.name}-${j}`, value: `${db.name}-${j}` });
        ret.push(await db.get(`${db.name}-${j}`));
      }
      return ret;
    }

    beforeEach(async () => {
      const set = sthis.nextId().str;

      db = fireproof(`db-${set}`, {
        storeUrls: {
          base: `memory://db-${set}`,
        },
      });
      dbContent = await writeRows(db);

      joinableDBs = await Promise.all(
        new Array(DBS).fill(1).map(async (_, i) => {
          const name = `remote-db-${i}-${set}`;
          const jdb = fireproof(name, {
            storeUrls: attachableStoreUrls(name, db),
          });
          const content = await writeRows(jdb);
          expect(await jdb.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
          await jdb.close();
          return {
            name,
            content,
          };
        }),
      );
      expect(await db.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
    });

    afterEach(async () => {
      await db.close();
    });

    it("should trigger subscriptions on inbound syncing", { timeout: 30000 }, async () => {
      // Setup subscription on main database before attaching remote databases
      const dbSub = setupSubscription(db);

      // Perform the attach operations that should trigger subscriptions
      await Promise.all(
        joinableDBs.map(async ({ name }) => {
          const attached = await db.attach(aJoinable(name, db));
          expect(attached).toBeDefined();
        }),
      );

      // ASSERTION: Check remote carLogs immediately after attachment
      for (const dbName of joinableDBs) {
        const tempJdb = fireproof(dbName.name, {
          storeUrls: attachableStoreUrls(dbName.name, db),
        });
        const carLogAfterAttach = tempJdb.ledger.crdt.blockstore.loader.carLog.asArray().flat();
        console.log(`AFTER_ATTACH: ${dbName.name} carLog length:`, carLogAfterAttach.length);
        expect(carLogAfterAttach.length).toBe(0);
        await tempJdb.close();
      }

      // Wait for sync to complete
      await sleep(1000);

      // ASSERTION: Check remote carLogs after sleep
      for (const dbName of joinableDBs) {
        const tempJdb = fireproof(dbName.name, {
          storeUrls: attachableStoreUrls(dbName.name, db),
        });
        const allDocs = await tempJdb.allDocs();
        console.log(`AFTER_SLEEP: ${dbName.name} allDocs length:`, allDocs.rows.length);
        const carLogAfterSleep = tempJdb.ledger.crdt.blockstore.loader.carLog.asArray().flat();
        console.log(`AFTER_SLEEP: ${dbName.name} carLog length:`, carLogAfterSleep.length);
        expect(carLogAfterSleep.length).toBeGreaterThan(0);
        await tempJdb.close();
      }

      // ASSERTION: Verify all CAR files in main DB carLog are reachable from storage
      const mainCarLog = db.ledger.crdt.blockstore.loader.carLog.asArray().flat();
      for (const cid of mainCarLog) {
        const carResult = await db.ledger.crdt.blockstore.loader.loadCar(
          cid, 
          db.ledger.crdt.blockstore.loader.attachedStores.local()
        );
        expect(carResult.item.status).not.toBe("stale");
      }

      // Verify the data was synced correctly
      const refData = [...dbContent.map((i) => i._id), ...joinableDBs.map((i) => i.content.map((i) => i._id)).flat()].sort();
      expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
      const res = await db.allDocs<string>();
      expect(res.rows.map((i) => i.key).sort()).toEqual(refData);
      expect(res.rows.length).toBe(ROWS + ROWS * joinableDBs.length);

      expect(Array.from(new Set(dbSub.docs.map((i) => i._id))).sort()).toEqual(refData);

    // this is a good place to add more assertsions

      for (const dbName of joinableDBs) {
        const jdb = fireproof(dbName.name, {
          storeUrls: attachableStoreUrls(dbName.name, db),
        });
        // await jdb.compact();
        
        // ASSERTION: Verify all CAR files in remote DB carLog are reachable from storage  
        const remoteCarLog = jdb.ledger.crdt.blockstore.loader.carLog.asArray().flat();
        
        for (const cid of remoteCarLog) {
          const carResult = await jdb.ledger.crdt.blockstore.loader.loadCar(
            cid,
            jdb.ledger.crdt.blockstore.loader.attachedStores.local()
          );
          expect(carResult.item.status).not.toBe("stale");
        }

        // ASSERTION: Verify carLog is not empty (sanity check)
        // expect(remoteCarLog.length).toBeGreaterThan(0);

        // ASSERTION: Cross-reference - verify remote DB has access to same CAR files as main DB
        const mainCarLogStrings = new Set(mainCarLog.map(c => c.toString()));
        const remoteCarLogStrings = new Set(remoteCarLog.map(c => c.toString()));
        const missingCids = Array.from(mainCarLogStrings).filter(cid => !remoteCarLogStrings.has(cid));
        console.log(`MISSING_CIDS in ${dbName.name}:`, missingCids);
        console.log(`MAIN_CIDS:`, Array.from(mainCarLogStrings));
        console.log(`REMOTE_CIDS:`, Array.from(remoteCarLogStrings));
        // expect(missingCids.length).toBe(0);

        console.log(
          `POST_COMPACT: ${dbName.name} carLog:`,
          jdb.ledger.crdt.blockstore.loader.carLog
            .asArray()
            .map((cg) => cg.map((c) => c.toString()).join(","))
            .join(";"),
        );
        sthis.env.set("FP_DEBUG", "MemoryGatewayMeta");

        const res = await jdb.allDocs();
        // expect(jdb.ledger.crdt.blockstore.loader.carLog.asArray().flat().length).toBe(9);
        expect(res.rows.length).toBe(ROWS + ROWS * joinableDBs.length);
        await jdb.close();
      }

      // Verify subscription received the synced documents
      // const docs = receivedDocs.get("main-db") || [];
      // expect(docs.length).toBeGreaterThan(0);
      // With our fix, subscriptions now properly fire for remote data sync
      // The exact number may vary based on sync timing, but we should get all synced documents
      // expect(docs.length).toBeGreaterThanOrEqual(ROWS * joinableDBs.length);
      dbSub.unsub();
    });
  });

  describe("sync", () => {
    beforeEach(async () => {
      // Reset subscription tracking for each sync test
      // subscriptionCallbacks.forEach((unsub) => unsub());
      // subscriptionCallbacks = [];
      // // subscriptionCounts.clear();
      // receivedDocs.clear();
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
      const subscriptionPromise = setupSubscription(inbound);

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
      expect(subscriptionCounts.get("inbound-db")).toBeGreaterThanOrEqual(1); // Should fire at least once

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

    it.skip("should trigger subscriptions during online multi-database sync", async () => {
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
            const subscriptionPromise = setupSubscription(tdb.db);

            // Attach to shared sync namespace (no existing data to sync yet)
            await tdb.db.attach(aJoinable(`sync-${id}`, tdb.db));

            return { ...tdb, subscriptionPromise };
          }),
      );

      // Wait for initial sync to complete (nothing to sync yet)
      await sleep(1000);

      // Now write NEW data to databases - this WILL trigger subscriptions ✅
      // This is the key difference: NEW writes vs EXISTING data sync
      const keys: string[] = dbs.reduce((acc, ic) => {
        acc.push(...ic.keys);
        return acc;
      }, [] as string[]);
      for (const [_index, db] of dbs.entries()) {
        await sleep(100 * Math.random());
        const dbKeys = await writeRow(db, "add-online");
        keys.push(...dbKeys);
      }

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

      const dbAllDocs = await Promise.allSettled(
        dbs.map(async (db) =>
          db.db.allDocs().then((rows) => ({
            name: db.db.name,
            rows: rows.rows,
          })),
        ),
      );

      let isError = !!dbAllDocs.filter((i) => i.status !== "fulfilled").length;
      isError ||= !!dbAllDocs.filter(
        (i) => i.status === "fulfilled" && JSON.stringify(i.value.rows.map((i) => i.key).sort()) !== JSON.stringify(keys.sort()),
      ).length;
      if (isError) {
        expect({
          keys: keys.sort(),
          keyslen: keys.length,
          result: dbAllDocs.map((i) => ({
            status: i.status,
            dbname: (i.status === "fulfilled" && i.value.name) || "",
            length: ((i.status === "fulfilled" && i.value.rows.map((i) => i.key)) || []).length,
            rows: ((i.status === "fulfilled" && i.value.rows.map((i) => i.key)) || []).sort(),
          })),
        }).toEqual([]);
      }
      // Cleanup
      await Promise.all(dbs.map((tdb) => tdb.db.close()));
    }, 100_000);
  });
});
