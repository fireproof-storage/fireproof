import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { useToyHook, ToyDatabase } from "./hooks/useToyHook";

// Test timeout for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useToyHook basic test", () => {
  const dbName = "toy-hook-test-db";
  let db: ToyDatabase;

  beforeEach(async () => {
    db = new ToyDatabase(dbName);
    await db.put({ text: "initial data" });
  });

  it(
    "should provide a working database instance",
    async () => {
      // Basic test just accessing the database
      const { result } = renderHook(() => {
        return useToyHook(dbName).database;
      });

      // Check basic functionality
      expect(result.current).toBeDefined();
      expect(result.current.name).toBe(dbName);

      // Test put and get
      let docId: string;

      await act(async () => {
        const response = await result.current.put({ text: "more data" });
        docId = response.id;
      });

      expect(docId).toBeDefined();

      await act(async () => {
        const doc = await result.current.get(docId);
        expect(doc).toBeDefined();
        expect(doc.text).toBe("more data");
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.destroy();
  });
});
