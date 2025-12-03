import { describe, it, expect } from "vitest";

/**
 * Unit tests to debug the Clerk token verification pipeline
 * Testing the comma-separated URL parsing and key loading logic
 */

describe("Clerk Token Verification Pipeline", () => {
  describe("Environment Variable Parsing", () => {
    it("should parse comma-separated CLERK_PUB_JWT_URL correctly", () => {
      const urlString =
        "https://trusted-glowworm-5.clerk.accounts.dev/,https://precise-colt-49.clerk.accounts.dev,https://clerk.fireproof.direct,https://clerk.vibes.diy,https://sincere-cheetah-30.clerk.accounts.dev";

      const urls = urlString
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u);

      expect(urls).toHaveLength(5);
      expect(urls[0]).toBe("https://trusted-glowworm-5.clerk.accounts.dev/");
      expect(urls[1]).toBe("https://precise-colt-49.clerk.accounts.dev");
      expect(urls[4]).toBe("https://sincere-cheetah-30.clerk.accounts.dev");
    });

    it("should handle URLs with trailing slashes correctly", () => {
      const urlsWithMixedSlashes = [
        "https://clerk.fireproof.direct/",
        "https://clerk.vibes.diy",
        "https://sincere-cheetah-30.clerk.accounts.dev/",
      ];

      // Normalize by removing trailing slashes for comparison
      const normalized = urlsWithMixedSlashes.map((url) => (url.endsWith("/") ? url.slice(0, -1) : url));

      expect(normalized[0]).toBe("https://clerk.fireproof.direct");
      expect(normalized[1]).toBe("https://clerk.vibes.diy");
    });

    it("should parse CLERK_PUB_JWT_KEY JSON correctly", () => {
      const keyJsonString = `{"keys":[{"kty":"RSA","use":"sig","alg":"RS256","kid":"ins_2oxhTf7Y0eXqPaGJArov1FRUJi0","n":"zDikigDl9gbFw5ovahuhdbvAk_YsQBf4KmLnGyoEI9gnsSJywfpf50yVTIf1DOJlRGopScCyPR4JrKb1qNn3ZKYxx3Ml43sKyfNsgLbR1w7uDxoxoQt4c4FAaQatogs-cbcGOHZ71Yis3_6Iluue1uUZGIjf98AibPjkFYGZmcN-oJramzYojJ1oamDTP8ts2JiWkVAvgFYWo4nMklTj5MBUCslAU2WqnSVGSj4i-rVc8zxTEf6_XauPTpyjJXNqdkmTtYSCuT8GpmApbRou0WElrI9v23Te5nLjFTOSCeb-5fLcnFGlBWkHF16dfgey9T-QU3CYzn01KksiTEO9Dw","e":"AQAB"},{"kty":"RSA","use":"sig","alg":"RS256","kid":"ins_35qNS5Jwyc7z4aJRBIS7o205yzb","n":"6-QH-AxPu-No6bWKn6Uih-dJ-RCd19ng8PdYrQBah2ULrBMrw1a6mi7oQr-8Tussm3pIn4d282gdxCG9TGi2xM_MjP_KNMwZojeKkFv2NDi0IWJXlRsxWj3ZoGVozUeSd3SEMaloXm3-RzHviQz5XfJ894EoxidbQeV33pHWujZueFAgNcaycorK_Ot4Q1I4kO0UIkIiVbkmJT0FmHgw9lohN0sTkoXzt3Zk5TJbo7Ynz8zZrZwUWxJ3IsMQMD1R3atFzNGiAGO8n1LgxwAYnAjXfDhqXAXfMkjGtLlfBkA1oVbypoY6Mu6pRF78PG0NxIfP-_xB764-Bar4dNy2fQ","e":"AQAB"}]}`;

      const parsed = JSON.parse(keyJsonString);

      expect(parsed).toHaveProperty("keys");
      expect(Array.isArray(parsed.keys)).toBe(true);
      expect(parsed.keys).toHaveLength(2);

      // Check that both kids are present
      const kids = parsed.keys.map((key: { kid?: string }) => key.kid);
      expect(kids).toContain("ins_2oxhTf7Y0eXqPaGJArov1FRUJi0");
      expect(kids).toContain("ins_35qNS5Jwyc7z4aJRBIS7o205yzb");

      // Check key properties
      parsed.keys.forEach((key: { kty?: string; alg?: string; use?: string; n?: string; e?: string }) => {
        expect(key.kty).toBe("RSA");
        expect(key.alg).toBe("RS256");
        expect(key.use).toBe("sig");
        expect(key).toHaveProperty("n");
        expect(key).toHaveProperty("e");
      });
    });
  });

  describe("Environment Variable Loop Logic", () => {
    it("should correctly loop through CLERK_PUB_JWT_KEY and CLERK_PUB_JWT_URL variables", () => {
      // Simulate the environment variable lookup logic from create-handler.ts
      const mockEnv = new Map<string, string>([
        [
          "CLERK_PUB_JWT_URL",
          "https://clerk.fireproof.direct,https://clerk.vibes.diy,https://sincere-cheetah-30.clerk.accounts.dev",
        ],
        [
          "CLERK_PUB_JWT_KEY",
          '{"keys":[{"kty":"RSA","kid":"ins_2oxhTf7Y0eXqPaGJArov1FRUJi0"},{"kty":"RSA","kid":"ins_35qNS5Jwyc7z4aJRBIS7o205yzb"}]}',
        ],
      ]);

      const keys: string[] = [];
      const urls: string[] = [];

      // Replicate the loop from create-handler.ts lines 38-66
      // eslint-disable-next-line no-constant-condition
      for (let idx = 0; true; idx++) {
        const suffix = !idx ? "" : `_${idx}`;
        const keyEnvName = `CLERK_PUB_JWT_KEY${suffix}`;
        const urlEnvName = `CLERK_PUB_JWT_URL${suffix}`;

        const keyVal = mockEnv.get(keyEnvName);
        const urlVal = mockEnv.get(urlEnvName);

        if (!keyVal && !urlVal) {
          // End of loop
          break;
        }

        if (keyVal) {
          keys.push(keyVal);
        }

        if (urlVal) {
          urls.push(
            ...urlVal
              .split(",")
              .map((u) => u.trim())
              .filter((u) => u),
          );
        }
      }

      expect(keys).toHaveLength(1);
      expect(urls).toHaveLength(3);
      expect(urls).toContain("https://clerk.fireproof.direct");
      expect(urls).toContain("https://sincere-cheetah-30.clerk.accounts.dev");
    });

    it("should handle multiple indexed environment variables (CLERK_PUB_JWT_URL_1, etc)", () => {
      const mockEnv = new Map<string, string>([
        ["CLERK_PUB_JWT_URL", "https://clerk1.example.com,https://clerk2.example.com"],
        ["CLERK_PUB_JWT_URL_1", "https://clerk3.example.com"],
        ["CLERK_PUB_JWT_KEY_1", '{"keys":[{"kty":"RSA","kid":"key1"}]}'],
      ]);

      const keys: string[] = [];
      const urls: string[] = [];

      // eslint-disable-next-line no-constant-condition
      for (let idx = 0; true; idx++) {
        const suffix = !idx ? "" : `_${idx}`;
        const keyEnvName = `CLERK_PUB_JWT_KEY${suffix}`;
        const urlEnvName = `CLERK_PUB_JWT_URL${suffix}`;

        const keyVal = mockEnv.get(keyEnvName);
        const urlVal = mockEnv.get(urlEnvName);

        if (!keyVal && !urlVal) {
          break;
        }

        if (keyVal) {
          keys.push(keyVal);
        }

        if (urlVal) {
          urls.push(
            ...urlVal
              .split(",")
              .map((u) => u.trim())
              .filter((u) => u),
          );
        }
      }

      expect(keys).toHaveLength(1);
      expect(urls).toHaveLength(3);
      expect(urls[0]).toBe("https://clerk1.example.com");
      expect(urls[2]).toBe("https://clerk3.example.com");
    });
  });

  describe("Key String vs Keys Object Handling", () => {
    it("should handle when CLERK_PUB_JWT_KEY contains a JSON object with keys array", () => {
      const keyJsonString = `{"keys":[{"kty":"RSA","kid":"key1"},{"kty":"RSA","kid":"key2"}]}`;
      const parsed = JSON.parse(keyJsonString);

      expect(parsed.keys).toHaveLength(2);

      // The code needs to check if the value is already parsed or needs parsing
      // and whether it's a single key or an array of keys
    });

    it("should detect if keys need to be extracted from a wrapping object", () => {
      const wrappedKeys = '{"keys":[{"kty":"RSA"}]}';
      const singleKey = '{"kty":"RSA"}';

      const wrapped = JSON.parse(wrappedKeys);
      const single = JSON.parse(singleKey);

      // Check if it has a "keys" array property
      expect(wrapped).toHaveProperty("keys");
      expect(Array.isArray(wrapped.keys)).toBe(true);

      // Single key should not have a "keys" property
      expect(single).not.toHaveProperty("keys");
      expect(single).toHaveProperty("kty");
    });
  });

  describe("JWKS URL Path Normalization", () => {
    it("should append /.well-known/jwks.json to base URLs", () => {
      const baseUrls = ["https://clerk.fireproof.direct", "https://sincere-cheetah-30.clerk.accounts.dev"];

      const normalized = baseUrls.map((url) => {
        const hasPath = url.includes("/.well-known/jwks.json");
        if (hasPath) {
          return url;
        }
        return `${url.endsWith("/") ? url.slice(0, -1) : url}/.well-known/jwks.json`;
      });

      expect(normalized[0]).toBe("https://clerk.fireproof.direct/.well-known/jwks.json");
      expect(normalized[1]).toBe("https://sincere-cheetah-30.clerk.accounts.dev/.well-known/jwks.json");
    });

    it("should not double-append /.well-known/jwks.json if already present", () => {
      const url = "https://clerk.fireproof.direct/.well-known/jwks.json";
      const hasPath = url.includes("/.well-known/jwks.json");

      expect(hasPath).toBe(true);
      // Should not append again
    });
  });

  describe("Preset Keys vs JWKS URLs Priority", () => {
    it("should demonstrate that preset keys are tried before JWKS URLs", () => {
      // From sts-service/index.ts lines 378-401, preset keys are tried first
      // Then JWKS URLs are fetched (lines 405-480)

      const presetKeys = ["key1", "key2"];
      const jwksUrls = ["url1", "url2"];

      // Simulate the order
      const tryOrder: string[] = [];

      // Try preset keys first
      for (const key of presetKeys) {
        tryOrder.push(`preset:${key}`);
      }

      // Then try JWKS URLs
      for (const url of jwksUrls) {
        tryOrder.push(`jwks:${url}`);
      }

      expect(tryOrder[0]).toBe("preset:key1");
      expect(tryOrder[1]).toBe("preset:key2");
      expect(tryOrder[2]).toBe("jwks:url1");
      expect(tryOrder[3]).toBe("jwks:url2");
    });
  });

  describe("Potential Issues", () => {
    it("should identify if CLERK_PUB_JWT_KEY is treated as a single string instead of being parsed", () => {
      // ISSUE: If CLERK_PUB_JWT_KEY contains '{"keys":[...]}' but is treated as a single key string
      const keyJsonString = '{"keys":[{"kty":"RSA","kid":"key1"}]}';

      // If passed directly as a string to coerceJWKPublic without parsing:
      const isJsonString = keyJsonString.startsWith("{") && keyJsonString.includes("keys");
      expect(isJsonString).toBe(true);

      // This should be parsed first before being used
      const shouldParse = typeof keyJsonString === "string" && keyJsonString.startsWith("{");
      expect(shouldParse).toBe(true);
    });

    it("should check if keys array needs to be flattened", () => {
      // ISSUE: CLERK_PUB_JWT_KEY might contain {"keys": [...]} but code expects just the array
      const envValue = '{"keys":[{"kty":"RSA","kid":"k1"},{"kty":"RSA","kid":"k2"}]}';
      const parsed = JSON.parse(envValue);

      // The keys array needs to be extracted
      const actualKeys = parsed.keys;
      expect(Array.isArray(actualKeys)).toBe(true);
      expect(actualKeys).toHaveLength(2);

      // If the code tries to use parsed directly instead of parsed.keys, it will fail
    });

    it("should verify that each key from CLERK_PUB_JWT_KEY is tried separately", () => {
      // ISSUE: The whole {"keys": [...]} object might be passed as one key instead of iterating
      const envValue = '{"keys":[{"kty":"RSA","kid":"k1"},{"kty":"RSA","kid":"k2"}]}';
      const parsed = JSON.parse(envValue);

      // Correct: extract and iterate over parsed.keys
      const keysToTry = parsed.keys;
      expect(keysToTry).toHaveLength(2);

      // Incorrect: trying to use parsed as a single key
      const wrongApproach = parsed;
      expect(wrongApproach.kty).toBeUndefined(); // This would fail verification
    });

    it("should check if coerceJWKPublic can handle a keys wrapper object", () => {
      // The coerceJWKPublic function might expect a single JWK, not a {"keys": [...]} wrapper
      const wrappedKeys = { keys: [{ kty: "RSA", kid: "k1" }] };
      const singleKey = { kty: "RSA", kid: "k1" };

      // coerceJWKPublic should receive singleKey, not wrappedKeys
      expect(singleKey).toHaveProperty("kty");
      expect(wrappedKeys).not.toHaveProperty("kty");
      expect(wrappedKeys).toHaveProperty("keys");
    });
  });

  describe("Integration: Full Pipeline Simulation", () => {
    it("should correctly extract all keys from CLERK_PUB_JWT_KEY for verification", () => {
      // Simulate the actual GitHub variable value
      const clerkPubJwtKey = `{"keys":[{"kty":"RSA","use":"sig","alg":"RS256","kid":"ins_2rZsAEtLm98uyrPux28ZVGvBJ9O","n":"slwvL-cGRduUlcNSu3-jjJWEzneSrP3uYw0te4M4N_wJ8yMQBHxC9uoFaA0UNmzJwrPfSObHUQZ8kgmZ2Jiq9X-4qtx824tCtjK6UW4i3TJ0R4KYs75ufZ2CxJWG-5YG_rpu4ku7FqlCPgAOlnle8bjQUdxYqnR8fCYRaMqim9z1HaPtT763cHGfdhGTClhAZVgSAjr3DNvhxEozQ-um8wbEcyUe8bz9sfnUu569wCMkRRwuOJ-_UauUiXcMRNzXfOBlkHnkntgUbqOUj-QXlvxNsHxq6eTzaZPfkyuJuD8wcbdmfM_8vWQEVQEF-d_fMHRRxGP0vD1zfmYh5-REkQ","e":"AQAB"},{"kty":"RSA","use":"sig","alg":"RS256","kid":"ins_2olzJ4rRwcQ5lPbKNCYdwJ4GrFQ","n":"zuYkKADAu6UJeBq-G6MUerFLKEQVRUrQ8eJCFMWbh-JlCfr9uoEoxutWO3lpVAaFhq2vhRaYif8xoxCmvM74gCoNqE7DDUUrUTBt5kYSJyxAoLUpmVVg7pecJngcaqtPUekE_UGGJ2E2jHMRQ9thzF64BTaJFpddM45M4VEQs-PNEMnmo0NKWggikFXKCBWhakMsuygyBDtY7q73VLdG-jAG6YsVxDt_27DZ6Lv-iH2SMqM0-Xf4aYvCV_JxS75Emf1srsMC2C6_IJcIYSkxyfS6j_DE_dIzXPJ-quXhNrUgpzo2zvvMF44tDXrkeMQ5CQd06kTWe9_BxqkrVT3wLw","e":"AQAB"},{"kty":"RSA","use":"sig","alg":"RS256","kid":"ins_2oxhTf7Y0eXqPaGJArov1FRUJi0","n":"zDikigDl9gbFw5ovahuhdbvAk_YsQBf4KmLnGyoEI9gnsSJywfpf50yVTIf1DOJlRGopScCyPR4JrKb1qNn3ZKYxx3Ml43sKyfNsgLbR1w7uDxoxoQt4c4FAaQatogs-cbcGOHZ71Yis3_6Iluue1uUZGIjf98AibPjkFYGZmcN-oJramzYojJ1oamDTP8ts2JiWkVAvgFYWo4nMklTj5MBUCslAU2WqnSVGSj4i-rVc8zxTEf6_XauPTpyjJXNqdkmTtYSCuT8GpmApbRou0WElrI9v23Te5nLjFTOSCeb-5fLcnFGlBWkHF16dfgey9T-QU3CYzn01KksiTEO9Dw","e":"AQAB"},{"kty":"RSA","use":"sig","alg":"RS256","kid":"ins_35qPurrm9AFT3PoZYJFFbJShJu4","n":"3X3vMrvgVrX8iT8ArWYpPEDy21GvYDckTW2kklfSOxvkeBDbLAIAmKASyKf0MmpbGgfWIMmdSuJGDCl4M00D0PlRXCdOkccmrACWdpfI9fakCNbvtd3zuwe5iXVONd8qNd2tXZ61U_TJKD_xz2iwma6SJZsx0j7G4QJzWMCqbzSB5T5Syi4SaBxMsT2Y6DR05I6FEE9eido0AI708PGE47gdP1xy5xeBtxCwLx1bWpeF3-xIwFi8NYBxSGdPzcbPr-GViow4YwOYJp6h5tJpxeAJC8-v7X1HyH0Znt8jcQ8V2iyEiWFC9N66QA23c0K8LTc904drfneXKO_6Hz5IZQ","e":"AQAB"},{"kty":"RSA","use":"sig","alg":"RS256","kid":"ins_35qNS5Jwyc7z4aJRBIS7o205yzb","n":"6-QH-AxPu-No6bWKn6Uih-dJ-RCd19ng8PdYrQBah2ULrBMrw1a6mi7oQr-8Tussm3pIn4d282gdxCG9TGi2xM_MjP_KNMwZojeKkFv2NDi0IWJXlRsxWj3ZoGVozUeSd3SEMaloXm3-RzHviQz5XfJ894EoxidbQeV33pHWujZueFAgNcaycorK_Ot4Q1I4kO0UIkIiVbkmJT0FmHgw9lohN0sTkoXzt3Zk5TJbo7Ynz8zZrZwUWxJ3IsMQMD1R3atFzNGiAGO8n1LgxwAYnAjXfDhqXAXfMkjGtLlfBkA1oVbypoY6Mu6pRF78PG0NxIfP-_xB764-Bar4dNy2fQ","e":"AQAB"}]}`;

      // Parse the JSON
      const parsed = JSON.parse(clerkPubJwtKey);

      // CRITICAL: The keys are wrapped in a "keys" array
      expect(parsed).toHaveProperty("keys");
      expect(parsed.keys).toHaveLength(5);

      // Extract the individual keys
      const individualKeys = parsed.keys;

      // Check that the sincere-cheetah-30 key (ins_35qNS5Jwyc7z4aJRBIS7o205yzb) is present
      const kids = individualKeys.map((k: { kid?: string }) => k.kid);
      expect(kids).toContain("ins_35qNS5Jwyc7z4aJRBIS7o205yzb");
      expect(kids).toContain("ins_2oxhTf7Y0eXqPaGJArov1FRUJi0");

      // THIS IS THE CRITICAL ISSUE:
      // The code in create-handler.ts line 56 does: keys.push(keyVal)
      // This pushes the entire JSON string, not the parsed individual keys!
      // The string should be parsed and each key from parsed.keys should be added separately
    });

    it("should demonstrate the bug: keys array contains JSON string instead of individual keys", () => {
      const keyVal = '{"keys":[{"kty":"RSA","kid":"k1"},{"kty":"RSA","kid":"k2"}]}';

      // BUG: This is what the current code does - pushes the whole string
      const buggyKeys: string[] = [];
      buggyKeys.push(keyVal);

      expect(buggyKeys).toHaveLength(1); // Wrong! Should be 2
      expect(typeof buggyKeys[0]).toBe("string");

      // FIX: Parse the string and extract individual keys
      const fixedKeys: unknown[] = [];
      const parsed = JSON.parse(keyVal);
      if (parsed.keys && Array.isArray(parsed.keys)) {
        fixedKeys.push(...parsed.keys);
      } else {
        fixedKeys.push(parsed);
      }

      expect(fixedKeys).toHaveLength(2); // Correct!
      expect(fixedKeys[0]).toHaveProperty("kty");
      const key0 = fixedKeys[0] as { kid?: string };
      const key1 = fixedKeys[1] as { kid?: string };
      expect(key0.kid).toBe("k1");
      expect(key1.kid).toBe("k2");
    });

    it("should correctly parse and extract keys using the fix", () => {
      // Simulate the fixed code from create-handler.ts
      const keyVal =
        '{"keys":[{"kty":"RSA","kid":"ins_2oxhTf7Y0eXqPaGJArov1FRUJi0"},{"kty":"RSA","kid":"ins_35qNS5Jwyc7z4aJRBIS7o205yzb"}]}';
      const keys: string[] = [];

      // FIX: Parse and extract individual keys
      try {
        const parsed = JSON.parse(keyVal);
        if (parsed.keys && Array.isArray(parsed.keys)) {
          // Extract individual keys from the wrapper object
          keys.push(...parsed.keys.map((k: unknown) => JSON.stringify(k)));
        } else {
          // Single key object
          keys.push(keyVal);
        }
      } catch {
        // Not JSON, treat as raw key string
        keys.push(keyVal);
      }

      // Verify the fix works
      expect(keys).toHaveLength(2);

      // Parse each key to verify structure
      const parsedKeys = keys.map((k) => JSON.parse(k));
      expect(parsedKeys[0].kid).toBe("ins_2oxhTf7Y0eXqPaGJArov1FRUJi0");
      expect(parsedKeys[1].kid).toBe("ins_35qNS5Jwyc7z4aJRBIS7o205yzb");
      expect(parsedKeys[0].kty).toBe("RSA");
    });
  });
});
