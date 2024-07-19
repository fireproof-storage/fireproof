import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFireproof } from "use-fireproof";

describe("HOOK: useFireproof", () => {
  it("should be defined", () => {
    expect(useFireproof).toBeDefined();
  });

  it("renders the hook correctly and checks types", () => {
    renderHook(() => {
      const { database, useLiveQuery, useDocument } = useFireproof("dbname");
      expect(typeof useLiveQuery).toBe("function");
      expect(typeof useDocument).toBe("function");
      expect(database?.constructor.name).toBe("Database");
    });
  });
});
