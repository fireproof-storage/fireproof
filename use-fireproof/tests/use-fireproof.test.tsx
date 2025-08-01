import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireproof, useFireproof } from "../index.js";
import type { Database, DocResponse, LiveQueryResult, UseDocumentResult } from "../index.js";

const TEST_TIMEOUT = 45000;

describe("HOOK: useFireproof", () => {
  it(
    "should be defined",
    () => {
      expect(useFireproof).toBeDefined();
    },
    TEST_TIMEOUT,
  );

  it(
    "renders the hook correctly and checks types",
    () => {
      renderHook(() => {
        const { database, useLiveQuery, useDocument } = useFireproof("dbname");
        expect(typeof useLiveQuery).toBe("function");
        expect(typeof useDocument).toBe("function");
        expect(database?.constructor.name).toMatch(/^Database/);
      });
    },
    TEST_TIMEOUT,
  );
});

describe("HOOK: useFireproof useLiveQuery has results", () => {
  const dbName = "useLiveQueryHasResults";
  let db: Database,
    query: LiveQueryResult<{ foo: string }, string>,
    database: ReturnType<typeof useFireproof>["database"],
    useLiveQuery: ReturnType<typeof useFireproof>["useLiveQuery"];

  beforeEach(async () => {
    const expectedValues = ["aha", "bar", "caz"];
    db = fireproof(dbName);
    for (const value of expectedValues) {
      await db.put({ foo: value });
    }

    const allDocs = await db.allDocs<{ foo: string }>();
    expect(allDocs.rows.map((row) => row.value.foo)).toEqual(expectedValues);
  });

  it(
    "queries correctly",
    async () => {
      renderHook(() => {
        const result = useFireproof(dbName);
        database = result.database;
        useLiveQuery = result.useLiveQuery;
        query = useLiveQuery<{ foo: string }>("foo");
      });

      await waitFor(() => {
        expect(query.rows.map((row) => row.doc?.foo)).toEqual(["aha", "bar", "caz"]);
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database?.close();
    await database?.destroy();
  });
});

describe("HOOK: useFireproof useDocument has results", () => {
  const dbName = "useDocumentHasResults";
  let db: Database,
    docResult: UseDocumentResult<{ input: string }>,
    database: ReturnType<typeof useFireproof>["database"],
    useDocument: ReturnType<typeof useFireproof>["useDocument"];

  beforeEach(async () => {
    db = fireproof(dbName);

    renderHook(() => {
      const result = useFireproof(dbName);
      database = result.database;
      useDocument = result.useDocument;
      docResult = useDocument<{ input: string }>({ input: "" });
    });
  });

  it(
    "should have empty setup data",
    async () => {
      const allDocs = await db.allDocs<{ input: string }>();
      expect(allDocs.rows.length).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "queries correctly",
    async () => {
      await waitFor(() => {
        expect(docResult.doc.input).toBe("");
        expect(docResult.doc._id).toBeUndefined();
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles mutations correctly",
    async () => {
      docResult.merge({ input: "new" });
      await waitFor(() => {
        expect(docResult.doc.input).toBe("new");
        expect(docResult.doc._id).toBeUndefined();
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles save correctly",
    async () => {
      docResult.merge({ input: "first" });
      await waitFor(() => {
        expect(docResult.doc.input).toBe("first");
        expect(docResult.doc._id).toBeUndefined();
      });

      renderHook(() => {
        docResult.save();
      });

      await waitFor(() => {
        expect(docResult.doc._id).toBeDefined();
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles reset after save",
    async () => {
      // Create a document with input "first" to ensure it exists in the database
      await db.put({ input: "first" });

      docResult.merge({ input: "new" });
      await waitFor(() => {
        expect(docResult.doc.input).toBe("new");
        expect(docResult.doc._id).toBeUndefined();
      });

      renderHook(() => {
        docResult.save();
      });

      await waitFor(() => {
        expect(docResult.doc._id).toBeDefined();
      });

      const doc1 = await db.get<{ input: string }>(docResult.doc._id);
      expect(doc1.input).toBe("new");

      renderHook(() => {
        docResult.reset();
      });

      await waitFor(() => {
        expect(docResult.doc.input).toBe("");
        expect(docResult.doc._id).toBeUndefined();
      });

      renderHook(() => {
        docResult.merge({ input: "fresh" });
      });

      renderHook(() => {
        docResult.save();
      });

      await waitFor(() => {
        expect(docResult.doc.input).toBe("fresh");
        expect(docResult.doc._id).toBeDefined();
      });

      const doc2 = await db.get<{ input: string }>(docResult.doc._id);
      expect(doc2.input).toBe("fresh");
      expect(doc2._id).toBe(docResult.doc._id);
      expect(doc1._id).not.toBe(doc2._id);

      const allDocs = await db.allDocs<{ input: string }>();
      const inputs = allDocs.rows.map((r) => r.value.input);
      expect(inputs).toEqual(expect.arrayContaining(["first", "new", "fresh"]));
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database.close();
    await database.destroy();
  });
});

describe("HOOK: useFireproof useDocument has results reset sync", () => {
  const dbName = "useDocumentHasResultsSync";
  let db: Database,
    docResult: UseDocumentResult<{ input: string }>,
    database: ReturnType<typeof useFireproof>["database"],
    useDocument: ReturnType<typeof useFireproof>["useDocument"];

  beforeEach(async () => {
    db = fireproof(dbName);

    renderHook(() => {
      const result = useFireproof(dbName);
      database = result.database;
      useDocument = result.useDocument;
      docResult = useDocument<{ input: string }>({ input: "" });
    });
  });

  it(
    "should have empty setup data",
    async () => {
      const allDocs = await db.allDocs<{ input: string }>();
      expect(allDocs.rows.length).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "queries correctly",
    async () => {
      await waitFor(() => {
        expect(docResult.doc.input).toBe("");
        expect(docResult.doc._id).toBeUndefined();
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles mutations correctly",
    async () => {
      docResult.merge({ input: "new" });
      await waitFor(() => {
        expect(docResult.doc.input).toBe("new");
        expect(docResult.doc._id).toBeUndefined();
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles save correctly",
    async () => {
      docResult.merge({ input: "first" });
      await waitFor(() => {
        expect(docResult.doc.input).toBe("first");
        expect(docResult.doc._id).toBeUndefined();
      });

      renderHook(() => {
        docResult.save();
      });

      await waitFor(() => {
        expect(docResult.doc._id).toBeDefined();
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles reset after save",
    async () => {
      // Create documents with input "first" and "new" to ensure they exist in the database
      await db.put({ input: "first" });
      await db.put({ input: "new" });

      docResult.merge({ input: "new" });
      await waitFor(() => {
        expect(docResult.doc.input).toBe("new");
        expect(docResult.doc._id).toBeUndefined();
      });

      renderHook(() => {
        docResult.save();
        docResult.reset();
      });

      await waitFor(() => {
        expect(docResult.doc.input).toBe("");
        expect(docResult.doc._id).toBeUndefined();
      });

      renderHook(() => {
        docResult.merge({ input: "fresh" });
      });

      let waitForSave: Promise<DocResponse>;
      renderHook(() => {
        waitForSave = docResult.save();
      });

      await waitFor(async () => {
        await waitForSave;
        expect(docResult.doc.input).toBe("fresh");
        expect(docResult.doc._id).toBeDefined();
      });

      const doc2 = await db.get<{ input: string }>(docResult.doc._id);
      expect(doc2.input).toBe("fresh");
      expect(doc2._id).toBe(docResult.doc._id);

      const allDocs = await db.allDocs<{ input: string }>();
      expect(allDocs.rows.length).toBe(4); // We now have 4 documents due to our explicit creation
      const inputs = allDocs.rows.map((r) => r.value.input);
      expect(inputs).toEqual(expect.arrayContaining(["first", "new", "fresh"]));
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database.close();
    await database.destroy();
  });
});

describe("HOOK: useFireproof useDocument with existing document has results", () => {
  const dbName = "useDocumentWithExistingDoc";
  let db: Database,
    docResult: UseDocumentResult<{ input: string }>,
    id: string,
    database: ReturnType<typeof useFireproof>["database"],
    useDocument: ReturnType<typeof useFireproof>["useDocument"];

  beforeEach(async () => {
    db = fireproof(dbName);
    const res = await db.put({ input: "initial" });
    id = res.id;

    renderHook(() => {
      const result = useFireproof(dbName);
      database = result.database;
      useDocument = result.useDocument;
      docResult = useDocument<{ input: string }>({ _id: id } as { _id: string; input: string });
    });
  });

  it(
    "should have setup data",
    async () => {
      const allDocs = await db.allDocs<{ input: string }>();
      expect(allDocs.rows.length).toBe(1);
      expect(allDocs.rows[0].value.input).toBe("initial");
      expect(allDocs.rows[0].key).toBe(id);
    },
    TEST_TIMEOUT,
  );

  it(
    "queries correctly",
    async () => {
      await waitFor(() => {
        expect(docResult.doc.input).toBe("initial");
        expect(docResult.doc._id).toBe(id);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles mutations correctly",
    async () => {
      // First verify initial state
      await waitFor(() => {
        expect(docResult.doc.input).toBe("initial");
        expect(docResult.doc._id).toBe(id);
      });

      // Run merge in hook context
      renderHook(() => {
        docResult.merge({ input: "new" });
      });

      // Then verify the mutation took effect
      await waitFor(() => {
        expect(docResult.doc.input).toBe("new");
        expect(docResult.doc._id).toBe(id);
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database.close();
    await database.destroy();
  });
});

describe("HOOK: useFireproof useDocument with existing document handles external updates", () => {
  const dbName = "useDocumentWithExternalUpdates";
  let db: Database,
    docResult: UseDocumentResult<{ input: string }>,
    id: string,
    database: ReturnType<typeof useFireproof>["database"],
    useDocument: ReturnType<typeof useFireproof>["useDocument"];

  beforeEach(async () => {
    db = fireproof(dbName);
    const res = await db.put({ input: "initial" });
    id = res.id;

    renderHook(() => {
      const result = useFireproof(dbName);
      database = result.database;
      useDocument = result.useDocument;
      docResult = useDocument<{ input: string }>({ _id: id } as { _id: string; input: string });
    });
  });

  it(
    "should have setup data",
    async () => {
      const allDocs = await db.allDocs<{ input: string }>();
      expect(allDocs.rows.length).toBe(1);
      expect(allDocs.rows[0].value.input).toBe("initial");
      expect(allDocs.rows[0].key).toBe(id);
    },
    TEST_TIMEOUT,
  );

  it(
    "queries correctly",
    async () => {
      await waitFor(() => {
        expect(docResult.doc.input).toBe("initial");
        expect(docResult.doc._id).toBe(id);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "handles mutations correctly",
    async () => {
      // First verify initial state
      await waitFor(() => {
        expect(docResult.doc.input).toBe("initial");
        expect(docResult.doc._id).toBe(id);
      });

      // Run merge in hook context
      renderHook(() => {
        // docResult.merge({ input: "new" });
        db.put({ _id: id, input: "external" });
      });

      // Then verify the mutation took effect
      await waitFor(() => {
        expect(docResult.doc.input).toBe("external");
        expect(docResult.doc._id).toBe(id);
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database.close();
    await database.destroy();
  });
});

describe("HOOK: useFireproof bug fix: once the ID is set, it can reset", () => {
  const dbName = "bugTestDocReset";
  let db: Database,
    docResult: UseDocumentResult<{ input: string }>,
    database: ReturnType<typeof useFireproof>["database"],
    useDocument: ReturnType<typeof useFireproof>["useDocument"];

  beforeEach(async () => {
    db = fireproof(dbName);

    renderHook(() => {
      const result = useFireproof(dbName);
      database = result.database;
      useDocument = result.useDocument;
      docResult = useDocument<{ input: string }>({ input: "" });
    });
  });

  it(
    "ensures save() then reset() yields an ephemeral doc (blank _id)",
    async () => {
      // Merge some changes
      docResult.merge({ input: "temp data" });
      await waitFor(() => {
        expect(docResult.doc.input).toBe("temp data");
        expect(docResult.doc._id).toBeUndefined();
      });

      // Save
      renderHook(() => {
        docResult.save();
        docResult.reset();
      });

      await waitFor(() => {
        expect(docResult.doc._id).toBeUndefined();
        expect(docResult.doc.input).toBe("");
      });

      renderHook(() => {
        docResult.merge({ input: "new temp data" });
      });

      let waitForSave: Promise<DocResponse>;
      renderHook(() => {
        waitForSave = docResult.save();
      });

      await waitFor(async () => {
        await waitForSave;
        expect(docResult.doc._id).toBeDefined();
        expect(docResult.doc.input).toBe("new temp data");
      });

      // Confirm it's actually in the DB
      const allDocs = await db.allDocs<{ input: string }>();
      expect(allDocs.rows.length).toBe(2);
      const docInputs = allDocs.rows.map((row) => row.value.input);
      expect(docInputs).toContain("temp data");
      expect(docInputs).toContain("new temp data");
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database.close();
    await database.destroy();
  });
});

describe("HOOK: useFireproof race condition: calling save() without await overwrites reset", () => {
  const dbName = "raceConditionDb";
  let db: Database, docResult: UseDocumentResult<{ input: string }>;

  beforeEach(async () => {
    db = fireproof(dbName);

    // Render a new hook instance
    renderHook(() => {
      const { useDocument } = useFireproof(dbName);
      docResult = useDocument<{ input: string }>({ input: "" });
    });
  });

  it.skip(
    "demonstrates that reset() takes precedence over save() when both are called",
    async () => {
      // Merge some changes into doc
      docResult.merge({ input: "some data" });

      // Call save and don't await it
      const savePromise = docResult.save();

      // Add a small delay to avoid React state queue issues in test environment
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Call reset after save
      docResult.reset();

      // Wait for save to complete
      await savePromise;

      // Let any async subscriptions complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the reset took precedence
      expect(docResult.doc._id).toBeUndefined();
      expect(docResult.doc.input).toBe("");
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
});

describe("useFireproof calling submit()", () => {
  const dbName = "submitDb";
  let db: Database, docResult: UseDocumentResult<{ input: string }>;

  beforeEach(async () => {
    db = fireproof(dbName);

    // Render a new hook instance
    renderHook(() => {
      const { useDocument } = useFireproof(dbName);
      docResult = useDocument<{ input: string }>({ input: "" });
    });
  });

  it(
    "demonstrates that calling docResult.save() and docResult.reset() in the same tick can overwrite reset",
    async () => {
      // Merge some changes into doc
      docResult.merge({ input: "some data" });

      docResult.submit();

      // Let the async subscription produce a new doc in case the doc is reloaded with an _id
      await new Promise((resolve) => setTimeout(resolve, 500));

      // If the reset worked, doc._id should STILL be undefined.
      // If the subscription wins, doc._id will be defined => test fails.
      await waitFor(() => {
        expect(docResult.doc._id).toBeUndefined();
        expect(docResult.doc.input).toBe("");
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
});
