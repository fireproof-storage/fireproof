import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireproof, useFireproof, toCloud } from "../index.js";
import type { Database } from "../index.js";

interface AttachState {
  state: string;
}

// Mock toCloud to track attachment calls
vi.mock("../index.js", async () => {
  const actual = await vi.importActual("../index.js");
  return {
    ...actual,
    toCloud: vi.fn(),
  };
});

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useFireproof attachment database switching", () => {
  const db1Name = "attach-db1";
  const db2Name = "attach-db2";
  let db1: Database, db2: Database;
  let mockToCloud: ReturnType<typeof vi.fn>;
  let attachmentCallCount: number;

  beforeEach(async () => {
    // Reset tracking
    attachmentCallCount = 0;

    // Setup mock toCloud
    mockToCloud = vi.mocked(toCloud);
    mockToCloud.mockImplementation(() => {
      attachmentCallCount++;
      return {
        name: `mock-cloud-attachable-${attachmentCallCount}`,
        configHash: async () => `mock-config-hash-${attachmentCallCount}`,
        prepare: async () => ({
          car: { url: `memory://mock-car-${attachmentCallCount}` },
          meta: { url: `memory://mock-meta-${attachmentCallCount}` },
          file: { url: `memory://mock-file-${attachmentCallCount}` },
        }),
        opts: {
          context: {
            get: () => ({
              ready: async () => {
                // Mock ready method
              },
              onTokenChange: () => () => {
                // Mock token change handler
              },
            }),
          },
        },
      };
    });

    // Setup two databases
    db1 = fireproof(db1Name);
    db2 = fireproof(db2Name);

    // Add some data to differentiate the databases
    await db1.put({ name: "db1-data" });
    await db2.put({ name: "db2-data" });
  });

  it(
    "should attach to cloud when switching database names",
    async () => {
      let currentDb: Database;
      let attachState: AttachState;

      // Initial render with db1 and attach config
      const { rerender } = renderHook(
        ({ dbName }) => {
          const result = useFireproof(dbName, {
            attach: toCloud(),
          });
          currentDb = result.database;
          attachState = result.attach;
          return result;
        },
        { initialProps: { dbName: db1Name } },
      );

      // Verify initial state with db1
      await waitFor(() => {
        expect(currentDb.name).toBe(db1Name);
        expect(mockToCloud).toHaveBeenCalled();
      });

      // Wait for first attachment to complete
      await waitFor(() => {
        expect(attachState.state).toBe("attached");
      });

      // Track first attachment
      const firstCallCount = mockToCloud.mock.calls.length;
      expect(firstCallCount).toBeGreaterThan(0);

      // Switch to db2
      rerender({ dbName: db2Name });

      // Verify state with db2
      await waitFor(() => {
        expect(currentDb.name).toBe(db2Name);
      });

      // Critical assertion: Second database should also attach
      // This should fail with current implementation
      await waitFor(() => {
        expect(attachState.state).toBe("attached");
        expect(mockToCloud.mock.calls.length).toBe(firstCallCount + 1);
      });

      // Switch back to db1
      rerender({ dbName: db1Name });

      // Verify state is back to db1 and still attached
      await waitFor(() => {
        expect(currentDb.name).toBe(db1Name);
        expect(attachState.state).toBe("attached");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "should maintain separate attachment states per database",
    async () => {
      let currentAttachState: AttachState;
      let currentDbName: string;

      // Render hook with db1
      const { rerender } = renderHook(
        ({ dbName }) => {
          const result = useFireproof(dbName, {
            attach: toCloud(),
          });
          currentAttachState = result.attach;
          currentDbName = result.database.name;
          return result;
        },
        { initialProps: { dbName: db1Name } },
      );

      // Wait for first attachment
      await waitFor(() => {
        expect(currentDbName).toBe(db1Name);
        expect(currentAttachState.state).toBe("attached");
      });

      const firstCallCount = mockToCloud.mock.calls.length;

      // Switch to db2
      rerender({ dbName: db2Name });

      // Wait for second database and its attachment
      await waitFor(() => {
        expect(currentDbName).toBe(db2Name);
        expect(currentAttachState.state).toBe("attached");
      });

      // Both databases should have attached independently
      expect(mockToCloud.mock.calls.length).toBe(firstCallCount + 1);
      expect(mockToCloud.mock.calls.length).toBeGreaterThanOrEqual(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "should re-attach after multiple database name changes",
    async () => {
      let currentDb: Database;
      let attachState: AttachState;

      const { rerender } = renderHook(
        ({ dbName }) => {
          const result = useFireproof(dbName, {
            attach: toCloud(),
          });
          currentDb = result.database;
          attachState = result.attach;
          return result;
        },
        { initialProps: { dbName: db1Name } },
      );

      // Initial attachment
      await waitFor(() => {
        expect(attachState.state).toBe("attached");
      });

      // Multiple switches
      rerender({ dbName: db2Name });
      await waitFor(() => {
        expect(currentDb.name).toBe(db2Name);
        expect(attachState.state).toBe("attached");
      });

      rerender({ dbName: db1Name });
      await waitFor(() => {
        expect(currentDb.name).toBe(db1Name);
        expect(attachState.state).toBe("attached");
      });

      rerender({ dbName: db2Name });
      await waitFor(() => {
        expect(currentDb.name).toBe(db2Name);
        expect(attachState.state).toBe("attached");
      });

      // Should have made attachment calls for both databases
      expect(mockToCloud.mock.calls.length).toBeGreaterThanOrEqual(2);
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db1.close();
    await db1.destroy();
    await db2.close();
    await db2.destroy();
    vi.clearAllMocks();
  });
});
