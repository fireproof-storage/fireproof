/**
 * One-Way Sync Reliability Tests
 *
 * This file focuses exclusively on testing the reliability of one-way sync
 * across different configurations and scenarios in Fireproof.
 */

import { AppContext, BuildURI } from "@adviser/cement";
import { Attachable, Database, ensureSuperThis, fireproof, GatewayUrlsParam, PARAM, sleep } from "@fireproof/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Define document type for testing
interface TestDocument {
  _id: string;
  value: string;
  source?: string;
  timestamp?: number;
  counter?: number;
}

// Constants for test configuration
const SHORT_TIMEOUT = 1000; // 1 second
const MEDIUM_TIMEOUT = 3000; // 3 seconds
const LONG_TIMEOUT = 7000; // 7 seconds
const VERY_LONG_TIMEOUT = 15000; // 15 seconds

// Success tracking for each test scenario
const results: Record<string, { success: number; total: number }> = {};

/**
 * Records test outcomes for analysis
 */
function trackResult(scenario: string, success: boolean) {
  if (!results[scenario]) {
    results[scenario] = { success: 0, total: 0 };
  }

  if (success) {
    results[scenario].success++;
  }
  results[scenario].total++;

  console.log(
    `[${scenario}] ${success ? "✅ PASS" : "❌ FAIL"} (${results[scenario].success}/${results[scenario].total} - ${Math.round((results[scenario].success / results[scenario].total) * 100)}%)`,
  );
}

/**
 * Standard Attachable implementation used for testing
 */
class StandardAttachable implements Attachable {
  readonly name: string;
  readonly db: Database;

  constructor(name: string, db: Database) {
    this.name = name;
    this.db = db;
  }

  async configHash() {
    return `sync-joinable-${this.name}`;
  }

