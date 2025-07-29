import {
  fireproof,
  CompactStrategy,
  CompactStrategyContext,
  getCompactStrategyThrow,
  registerCompactStrategy,
} from "@fireproof/core";
import { expect, describe, it, vi } from "vitest";

describe("compactStrategy", () => {
  it("register and use compactStrategy", () => {
    const compact: CompactStrategy["compact"] = vi.fn();
    const unreg = registerCompactStrategy({
      name: "test",
      compact,
    });
    const compactStrategy = getCompactStrategyThrow("test");
    expect(compactStrategy.name).toBe("test");
    unreg();
    expect(() => getCompactStrategyThrow("test")).toThrow();
  });
  it("use compactStrategy", async () => {
    const compact: CompactStrategy["compact"] = vi.fn((ctx: CompactStrategyContext) => {
      return Promise.resolve(ctx.clock?.head);
    });
    registerCompactStrategy({
      name: "test",
      compact,
    });
    const db = fireproof("test-compactStrategy", {
      compactStrategy: "test",
      storeUrls: { base: `memory://test-compactStrategy-${Date.now()}` },
    });
    for (let i = 0; i < 10; i++) {
      await db.put({ _id: `test-${i}`, value: i });
    }
    await db.compact();
    expect(compact).toHaveBeenCalledTimes(1);
  });
});
