import { describe, it } from "vitest";
import { Database, DocWithId, fireproof } from "@fireproof/core";

// Skip this entire suite when running inside a browser-like Vitest environment
const isNode = typeof process !== "undefined" && !!process.versions?.node;
const describeFn = isNode ? describe : describe.skip;

/* eslint-disable no-console */

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

async function runReproBlocksOnce(iter: number) {
  const db = fireproof(`test-db-${iter}`);

  await writeSampleData(db);

  const all = await db.allDocs<Record>();
  const records = await findAll(db);

  console.log(`repro-blocks run ${iter}: Found records:`, all.rows.length, records.length);
  console.log(`repro-blocks run ${iter}: ok`); // useful in CI logs

  // Clean up the database after the test
  await db.destroy();
}

describeFn("repro-blocks regression test", () => {
  it(
    "runs 10 consecutive times without compaction errors",
    async () => {
      for (let i = 1; i <= 10; i++) {
        await runReproBlocksOnce(i);
      }
    },
    5 * 60 * 1000, // allow up to 5 minutes – heavy disk workload
  );
});
