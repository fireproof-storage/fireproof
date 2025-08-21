import { describe, it, expect } from "vitest";
import { fetchJwks } from "./jwks-fetcher";

interface Jwks {
  keys: {
    use: string;
    kty: string;
    kid: string;
    x5c: string[];
    n: string;
    e: string;
  }[];
}

describe("JWKS fetcher", () => {
  it("should fetch and return raw JSON from JWKS endpoint", async () => {
    const url =
      "https://trusted-glowworm-5.clerk.accounts.dev/.well-known/jwks.json";

    const result = await fetchJwks(url);

    expect(result).toHaveProperty("keys");
    expect(Array.isArray(result.keys)).toBe(true);
    expect(result.keys[0]).toHaveProperty("use", "sig");
    expect(result.keys[0]).toHaveProperty("kty", "RSA");
    expect(result.keys[0]).toHaveProperty("kid");
  });
});
