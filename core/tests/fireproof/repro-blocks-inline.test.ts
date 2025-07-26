import { Database, DocWithId, fireproof, CompactionMode } from "@fireproof/core";
import { describe, it, expect } from "vitest";

interface Record {
  id: string;
  type: string;
  createdAt: string;
}

async function findAll(db: Database): Promise<Record[]> {
  const result = await db.query(
    (doc: DocWithId<Record>) => {
      if (doc.type === "CustomPropertyDefinition" && doc.createdAt && doc._deleted !== true) {
        return doc.createdAt;
      }
    },
    { descending: true },
  );
  return result.rows
    .filter((row) => row.doc) // Filter out any rows without documents
    .map((row) => row.doc as Record);
}

const numberOfDocs = 100;

async function writeSampleData(db: Database): Promise<void> {
  console.log("start puts");
  for (let i = 10; i < numberOfDocs; i++) {
    const record: DocWithId<Record> = {
      _id: `record-${i}`,
      id: `record-${i}`,
      type: "CustomPropertyDefinition",
      createdAt: new Date().toISOString(),
    };
    await db.put(record);
  }
  console.log("start dels");
  for (let i = 10; i < numberOfDocs; i += 10) {
    await db.del(`record-${i}`);
  }
}

async function runReproBlocksOnce(iter: number, compactionMode?: typeof CompactionMode.FULL) {
  const db = fireproof(`test-db-inline-${iter}-${Date.now()}`, {
    compactionMode,
  });

  await writeSampleData(db);

  const all = await db.allDocs<Record>();
  const records = await findAll(db);

  console.log(`repro-blocks inline run ${iter}: Found records:`, all.rows.length, records.length);
  expect(all.rows.length).toBe(81); // 90 puts - 9 deletes = 81
  expect(records.length).toBe(81);

  // Clean up the database after the test
  await db.destroy();
}

// Test both compaction modes in a single test process
describe("repro-blocks inline regression test", () => {
  it(
    "runs with fireproof-default compaction mode",
    async () => {
      for (let i = 1; i <= 3; i++) {
        await runReproBlocksOnce(i, undefined);
      }
    },
    2 * 60 * 1000, // 2 minutes
  );

  it(
    "runs with full compaction mode",
    async () => {
      for (let i = 1; i <= 3; i++) {
        await runReproBlocksOnce(i, CompactionMode.FULL);
      }
    },
    2 * 60 * 1000, // 2 minutes
  );
});
