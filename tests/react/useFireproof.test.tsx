import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Database, fireproof, useFireproof } from "use-fireproof";
import { LiveQueryResult, UseDocumentResult } from "../../src/react/useFireproof.js";

describe("HOOK: useFireproof", () => {
  it("should be defined", () => {
    expect(useFireproof).toBeDefined();
  });

  it("renders the hook correctly and checks types", () => {
    renderHook(() => {
      const { database, useLiveQuery, useDocument } = useFireproof("dbname");
      expect(typeof useLiveQuery).toBe("function");
      expect(typeof useDocument).toBe("function");
      expect(database?.constructor.name).toMatch(/^Database/);
    });
  });
});

describe("HOOK: useFireproof useLiveQuery has results", () => {
  const dbName = "dbnameuseFP";
  let db: Database,
    query: LiveQueryResult<{ foo: string }, string>,
    database: ReturnType<typeof useFireproof>["database"],
    useLiveQuery: ReturnType<typeof useFireproof>["useLiveQuery"];

  beforeEach(async () => {
    db = fireproof(dbName);
    await db.put({ foo: "aha" });
    await db.put({ foo: "bar" });
    await db.put({ foo: "caz" });

    renderHook(() => {
      const result = useFireproof(dbName);
      database = result.database;
      useLiveQuery = result.useLiveQuery;
      query = useLiveQuery<{ foo: string }>("foo");
    });
  });

  it("should have setup data", async () => {
    const allDocs = await db.allDocs<{ foo: string }>();
    expect(allDocs.rows.length).toBe(3);
    expect(allDocs.rows[0].value.foo).toBe("aha");
    expect(allDocs.rows[1].value.foo).toBe("bar");
    expect(allDocs.rows[2].value.foo).toBe("caz");
  });

  it("queries correctly", async () => {
    await waitFor(() => {
      expect(query.rows.length).toBe(3);
      expect(query.rows[0].doc?.foo).toBe("aha");
      expect(query.rows[1].doc?.foo).toBe("bar");
      expect(query.rows[2].doc?.foo).toBe("caz");
    });
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database.close();
    await database.destroy();
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

  it("should have empty setup data", async () => {
    const allDocs = await db.allDocs<{ input: string }>();
    expect(allDocs.rows.length).toBe(0);
  });

  it("queries correctly", async () => {
    await waitFor(() => {
      expect(docResult.doc.input).toBe("");
      expect(docResult.doc._id).toBeUndefined();
    });
  });

  it("handles mutations correctly", async () => {
    docResult.merge({ input: "new" });
    await waitFor(() => {
      expect(docResult.doc.input).toBe("new");
      expect(docResult.doc._id).toBeUndefined();
    });
  });

  it("handles save correctly", async () => {
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
  });

  it("handles reset after save", async () => {
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

    const allDocs = await db.allDocs<{ input: string }>();
    expect(allDocs.rows.length).toBe(3);
    expect(allDocs.rows[0].value.input).toBe("first");
    expect(allDocs.rows[1].value.input).toBe("new");
    expect(allDocs.rows[2].value.input).toBe("fresh");
  });

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

  it("should have setup data", async () => {
    const allDocs = await db.allDocs<{ input: string }>();
    expect(allDocs.rows.length).toBe(1);
    expect(allDocs.rows[0].value.input).toBe("initial");
    expect(allDocs.rows[0].key).toBe(id);
  });

  it("queries correctly", async () => {
    await waitFor(() => {
      expect(docResult.doc.input).toBe("initial");
      expect(docResult.doc._id).toBe(id);
    });
  });

  it("handles mutations correctly", async () => {
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
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database.close();
    await database.destroy();
  });
});