  prepare(): Promise<GatewayUrlsParam> {
    // Use the database's original key parameters for sync
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

/**
 * Key-sharing attachable that uses explicit shared keys
 */
function createSharedKeyAttachable(name: string, sharedKey: string): Attachable {
  return {
    name,
    configHash: async () => `sync-joinable-${name}`,
    prepare: () =>
      Promise.resolve({
        car: {
          url: BuildURI.from(`memory://car/${name}`).setParam(PARAM.STORE_KEY, sharedKey).setParam(PARAM.SELF_REFLECT, "x"),
        },
        meta: {
          url: BuildURI.from(`memory://meta/${name}`).setParam(PARAM.STORE_KEY, sharedKey).setParam(PARAM.SELF_REFLECT, "x"),
        },
        file: {
          url: BuildURI.from(`memory://file/${name}`).setParam(PARAM.STORE_KEY, sharedKey).setParam(PARAM.SELF_REFLECT, "x"),
        },
      }),
  };
}

async function createDatabase(dbName: string, baseUrl: string): Promise<Database> {
  console.log(`Creating database: ${dbName} with baseUrl: ${baseUrl}`);
  const db = fireproof(dbName, {
    storeUrls: {
      base: baseUrl,
    },
    ctx: AppContext.merge({ base: baseUrl }),
  });
  await db.ready();
  return db;
}

async function writeDocument(db: Database, docId: string, source: string, counter: number = 0): Promise<TestDocument> {
  const timestamp = Date.now();
  const doc: TestDocument = {
    _id: docId,
    value: `${source}-value-${timestamp}`,
    source,
    timestamp,
    counter,
  };
  await db.put(doc);
  return doc;
}

async function verifyDocument(db: Database, doc: TestDocument): Promise<boolean> {
  try {
    const retrievedDoc = (await db.get(doc._id)) as TestDocument;
    const isMatch =
      retrievedDoc._id === doc._id &&
      retrievedDoc.value === doc.value &&
      retrievedDoc.source === doc.source &&
      retrievedDoc.timestamp === doc.timestamp;

    return isMatch;
  } catch (e) {
    return false;
  }
}

/**
 * One-Way Sync Reliability Scenarios
 * Testing which scenarios reliably sync in one direction
 */
describe("One-Way Sync Reliability Tests", () => {
  const sthis = ensureSuperThis();
  let sourceDB: Database;
  let targetDB: Database;
  let syncKey: string;

  beforeEach(async () => {
    syncKey = `sync-key-${sthis.nextId().str}`;
    const sourceDBName = `source-db-${sthis.nextId().str}`;
    const targetDBName = `target-db-${sthis.nextId().str}`;

    sourceDB = await createDatabase(sourceDBName, `memory://source-${syncKey}`);
    targetDB = await createDatabase(targetDBName, `memory://target-${syncKey}`);
  });

  afterEach(async () => {
    await sourceDB?.close();
    await targetDB?.close();
  });

  describe("Basic Sync Configurations", () => {
    /**
     * SCENARIO 1: Source connects, writes, then target connects
     * This is the most common one-way sync pattern
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] Source connects first, writes, then target connects (standard order)`, async () => {
        // 1. Source connects
        await sourceDB.attach(new StandardAttachable(syncKey, sourceDB));

        // 2. Source writes document
        const doc = await writeDocument(sourceDB, `standard-order-${Date.now()}`, "source", i);

        // 3. Target connects
        await targetDB.attach(new StandardAttachable(syncKey, targetDB));

        // 4. Wait for sync
        await sleep(MEDIUM_TIMEOUT);

        // 5. Verify target received document
        const success = await verifyDocument(targetDB, doc);

        // Record result
        trackResult("standard-order", success);

        // Assert
        expect(success).toBe(true);
      });
    }

    /**
     * SCENARIO 2: Target connects first, then source connects and writes
     * Tests if sync works when receiver connects first
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] Target connects first, then source connects and writes (reverse order)`, async () => {
        // 1. Target connects first
        await targetDB.attach(new StandardAttachable(syncKey, targetDB));

        // 2. Source connects
        await sourceDB.attach(new StandardAttachable(syncKey, sourceDB));

        // 3. Source writes document
        const doc = await writeDocument(sourceDB, `reverse-order-${Date.now()}`, "source", i);

        // 4. Wait for sync
        await sleep(MEDIUM_TIMEOUT);

        // 5. Verify target received document
        const success = await verifyDocument(targetDB, doc);

        // Record result
        trackResult("reverse-order", success);

        // Assert
        expect(success).toBe(true);
      });
    }

    /**
     * SCENARIO 3: Both connect simultaneously, source writes
     * Tests concurrent connection behavior
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] Both connect simultaneously, then source writes (concurrent connection)`, async () => {
        // 1. Both connect simultaneously
        await Promise.all([
          sourceDB.attach(new StandardAttachable(syncKey, sourceDB)),
          targetDB.attach(new StandardAttachable(syncKey, targetDB)),
        ]);

        // 2. Source writes document
        const doc = await writeDocument(sourceDB, `concurrent-connection-${Date.now()}`, "source", i);

        // 3. Wait for sync
        await sleep(MEDIUM_TIMEOUT);

        // 4. Verify target received document
        const success = await verifyDocument(targetDB, doc);

        // Record result
        trackResult("concurrent-connection", success);

        // Assert
        expect(success).toBe(true);
      });
    }
  });

  describe("Timing Variations", () => {
    /**
     * SCENARIO 4: With short timeout
     * Tests if sync works with minimal wait time
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] With short timeout (${SHORT_TIMEOUT}ms)`, async () => {
        // 1. Source connects
        await sourceDB.attach(new StandardAttachable(syncKey, sourceDB));

        // 2. Source writes document
        const doc = await writeDocument(sourceDB, `short-timeout-${Date.now()}`, "source", i);

        // 3. Target connects
        await targetDB.attach(new StandardAttachable(syncKey, targetDB));

        // 4. Wait for sync - SHORT timeout
        await sleep(SHORT_TIMEOUT);

        // 5. Verify target received document
        const success = await verifyDocument(targetDB, doc);

        // Record result
        trackResult("short-timeout", success);

        // Assert
        expect(success).toBe(true);
      });
    }

    /**
     * SCENARIO 5: With long timeout
     * Tests if sync works with extended wait time
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] With long timeout (${LONG_TIMEOUT}ms)`, async () => {
        // 1. Source connects
        await sourceDB.attach(new StandardAttachable(syncKey, sourceDB));

        // 2. Source writes document
        const doc = await writeDocument(sourceDB, `long-timeout-${Date.now()}`, "source", i);

        // 3. Target connects
        await targetDB.attach(new StandardAttachable(syncKey, targetDB));

        // 4. Wait for sync - LONG timeout
        await sleep(LONG_TIMEOUT);

        // 5. Verify target received document
        const success = await verifyDocument(targetDB, doc);

        // Record result
        trackResult("long-timeout", success);

        // Assert
        expect(success).toBe(true);
      });
    }
  });

  describe("Connection Patterns", () => {
    /**
     * SCENARIO 6: Source writes, disconnects, target connects
     * Tests if data persists through disconnection
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] Source writes, disconnects, target connects (disconnection)`, async () => {
        // 1. Source connects
        await sourceDB.attach(new StandardAttachable(syncKey, sourceDB));

        // 2. Source writes document
        const doc = await writeDocument(sourceDB, `disconnection-${Date.now()}`, "source", i);

        // 3. Source disconnects
        await sourceDB.close();
        sourceDB = await createDatabase(`source-reconnect-${sthis.nextId().str}`, `memory://source-${syncKey}`);

        // 4. Target connects
        await targetDB.attach(new StandardAttachable(syncKey, targetDB));

        // 5. Wait for sync
        await sleep(MEDIUM_TIMEOUT);

        // 6. Verify target received document
        const success = await verifyDocument(targetDB, doc);

        // Record result
        trackResult("disconnection", success);

        // Assert
        expect(success).toBe(true);
      });
    }

    /**
     * SCENARIO 7: Using shared explicit key
     * Tests if explicitly shared keys improve reliability
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] Using shared explicit key (explicit-key)`, async () => {
        // Use explicit shared key
        const sharedKey = `explicit-shared-key-${Date.now()}`;

        // 1. Source connects with shared key
        await sourceDB.attach(createSharedKeyAttachable(syncKey, sharedKey));

        // 2. Source writes document
        const doc = await writeDocument(sourceDB, `explicit-key-${Date.now()}`, "source", i);

        // 3. Target connects with same shared key
        await targetDB.attach(createSharedKeyAttachable(syncKey, sharedKey));

        // 4. Wait for sync
        await sleep(MEDIUM_TIMEOUT);

        // 5. Verify target received document
        const success = await verifyDocument(targetDB, doc);

        // Record result
        trackResult("explicit-key", success);

        // Assert
        expect(success).toBe(true);
      });
    }
  });

  describe("Multiple Document Patterns", () => {
    /**
     * SCENARIO 8: Source writes multiple documents sequentially
     * Tests sync with sequential writes
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] Source writes multiple documents sequentially (sequential-writes)`, async () => {
        // 1. Source connects
        await sourceDB.attach(new StandardAttachable(syncKey, sourceDB));

        // 2. Target connects
        await targetDB.attach(new StandardAttachable(syncKey, targetDB));

        // 3. Source writes multiple documents sequentially
        const docs = [];
        for (let j = 0; j < 3; j++) {
          const doc = await writeDocument(sourceDB, `sequential-${i}-${j}-${Date.now()}`, "source", j);
          docs.push(doc);

          // Small delay between writes
          await sleep(200);
        }

        // 4. Wait for sync
        await sleep(MEDIUM_TIMEOUT);

        // 5. Verify all documents synced
        const results = await Promise.all(docs.map((doc) => verifyDocument(targetDB, doc)));

        const allSynced = results.every(Boolean);

        // Record result
        trackResult("sequential-writes", allSynced);

        // Assert
        expect(allSynced).toBe(true);
      });
    }

    /**
     * SCENARIO 9: Source writes multiple documents in parallel
     * Tests sync with concurrent writes
     */
    for (let i = 0; i < 5; i++) {
      it(`[Run ${i + 1}] Source writes multiple documents in parallel (parallel-writes)`, async () => {
        // 1. Source connects
        await sourceDB.attach(new StandardAttachable(syncKey, sourceDB));

        // 2. Target connects
        await targetDB.attach(new StandardAttachable(syncKey, targetDB));

        // 3. Source writes multiple documents in parallel
        const docs = await Promise.all(
          Array(3)
            .fill(0)
            .map((_, j) => writeDocument(sourceDB, `parallel-${i}-${j}-${Date.now()}`, "source", j)),
        );

        // 4. Wait for sync
        await sleep(MEDIUM_TIMEOUT);

        // 5. Verify all documents synced
        const results = await Promise.all(docs.map((doc) => verifyDocument(targetDB, doc)));

        const allSynced = results.every(Boolean);

        // Record result
        trackResult("parallel-writes", allSynced);

        // Assert
        expect(allSynced).toBe(true);
      });
    }
  });

  // Display reliability summary after all tests
  afterAll(() => {
    console.log("\n--- ONE-WAY SYNC RELIABILITY SUMMARY ---");
    Object.entries(results)
      .sort((a, b) => {
        // Sort by success rate (descending)
        const rateA = a[1].success / a[1].total;
        const rateB = b[1].success / b[1].total;
        return rateB - rateA;
      })
      .forEach(([scenario, stats]) => {
        const successRate = Math.round((stats.success / stats.total) * 100);
        const reliability =
          successRate >= 90
            ? "HIGHLY RELIABLE"
            : successRate >= 70
              ? "MOSTLY RELIABLE"
              : successRate >= 50
                ? "MODERATELY RELIABLE"
                : successRate >= 30
                  ? "UNRELIABLE"
                  : "HIGHLY UNRELIABLE";

        console.log(`${scenario}: ${stats.success}/${stats.total} (${successRate}%) - ${reliability}`);
      });
  });
});
