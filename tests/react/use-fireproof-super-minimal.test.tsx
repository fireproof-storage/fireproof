import { renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database } from "use-fireproof";

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useFireproof super minimal test", () => {
  const dbName = "super-minimal-test-db";
  let db: Database;

  beforeEach(async () => {
    db = fireproof(dbName);
    await db.put({ text: "test data" });
  });

  it(
    "should provide database access",
    () => {
      // Only test the returned database, not the hooks
      const { result } = renderHook(() => {
        const fp = useFireproof(dbName);
        return {
          database: fp.database
        };
      });

      expect(result.current.database).toBeDefined();
      expect(result.current.database.name).toBe(dbName);
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
});
