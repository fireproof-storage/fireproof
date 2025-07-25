import { Database, DocResponse, DocWithId, fireproof } from "@fireproof/core";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { describe, beforeEach, it, expect, afterEach, afterAll } from "vitest";

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

async function writeSampleData(numberOfDocs: number, db: Database): Promise<number> {
  const results: DocResponse[] = [];
  for (let i = 0; i < numberOfDocs; i++) {
    const record: Record = {
      // _id: `record-${i}`,
      id: `record-${i}`,
      type: "CustomPropertyDefinition",
      createdAt: new Date().toISOString(),
    };
    results.push(await db.put(record));
  }
  let remove = 0;
  for (let i = 0; i < numberOfDocs; i += ~~(numberOfDocs / 10)) {
    await db.del(results[i].id);
    remove++;
  }
  return numberOfDocs - remove;
}

describe.skip("repro-blocks", () => {
  const numberOfDocs = 101; // better a prime number
  const sthis = ensureSuperThis();
  const dbName = `repro-blocks-${sthis.nextId().str}`;
  let db: Database;
  beforeEach(() => {
    db = fireproof(dbName, {
      autoCompact: numberOfDocs / 3,
      compact: null,
    });
  });

  it.each(new Array(30).fill(0).map((_, i) => i))("try-again", async () => {
    const preAll = await db.allDocs<Record>();
    const addedRows = await writeSampleData(numberOfDocs, db);
    const postAll = await db.allDocs<Record>();
    const records = await findAll(db);
    console.log("addedRows", addedRows, "preAll", preAll.rows.length, "postAll", postAll.rows.length, "records", records.length);
    expect(preAll.rows.length + addedRows).toBe(postAll.rows.length);
    expect(records.length).toBe(postAll.rows.length);
  });

  afterEach(async () => {
    await db.close();
  });

  afterAll(async () => {
    await db.destroy();
  });
});
