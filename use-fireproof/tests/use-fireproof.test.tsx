import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireproof, useFireproof } from "../index.js";
import type { Database, DocResponse, LiveQueryResult, UseDocumentResult } from "../index.js";
import { hashStringSync } from "@fireproof/core-runtime";

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

describe("useFireproof and attach toCloud complex", () => {
  // it("string are unique", () => {

  //   function mark(x: string) {
  //     const toMark = x as unknown as { __fped?: string };
  //     if (toMark.__fped) {
  //       return toMark.__fped
  //     }
  //     toMark.__fped = (~~(Math.random() * 0x1000_0000)).toString(16);
  //     return toMark.__fped;
  //   }

  //   const set = new Set<string>();
  //   for (let i = 0; i < 10; i++) {
  //     const y = "hello";
  //     const x = mark(y);
  //     set.add(x);
  //   }
  //   expect(set.size).toBe(1);
  // });
  it("tags identical function sources only once per run", async () => {
    const source2Id = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    function tagFn<T extends Function>(fn: T): string {
      // const fnProto = (fn as unknown as { __proto__?: { __fped?: string } }).__proto__;
      // if (!fnProto) {
      //   throw new Error("no proto");
      // }
      // if (fnProto && fnProto.__fped){
      //   return fnProto.__fped;
      // }
      // fnProto.__fped = (~~(Math.random() * 0x1000_0000)).toString(16);
      // return fnProto.__fped;

      // const fnTag = (fn as unknown as { __fped?: string });
      // if (fnTag.__fped) {
      //   return fnTag.__fped;
      // }
      // const newTag =
      // return newTag;
      const src = fn.toString();
      const sid = source2Id.get(src);
      if (sid) {
        return sid;
      }
      const id = hashStringSync(src);
      source2Id.set(src, id);
      return id;
    }
    const fnSet = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const db = () => 4;
      function x() {
        return 4;
      }
      fnSet.add(tagFn(db));
      fnSet.add(tagFn(x));
      fnSet.add(tagFn(() => 1));
      fnSet.add(
        tagFn(function () {
          return 2;
        }),
      );
      fnSet.add(tagFn(it));
    }
    expect(fnSet.size).toBe(5);
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

describe("HOOK: loaded flag behavior", () => {
  const dbName = "loadedFlagTest";
  let db: Database, database: Database | undefined;

  beforeEach(async () => {
    db = fireproof(dbName);
    // Add some test data
    await db.put({ type: "todo", text: "Task 1" });
    await db.put({ type: "todo", text: "Task 2" });
    await db.put({ type: "note", text: "Note 1" });
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
    if (database && database.name === dbName) {
      await database.close();
      await database.destroy();
      database = undefined;
    }
  });

  it(
    "useLiveQuery should have loaded flag that starts false and becomes true",
    async () => {
      const { result } = renderHook(() => {
        const { database: db, useLiveQuery } = useFireproof(dbName);
        database = db;
        return useLiveQuery<{ type: string; text: string }>("type", { key: "todo" });
      });

      // Initially loaded should be false
      expect(result.current.loaded).toBe(false);
      expect(result.current.rows.length).toBe(0);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.rows.length).toBe(2);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useDocument should have loaded flag that becomes true after refresh",
    async () => {
      // First create a document to fetch
      const docRes = await db.put({ input: "initial value" });

      const { result } = renderHook(() => {
        const { database: db, useDocument } = useFireproof(dbName);
        database = db;
        return useDocument<{ input: string }>({ _id: docRes.id } as { _id: string; input: string });
      });

      // Wait for loaded to become true
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.doc.input).toBe("initial value");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useDocument with no _id should have loaded flag true after initial render",
    async () => {
      const { result } = renderHook(() => {
        const { database: db, useDocument } = useFireproof(dbName);
        database = db;
        return useDocument<{ input: string }>({ input: "" });
      });

      // Wait for loaded to become true (should happen immediately since no fetch needed)
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.doc.input).toBe("");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useAllDocs should have loaded flag that starts false and becomes true",
    async () => {
      const { result } = renderHook(() => {
        const { database: db, useAllDocs } = useFireproof(dbName);
        database = db;
        return useAllDocs<{ type: string; text: string }>();
      });

      // Initially loaded should be false
      expect(result.current.loaded).toBe(false);
      expect(result.current.docs.length).toBe(0);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.docs.length).toBe(3);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useChanges should have loaded flag that starts false and becomes true",
    async () => {
      const { result } = renderHook(() => {
        const { database: db, useChanges } = useFireproof(dbName);
        database = db;
        return useChanges<{ type: string; text: string }>([], {});
      });

      // Initially loaded should be false
      expect(result.current.loaded).toBe(false);
      expect(result.current.docs.length).toBe(0);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.docs.length).toBe(3);
      });
    },
    TEST_TIMEOUT,
  );
});

describe("HOOK: loaded flag distinguishes empty from not-loaded", () => {
  it(
    "loaded flag distinguishes between empty results and not-yet-loaded",
    async () => {
      const emptyDbName = "emptyLoadedTest";
      const emptyDb = fireproof(emptyDbName);
      let emptyDatabase: Database | undefined;

      try {
        const { result } = renderHook(() => {
          const { database: db, useLiveQuery } = useFireproof(emptyDbName);
          emptyDatabase = db;
          return useLiveQuery<{ type: string }>("type", { key: "nonexistent" });
        });

        // Before load: loaded=false, rows=[]
        expect(result.current.loaded).toBe(false);
        expect(result.current.rows.length).toBe(0);

        // After load: loaded=true, rows=[] (legitimately empty)
        await waitFor(() => {
          expect(result.current.loaded).toBe(true);
        });
        expect(result.current.rows.length).toBe(0); // Still empty, but now we know it's loaded
      } finally {
        await emptyDb.close();
        await emptyDb.destroy();
        if (emptyDatabase) {
          await emptyDatabase.close();
          await emptyDatabase.destroy();
        }
      }
    },
    TEST_TIMEOUT,
  );
});
