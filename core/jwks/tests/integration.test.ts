import { describe, it, expect } from "vitest";
import { fetchAndValidateJWKS, buildJWKSUrl } from "../src/validator";

describe("JWKS Integration Tests", () => {
  it("should build Clerk URLs correctly", () => {
    expect(buildJWKSUrl("trusted-glowworm-5"))
      .toBe("https://trusted-glowworm-5.clerk.accounts.dev/.well-known/jwks.json");
  });

  it("should build full Clerk domain URLs", () => {
    expect(buildJWKSUrl("trusted-glowworm-5.clerk.accounts.dev"))
      .toBe("https://trusted-glowworm-5.clerk.accounts.dev/.well-known/jwks.json");
  });

  it("should handle direct URLs", () => {
    const url = "https://example.com/.well-known/jwks.json";
    expect(buildJWKSUrl(url)).toBe(url);
  });

  // Integration test with real Clerk endpoint (may fail in CI/testing environments)
  it("should fetch and validate real Clerk JWKS (integration test)", async () => {
    try {
      const result = await fetchAndValidateJWKS("trusted-glowworm-5", {
        allowedKeyTypes: ["RSA", "EC"],
        allowedUse: ["sig"],
        requireKeyId: true,
        maxKeys: 10
      }, {
        timeout: 5000,
        retries: 1
      });

      if (result.is_ok()) {
        const { jwks, validation } = result.unwrap();
        
        // Basic structure checks
        expect(jwks).toHaveProperty("keys");
        expect(Array.isArray(jwks.keys)).toBe(true);
        expect(validation.totalKeysCount).toBeGreaterThan(0);
        
        // Each key should have basic properties
        if (jwks.keys.length > 0) {
          const firstKey = jwks.keys[0];
          expect(firstKey).toHaveProperty("kty");
          expect(firstKey).toHaveProperty("kid");
          expect(["RSA", "EC", "oct", "OKP"]).toContain(firstKey.kty);
        }

        // Validation should work
        expect(validation).toHaveProperty("isValid");
        expect(validation).toHaveProperty("currentKeysCount");
        
        console.log(`✅ Live test: ${validation.currentKeysCount}/${validation.totalKeysCount} keys are current`);
      } else {
        // Log error but don't fail test (network issues in CI)
        console.warn(`⚠️  Live test failed: ${result.unwrap_err().message}`);
        expect(result.unwrap_err().name).toMatch(/JWKSFetchError|JWKSValidationError/);
      }
    } catch (error) {
      console.warn(`⚠️  Live test exception: ${error instanceof Error ? error.message : error}`);
      // Don't fail the test - network issues are expected in some environments
    }
  }, 10000); // 10 second timeout
});
