import { describe, it, expect } from "vitest";
import { buildJWKSUrl, JWKSValidationError } from "../src/validator.js";

describe("Basic JWKS functionality", () => {
  it("should build Clerk URLs correctly", () => {
    const result = buildJWKSUrl("trusted-glowworm-5");
    expect(result).toBe("https://trusted-glowworm-5.clerk.accounts.dev/.well-known/jwks.json");
  });

  it("should handle direct URLs", () => {
    const url = "https://example.com/.well-known/jwks.json";
    const result = buildJWKSUrl(url);
    expect(result).toBe(url);
  });

  it("should throw on invalid config", () => {
    expect(() => buildJWKSUrl("")).toThrow(JWKSValidationError);
  });
});
