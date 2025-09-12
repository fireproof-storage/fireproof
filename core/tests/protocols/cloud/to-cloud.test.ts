import { SimpleTokenStrategy } from "@fireproof/core-gateways-cloud";
import { toCloud } from "use-fireproof";
import { describe, it, expect } from "vitest";

describe("toCloud", () => {
  it("should be the same instance", () => {
    const ref = toCloud({
      urls: { base: "memory://test" },
      strategy: new SimpleTokenStrategy(""),
    });
    for (let i = 0; i < 10; i++) {
      const tc = toCloud({
        urls: { base: "memory://test" },
        strategy: new SimpleTokenStrategy(""),
      });
      expect(tc).toBeDefined();

      expect(tc).toBe(ref);
    }
  });

  it("should be other instance", () => {
    const ref = toCloud({
      urls: { base: "memory://test0" },
      strategy: new SimpleTokenStrategy(""),
    });
    const tc = toCloud({
      urls: { base: "memory://test" },
      strategy: new SimpleTokenStrategy(""),
    });
    expect(tc).toBeDefined();
    expect(tc).not.toBe(ref);
  });
});
