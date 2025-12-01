import { Result, runtimeFn, URI } from "@adviser/cement";
import { getFileName } from "@fireproof/core-gateways-base";
import {
  ensureSuperThis,
  ensureSuperLog,
  getStore,
  inplaceFilter,
  makePartial,
  mimeBlockParser,
  sts,
} from "@fireproof/core-runtime";
import { importJWK, JWK } from "jose";
import { SignJWT } from "jose/jwt/sign";
import { exportJWK, exportSPKI } from "jose/key/export";
import { JWKPublic, JWKPrivateSchema, JWKPublicSchema, JWTPayloadSchema } from "use-fireproof";
import { UUID } from "uuidv7";
import { describe, beforeAll, it, expect, assert, vi } from "vitest";
import { z } from "zod/v4";

describe("utils", () => {
  const sthis = ensureSuperThis();
  const logger = ensureSuperLog(sthis, "getfilename");

  beforeAll(async () => {
    await sthis.start();
  });

  it("sorts search params", () => {
    const url = URI.from("http://example.com?z=1&y=2&x=3");
    expect(url.toString()).toEqual("http://example.com/?x=3&y=2&z=1");
  });

  const storeOpts = [
    {
      type: "car",
      pathPart: "data",
      suffix: ".car",
    },
    {
      type: "file",
      pathPart: "data",
      suffix: "",
    },
    {
      type: "wal",
      pathPart: "wal",
      suffix: ".json",
    },
    {
      type: "meta",
      pathPart: "meta",
      suffix: ".json",
    },
  ];
  it("getfilename plain", () => {
    for (const store of storeOpts) {
      const url = URI.from(`file://./x/path?store=${store.type}&name=name&key=key&version=version&suffix=${store.suffix}`);
      expect(getFileName(url, logger)).toEqual(`${store.pathPart}/key${store.suffix}`);
    }
  });

  it("getfilename index", () => {
    for (const store of storeOpts) {
      const url = URI.from(
        `file://./x/path?index=idx&store=${store.type}&name=name&key=key&version=version&suffix=${store.suffix}`,
      );
      expect(getFileName(url, logger)).toEqual(`idx-${store.pathPart}/key${store.suffix}`);
    }
  });

  it("getstore", () => {
    for (const store of storeOpts) {
      const url = URI.from(`file://./x/path?store=${store.type}&name=name&key=key&version=version`);
      expect(getStore(url, logger, (...toJoin) => toJoin.join("+"))).toEqual({
        fromUrl: store.type,
        name: store.pathPart,
        pathPart: store.pathPart,
      });
    }
  });

  it("getstore idx", () => {
    for (const store of storeOpts) {
      const url = URI.from(`file://./x/path?index=ix&store=${store.type}&name=name&key=key&version=version`);
      expect(getStore(url, logger, (...toJoin) => toJoin.join("+"))).toEqual({
        fromUrl: store.type,
        pathPart: store.pathPart,
        name: `ix+${store.pathPart}`,
      });
    }
  });

  it("order timeorderednextid", () => {
    let last = sthis.timeOrderedNextId().str;
    for (let i = 0; i < 10; i++) {
      const id = sthis.timeOrderedNextId().str;
      const x = UUID.parse(id);
      expect(x.getVariant()).toBe("VAR_10");
      assert(id !== last, "id should be greater than last");
      assert(id.slice(0, 13) >= last.slice(0, 13), `id should be greater than last ${id.slice(0, 13)} ${last.slice(0, 13)}`);
      last = id;
    }
  });
  it("timeorderednextid is uuidv7", () => {
    const id = sthis.timeOrderedNextId(0xcafebabebeef).str;
    expect(id.slice(0, 15)).toBe("cafebabe-beef-7");
  });

  it("inplaceFilter empty", () => {
    const s: string[] = [];
    expect(inplaceFilter(s, () => false)).toEqual([]);
    expect(inplaceFilter(s, () => true)).toEqual([]);
  });

  it("inplaceFilter sized filtered", () => {
    const s = new Array(100).fill("a").map((a, i) => `${a}${i.toString()}`);
    expect(inplaceFilter(s, () => false)).toEqual([]);
  });
  it("inplaceFilter sized unfiltered", () => {
    const s = new Array(100).fill("a").map((a, i) => `${a}${i.toString()}`);
    const ref = [...s];
    expect(inplaceFilter(s, () => true)).toEqual(ref);
  });

  it("inplaceFilter sized mod 7", () => {
    const s = new Array(100).fill("a").map((a, i) => `${a}${i.toString()}`);
    const ref = [...s];
    for (let i = 99; i >= 0; i--) {
      if (!(i % 7)) {
        ref.splice(i, 1);
      }
    }
    expect(inplaceFilter(s, (_, j) => !!(j % 7))).toEqual(ref);
    expect(s.length).toBe(85);
  });
});

describe("runtime", () => {
  it("runtime", () => {
    const isDeno = !!(typeof process === "object" && process.versions?.deno);
    const isNode = !isDeno && !!(typeof process === "object" && process.versions?.node);
    expect(runtimeFn()).toEqual({
      isBrowser: !(isNode || isDeno),
      isCFWorker: false,
      isDeno: isDeno,
      isNodeIsh: isNode,
      isReactNative: false,
    });
  });
  it("zod makePartial", () => {
    const BaseSchema = z.object({
      a: z.string(),
      b: z.number(),
      c: z.boolean(),
    });

    const partialSchema = makePartial(BaseSchema);
    const parsed = partialSchema.parse({ a: "hello", z: 1 });
    expect(parsed).toEqual({ a: "hello" });

    const parsed2 = partialSchema.safeParse({ a: "hello", b: "xx", z: 1 });
    expect(parsed2.success).toBeFalsy();
  });
});

describe("verifyToken", () => {
  function mockFetchFactory(presetKeys: (JWK | JWKPublic)[]) {
    return vi.fn(async (): Promise<Response> => {
      const body = JSON.stringify({
        keys: presetKeys,
      });
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }) as typeof globalThis.fetch;
  }

  let token: string;
  let pair: sts.KeysResult;
  const sthis = ensureSuperThis();
  const claimSchema = JWTPayloadSchema.extend({
    test: z.string(),
    test1: z.number(),
  });

  function parseSchema(payload: unknown): Result<z.infer<typeof claimSchema>> {
    const r = claimSchema.safeParse(payload);
    if (r.success) {
      return Result.Ok(r.data);
    } else {
      return Result.Err(r.error);
    }
  }

  beforeAll(async () => {
    pair = await sts.SessionTokenService.generateKeyPair();
    token = await new SignJWT({
      test: "value",
      test1: 123,
    })
      .setProtectedHeader({ alg: pair.alg }) // algorithm
      .setIssuedAt()
      .setIssuer("Test-Case") // issuer
      .setAudience("http://test.com/") // audience
      .setExpirationTime(~~((Date.now() + 60000) / 1000)) // expiration time
      .sign(pair.material.privateKey);
  });

  it("test coerceJWKPublic", async () => {
    const jwkKey = await exportJWK(pair.material.publicKey);

    const jsonString = JSON.stringify(jwkKey);

    for (const input of [
      jwkKey,
      ...[jsonString, sthis.txt.base64.encode(jsonString), sthis.txt.base58.encode(jsonString)].map((input) => [input]).flat(),
    ]) {
      const result = await sts.verifyToken(token, [input], [], { parseSchema });
      expect(result.isOk()).toBe(true);
    }
  });

  it("valid token no fetch", async () => {
    const presetKeys = [await exportJWK(pair.material.publicKey)];
    const wellKnownUrl = ["https://example.com/.well-known/jwks.json"];

    const mockFetch = mockFetchFactory(presetKeys);
    const result = await sts.verifyToken(token, presetKeys, wellKnownUrl, { fetch: mockFetch, parseSchema });
    expect(mockFetch).toHaveBeenCalledTimes(0);
    expect(result.isOk()).toBe(true);
    expect(result.Ok()).toEqual({
      iss: "Test-Case",
      iat: result.Ok().iat,
      exp: result.Ok().exp,
      aud: "http://test.com/",
      test: "value",
      test1: 123,
    });
  });

  it("valid token fetch", async () => {
    const presetKeys: JWKPublic[] = [];
    const wellKnownUrl = ["https://example.com/.well-known/jwks.json"];

    const mockFetch = mockFetchFactory([await exportJWK(pair.material.publicKey)]);
    const result = await sts.verifyToken(token, presetKeys, wellKnownUrl, { fetch: mockFetch, parseSchema });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.isOk()).toBe(true);
    expect(result.Ok()).toEqual({
      iss: "Test-Case",
      iat: result.Ok().iat,
      exp: result.Ok().exp,
      aud: "http://test.com/",
      test: "value",
      test1: 123,
    });
  });

  it("invalid claim", async () => {
    const presetKeys = [await exportJWK(pair.material.publicKey)];
    const token = await new SignJWT({
      test: 111,
      test1: 123,
    })
      .setProtectedHeader({ alg: pair.alg }) // algorithm
      .setIssuedAt()
      .setIssuer("Test-Case") // issuer
      .setAudience("http://test.com/") // audience
      .setExpirationTime(~~((Date.now() + 60000) / 1000)) // expiration time
      .sign(pair.material.privateKey);

    const result = await sts.verifyToken(token, presetKeys, [], { parseSchema });
    expect(result.isErr()).toBe(true);
  });

  it("invalid key", async () => {
    const defectKey = await sts.SessionTokenService.generateKeyPair();
    const presetKeys = [await exportJWK(defectKey.material.publicKey)];

    const result = await sts.verifyToken(token, presetKeys, [], { parseSchema });
    expect(result.isErr()).toBe(true);
  });
});

describe("mimeBlockParser", () => {
  it("parses standard PEM block", () => {
    const input = ["-----BEGIN PUBLIC KEY-----", "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA", "-----END PUBLIC KEY-----"].join(
      "\n",
    );

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBe("-----BEGIN PUBLIC KEY-----");
    expect(blocks[0].end).toBe("-----END PUBLIC KEY-----");
    expect(blocks[0].content).toBe("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA");
    expect(blocks[0].preBegin).toBeUndefined();
    expect(blocks[0].postEnd).toBeUndefined();
  });

  it("parses PEM block with minimum 3 dashes", () => {
    const input = ["---BEGIN CERTIFICATE---", "content line 1", "content line 2", "---END CERTIFICATE---"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBe("---BEGIN CERTIFICATE---");
    expect(blocks[0].end).toBe("---END CERTIFICATE---");
    expect(blocks[0].content).toBe("content line 1\ncontent line 2");
  });

  it("parses case-insensitive BEGIN/END", () => {
    const input = ["-----begin public key-----", "content here", "-----end public key-----"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBe("-----begin public key-----");
    expect(blocks[0].end).toBe("-----end public key-----");
    expect(blocks[0].content).toBe("content here");
  });

  it("parses PEM block with whitespace around dashes", () => {
    const input = ["-----  BEGIN KEY  -----", "key content", "-----  END KEY  -----"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBe("-----  BEGIN KEY  -----");
    expect(blocks[0].end).toBe("-----  END KEY  -----");
    expect(blocks[0].content).toBe("key content");
  });

  it("requires matching dash count between BEGIN and END", () => {
    const input = ["-----BEGIN CERTIFICATE-----", "content", "---END CERTIFICATE---"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    // Should not find matching END due to different dash count
    expect(blocks[0].end).toBeUndefined();
    expect(blocks[0].content).toBe("-----BEGIN CERTIFICATE-----\ncontent\n---END CERTIFICATE---");
  });

  it("parses plain content without markers", () => {
    const input = ["line 1", "line 2", "line 3"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBeUndefined();
    expect(blocks[0].end).toBeUndefined();
    expect(blocks[0].content).toBe("line 1\nline 2\nline 3");
    expect(blocks[0].preBegin).toBeUndefined();
    expect(blocks[0].postEnd).toBeUndefined();
  });

  it("parses multiple PEM blocks", () => {
    const input = [
      "-----BEGIN CERTIFICATE-----",
      "cert content",
      "-----END CERTIFICATE-----",
      "-----BEGIN PRIVATE KEY-----",
      "key content",
      "-----END PRIVATE KEY-----",
    ].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(2);

    expect(blocks[0].begin).toBe("-----BEGIN CERTIFICATE-----");
    expect(blocks[0].end).toBe("-----END CERTIFICATE-----");
    expect(blocks[0].content).toBe("cert content");

    expect(blocks[1].begin).toBe("-----BEGIN PRIVATE KEY-----");
    expect(blocks[1].end).toBe("-----END PRIVATE KEY-----");
    expect(blocks[1].content).toBe("key content");
  });

  it("parses PEM block with preBegin and postEnd content", () => {
    const input = [
      "header text",
      "some info",
      "-----BEGIN KEY-----",
      "key data",
      "-----END KEY-----",
      "footer text",
      "more info",
    ].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].preBegin).toBe("header text\nsome info");
    expect(blocks[0].begin).toBe("-----BEGIN KEY-----");
    expect(blocks[0].content).toBe("key data");
    expect(blocks[0].end).toBe("-----END KEY-----");
    expect(blocks[0].postEnd).toBe("footer text\nmore info");
  });

  it("parses mixed plain and PEM content", () => {
    const input = ["plain text before", "-----BEGIN DATA-----", "encoded data", "-----END DATA-----", "plain text after"].join(
      "\n",
    );

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].preBegin).toBe("plain text before");
    expect(blocks[0].begin).toBe("-----BEGIN DATA-----");
    expect(blocks[0].content).toBe("encoded data");
    expect(blocks[0].end).toBe("-----END DATA-----");
    expect(blocks[0].postEnd).toBe("plain text after");
  });

  it("handles multiline content in PEM block", () => {
    const input = [
      "-----BEGIN CERTIFICATE-----",
      "MIIDXTCCAkWgAwIBAgIJAKL0UG+mRkmqMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV",
      "BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX",
      "aWRnaXRzIFB0eSBMdGQwHhcNMTcwODIzMDg0NjU3WhcNMTgwODIzMDg0NjU3WjBF",
      "-----END CERTIFICATE-----",
    ].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content.split("\n")).toEqual([
      "MIIDXTCCAkWgAwIBAgIJAKL0UG+mRkmqMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV",
      "BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX",
      "aWRnaXRzIFB0eSBMdGQwHhcNMTcwODIzMDg0NjU3WhcNMTgwODIzMDg0NjU3WjBF",
    ]);
  });

  it("handles empty content between markers", () => {
    const input = ["-----BEGIN EMPTY-----", "-----END EMPTY-----"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("");
  });

  it("handles PEM block without matching END", () => {
    const input = ["-----BEGIN INCOMPLETE-----", "content without end", "more content"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    // Should be treated as plain content since no matching END
    expect(blocks[0].begin).toBeUndefined();
    expect(blocks[0].end).toBeUndefined();
    expect(blocks[0].content).toBe("-----BEGIN INCOMPLETE-----\ncontent without end\nmore content");
    expect(blocks[0].preBegin).toBeUndefined();
    expect(blocks[0].postEnd).toBeUndefined();
  });

  it("rejects blocks with fewer than 3 dashes", () => {
    const input = ["--BEGIN KEY--", "content", "--END KEY--"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    // Should be treated as plain content since dashes < 3
    expect(blocks[0].begin).toBeUndefined();
    expect(blocks[0].end).toBeUndefined();
    expect(blocks[0].content).toBe("--BEGIN KEY--\ncontent\n--END KEY--");
  });

  it("handles extra dashes (more than 5)", () => {
    const input = ["-------BEGIN TEST-------", "test content", "-------END TEST-------"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBe("-------BEGIN TEST-------");
    expect(blocks[0].end).toBe("-------END TEST-------");
    expect(blocks[0].content).toBe("test content");
  });

  it("handles different leading and trailing dash counts", () => {
    const input = ["-----BEGIN KEY-------", "content", "-----END KEY-------"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBe("-----BEGIN KEY-------");
    expect(blocks[0].end).toBe("-----END KEY-------");
    expect(blocks[0].content).toBe("content");
  });

  it("handles block types with special regex characters", () => {
    const input = ["-----BEGIN TEST (SPECIAL)-----", "content", "-----END TEST (SPECIAL)-----"].join("\n");

    const blocks = mimeBlockParser(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].begin).toBe("-----BEGIN TEST (SPECIAL)-----");
    expect(blocks[0].end).toBe("-----END TEST (SPECIAL)-----");
    expect(blocks[0].content).toBe("content");
  });
});

describe("coerceJWKPublic", () => {
  const sthis = ensureSuperThis();
  const jwk: JWK = {
    kty: "RSA",
    e: "AQAB",
    n: "zuYkKADAu6UJeBq-G6MUerFLKEQVRUrQ8eJCFMWbh-JlCfr9uoEoxutWO3lpVAaFhq2vhRaYif8xoxCmvM74gCoNqE7DDUUrUTBt5kYSJyxAoLUpmVVg7pecJngcaqtPUekE_UGGJ2E2jHMRQ9thzF64BTaJFpddM45M4VEQs-PNEMnmo0NKWggikFXKCBWhakMsuygyBDtY7q73VLdG-jAG6YsVxDt_27DZ6Lv-iH2SMqM0-Xf4aYvCV_JxS75Emf1srsMC2C6_IJcIYSkxyfS6j_DE_dIzXPJ-quXhNrUgpzo2zvvMF44tDXrkeMQ5CQd06kTWe9_BxqkrVT3wLw",
    alg: "RS256",
  };
  const jwkpub = {
    ...jwk,
    use: "sig",
    kid: "ins_2olzJ4rRwcQ5lPbKNCYdwJ4GrFQ",
  };

  it("accepts JWK object", async () => {
    expect(await sts.coerceJWKPublic(sthis, jwkpub)).toEqual([jwkpub]);
  });
  it("accepts JSON string", async () => {
    expect(await sts.coerceJWKPublic(sthis, JSON.stringify(jwkpub))).toEqual([jwkpub]);
  });
  it("accepts base64 encoded JSON string", async () => {
    expect(await sts.coerceJWKPublic(sthis, sthis.txt.base64.encode(JSON.stringify(jwkpub)))).toEqual([jwkpub]);
  });
  it("accepts base58 encoded JSON string", async () => {
    expect(await sts.coerceJWKPublic(sthis, sthis.txt.base58.encode(JSON.stringify(jwkpub)))).toEqual([jwkpub]);
  });
  it("accepts PEM enclosed JSON string", async () => {
    const pemWrapped = await exportSPKI((await importJWK(jwkpub, "RS256")) as CryptoKey);
    expect(await sts.coerceJWKPublic(sthis, pemWrapped)).toEqual([jwk]);
  });
});

describe("coerceJWK", () => {
  const sthis = ensureSuperThis();
  let jwkPublic: JWK;
  let jwkPrivate: JWK;
  let pair: sts.KeysResult;

  beforeAll(async () => {
    pair = await sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });
    jwkPrivate = await exportJWK(pair.material.privateKey);
    jwkPublic = await exportJWK(pair.material.publicKey);
  });

  describe("with public key", () => {
    it("accepts public JWK object", async () => {
      const result = await sts.coerceJWK(sthis, jwkPublic);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kty: jwkPublic.kty,
        crv: jwkPublic.crv,
        x: jwkPublic.x,
      });
      expect(result[0]).not.toHaveProperty("d");
    });

    it("accepts public JWK as JSON string", async () => {
      const result = await sts.coerceJWK(sthis, JSON.stringify(jwkPublic));
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("d");
    });

    it("accepts public JWK as base64 encoded JSON", async () => {
      const result = await sts.coerceJWK(sthis, sthis.txt.base64.encode(JSON.stringify(jwkPublic)));
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("d");
    });

    it("accepts public JWK as base58 encoded JSON", async () => {
      const result = await sts.coerceJWK(sthis, sthis.txt.base58.encode(JSON.stringify(jwkPublic)));
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("d");
    });

    it("accepts public JWK via jwk2env", async () => {
      const encoded = await sts.jwk2env(pair.material.publicKey, sthis);
      const result = await sts.coerceJWK(sthis, encoded);
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("d");
    });
  });

  describe("with private key", () => {
    it("accepts private JWK object", async () => {
      const result = await sts.coerceJWK(sthis, jwkPrivate);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kty: jwkPrivate.kty,
        crv: jwkPrivate.crv,
        x: jwkPrivate.x,
        d: jwkPrivate.d, // Should preserve private key component
      });
    });

    it("accepts private JWK as JSON string", async () => {
      const result = await sts.coerceJWK(sthis, JSON.stringify(jwkPrivate));
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("d"); // Should preserve private key component
    });

    it("accepts private JWK as base64 encoded JSON", async () => {
      const result = await sts.coerceJWK(sthis, sthis.txt.base64.encode(JSON.stringify(jwkPrivate)));
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("d");
    });

    it("accepts private JWK as base58 encoded JSON", async () => {
      const result = await sts.coerceJWK(sthis, sthis.txt.base58.encode(JSON.stringify(jwkPrivate)));
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("d");
    });

    it("accepts private JWK via jwk2env", async () => {
      const encoded = await sts.jwk2env(pair.material.privateKey, sthis);
      const result = await sts.coerceJWK(sthis, encoded);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("d");
    });

    it("preserves private key through env2jwk", async () => {
      const encoded = await sts.jwk2env(pair.material.privateKey, sthis);
      const cryptoKeys = await sts.env2jwk(encoded, undefined, sthis);
      expect(cryptoKeys).toHaveLength(1);

      // Export and verify private key is preserved
      const exported = await exportJWK(cryptoKeys[0]);
      expect(exported).toHaveProperty("d");
    });
  });

  describe("with multiple keys", () => {
    it("accepts array of mixed public and private keys", async () => {
      const result = await sts.coerceJWK(sthis, [jwkPrivate, jwkPublic]);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("d"); // Private key
      expect(result[1]).not.toHaveProperty("d"); // Public key
    });
  });
});

describe("coerceJWKPrivate", () => {
  const sthis = ensureSuperThis();
  let jwkPrivate: JWK;
  let jwkPublic: JWK;
  let pair: sts.KeysResult;

  beforeAll(async () => {
    pair = await sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });
    jwkPrivate = await exportJWK(pair.material.privateKey);
    jwkPublic = await exportJWK(pair.material.publicKey);
  });

  it("accepts private JWK object", async () => {
    const result = await sts.coerceJWKPrivate(sthis, jwkPrivate);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kty: jwkPrivate.kty,
      crv: jwkPrivate.crv,
      d: jwkPrivate.d,
    });
  });

  it("accepts private JWK as JSON string", async () => {
    const result = await sts.coerceJWKPrivate(sthis, JSON.stringify(jwkPrivate));
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("d");
  });

  it("accepts private JWK as base64 encoded JSON", async () => {
    const result = await sts.coerceJWKPrivate(sthis, sthis.txt.base64.encode(JSON.stringify(jwkPrivate)));
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("d");
  });

  it("accepts private JWK as base58 encoded JSON", async () => {
    const result = await sts.coerceJWKPrivate(sthis, sthis.txt.base58.encode(JSON.stringify(jwkPrivate)));
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("d");
  });

  it("accepts private JWK via jwk2env", async () => {
    const encoded = await sts.jwk2env(pair.material.privateKey, sthis);
    const result = await sts.coerceJWKPrivate(sthis, encoded);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("d");
  });

  it("rejects public JWK (missing private key component)", async () => {
    const result = await sts.coerceJWKPrivate(sthis, jwkPublic);
    expect(result).toHaveLength(0); // Should return empty array when validation fails
  });

  it("rejects public JWK as JSON string", async () => {
    const result = await sts.coerceJWKPrivate(sthis, JSON.stringify(jwkPublic));
    expect(result).toHaveLength(0);
  });

  it("rejects public JWK via jwk2env", async () => {
    const encoded = await sts.jwk2env(pair.material.publicKey, sthis);
    const result = await sts.coerceJWKPrivate(sthis, encoded);
    expect(result).toHaveLength(0);
  });

  it("filters out public keys from mixed array", async () => {
    const result = await sts.coerceJWKPrivate(sthis, [jwkPrivate, jwkPublic]);
    expect(result).toHaveLength(1); // Only the private key should be accepted
    expect(result[0]).toHaveProperty("d");
  });
});

describe("coerceJWKWithSchema - mixed Private/Public keys in { keys: [...] } arrays", () => {
  const sthis = ensureSuperThis();
  let rsaPrivateKey: JWK;
  let rsaPublicKey: JWK;
  let ecPrivateKey: JWK;
  let ecPublicKey: JWK;
  let rsaPair: sts.KeysResult;
  let ecPair: sts.KeysResult;

  beforeAll(async () => {
    // Generate RSA key pair
    rsaPair = await sts.SessionTokenService.generateKeyPair("RS256", { extractable: true });
    rsaPrivateKey = await exportJWK(rsaPair.material.privateKey);
    rsaPublicKey = await exportJWK(rsaPair.material.publicKey);

    // Generate EC key pair
    ecPair = await sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });
    ecPrivateKey = await exportJWK(ecPair.material.privateKey);
    ecPublicKey = await exportJWK(ecPair.material.publicKey);
  });

  // Encoding functions for test parameterization
  const encodings = [
    {
      name: "plain object",
      encode: (obj: { keys: JWK[] }) => obj as { keys: JWK[] },
    },
    {
      name: "JSON string",
      encode: (obj: { keys: JWK[] }) => JSON.stringify(obj),
    },
    {
      name: "base64",
      encode: (obj: { keys: JWK[] }) => sthis.txt.base64.encode(JSON.stringify(obj)),
    },
    {
      name: "base58",
      encode: (obj: { keys: JWK[] }) => sthis.txt.base58.encode(JSON.stringify(obj)),
    },
  ];

  describe.each(encodings)("with encoding: $name", ({ encode }) => {
    describe("JWKPrivateSchema validation", () => {
      it("accepts { keys: [private] }", async () => {
        const input = encode({ keys: [rsaPrivateKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("RSA");
        }
      });

      it("rejects { keys: [public] }", async () => {
        const input = encode({ keys: [rsaPublicKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isErr()).toBe(true);
      });

      it("handles { keys: [private, public] } - accepts only private", async () => {
        const input = encode({ keys: [rsaPrivateKey, rsaPublicKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(2);
        expect(results[0].isOk()).toBe(true);
        expect(results[1].isErr()).toBe(true);

        if (results[0].isOk()) {
          expect(results[0].Ok()).toHaveProperty("d");
        }
      });

      it("handles { keys: [public, private] } - reversed order", async () => {
        const input = encode({ keys: [ecPublicKey, ecPrivateKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(2);
        expect(results[0].isErr()).toBe(true);
        expect(results[1].isOk()).toBe(true);

        if (results[1].isOk()) {
          expect(results[1].Ok()).toHaveProperty("d");
          expect(results[1].Ok().kty).toBe("EC");
        }
      });

      it("handles { keys: [rsaPrivate, ecPrivate] } - multiple private keys", async () => {
        const input = encode({ keys: [rsaPrivateKey, ecPrivateKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(2);
        expect(results[0].isOk()).toBe(true);
        expect(results[1].isOk()).toBe(true);

        if (results[0].isOk() && results[1].isOk()) {
          expect(results[0].Ok()).toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("RSA");
          expect(results[1].Ok()).toHaveProperty("d");
          expect(results[1].Ok().kty).toBe("EC");
        }
      });

      it("handles { keys: [rsaPrivate, ecPublic, ecPrivate, rsaPublic] } - complex mix", async () => {
        const input = encode({ keys: [rsaPrivateKey, ecPublicKey, ecPrivateKey, rsaPublicKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(4);
        expect(results[0].isOk()).toBe(true); // RSA private
        expect(results[1].isErr()).toBe(true); // EC public should fail
        expect(results[2].isOk()).toBe(true); // EC private
        expect(results[3].isErr()).toBe(true); // RSA public should fail
      });
    });

    describe("JWKPublicSchema validation", () => {
      it("accepts { keys: [public] }", async () => {
        const input = encode({ keys: [rsaPublicKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).not.toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("RSA");
        }
      });

      it("strips private component from { keys: [private] }", async () => {
        const input = encode({ keys: [rsaPrivateKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).not.toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("RSA");
        }
      });

      it("handles { keys: [private, public] } - accepts both, strips private from first", async () => {
        const input = encode({ keys: [rsaPrivateKey, rsaPublicKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(2);
        expect(results[0].isOk()).toBe(true);
        expect(results[1].isOk()).toBe(true);

        if (results[0].isOk() && results[1].isOk()) {
          expect(results[0].Ok()).not.toHaveProperty("d");
          expect(results[1].Ok()).not.toHaveProperty("d");
        }
      });

      it("handles { keys: [public, private, public] }", async () => {
        const input = encode({ keys: [ecPublicKey, ecPrivateKey, rsaPublicKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(3);
        expect(results[0].isOk()).toBe(true);
        expect(results[1].isOk()).toBe(true);
        expect(results[2].isOk()).toBe(true);

        if (results[0].isOk() && results[1].isOk() && results[2].isOk()) {
          expect(results[0].Ok()).not.toHaveProperty("d");
          expect(results[1].Ok()).not.toHaveProperty("d");
          expect(results[2].Ok()).not.toHaveProperty("d");
        }
      });

      it("handles { keys: [rsaPrivate, ecPublic, rsaPublic, ecPrivate] } - complex mix", async () => {
        const input = encode({ keys: [rsaPrivateKey, ecPublicKey, rsaPublicKey, ecPrivateKey] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(4);
        results.forEach((result) => {
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(result.Ok()).not.toHaveProperty("d");
          }
        });
      });
    });

    describe("edge cases", () => {
      it("handles empty { keys: [] }", async () => {
        const input = encode({ keys: [] });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(0);
      });

      it("handles many mixed keys", async () => {
        const input = encode({
          keys: [
            rsaPrivateKey,
            rsaPublicKey,
            ecPrivateKey,
            ecPublicKey,
            rsaPrivateKey, // duplicate
            ecPublicKey, // duplicate
          ],
        });
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(6);
        results.forEach((result) => {
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(result.Ok()).not.toHaveProperty("d");
          }
        });
      });
    });
  });

  describe("multiple inputs (not encoding-specific)", () => {
    it("handles multiple { keys: [...] } objects as separate arguments", async () => {
      const input1 = { keys: [rsaPrivateKey, rsaPublicKey] };
      const input2 = { keys: [ecPrivateKey] };
      const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input1, input2);

      expect(results).toHaveLength(3);
      expect(results[0].isOk()).toBe(true); // RSA private
      expect(results[1].isErr()).toBe(true); // RSA public
      expect(results[2].isOk()).toBe(true); // EC private
    });

    it("handles array of { keys: [...] } objects", async () => {
      const inputs = [{ keys: [rsaPrivateKey, rsaPublicKey] }, { keys: [ecPrivateKey, ecPublicKey] }];
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, inputs);

      expect(results).toHaveLength(4);
      results.forEach((result) => {
        expect(result.isOk()).toBe(true);
      });
    });

    it("handles mix of plain keys and { keys: [...] }", async () => {
      const inputs = [rsaPrivateKey, { keys: [ecPrivateKey, ecPublicKey] }, rsaPublicKey];
      const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, inputs);

      expect(results).toHaveLength(4);
      expect(results[0].isOk()).toBe(true); // RSA private (plain)
      expect(results[1].isOk()).toBe(true); // EC private (from keys)
      expect(results[2].isErr()).toBe(true); // EC public (from keys)
      expect(results[3].isErr()).toBe(true); // RSA public (plain)
    });
  });
});

describe("coerceJWKWithSchema - single key objects (not { keys: [...] } wrapped)", () => {
  const sthis = ensureSuperThis();
  let rsaPrivateKey: JWK;
  let rsaPublicKey: JWK;
  let ecPrivateKey: JWK;
  let ecPublicKey: JWK;
  let rsaPair: sts.KeysResult;
  let ecPair: sts.KeysResult;

  beforeAll(async () => {
    rsaPair = await sts.SessionTokenService.generateKeyPair("RS256", { extractable: true });
    rsaPrivateKey = await exportJWK(rsaPair.material.privateKey);
    rsaPublicKey = await exportJWK(rsaPair.material.publicKey);

    ecPair = await sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });
    ecPrivateKey = await exportJWK(ecPair.material.privateKey);
    ecPublicKey = await exportJWK(ecPair.material.publicKey);
  });

  // Encoding functions for single JWK objects
  const encodings = [
    {
      name: "plain JWK object",
      encode: (jwk: JWK) => jwk,
    },
    {
      name: "JSON string",
      encode: (jwk: JWK) => JSON.stringify(jwk),
    },
    {
      name: "base64",
      encode: (jwk: JWK) => sthis.txt.base64.encode(JSON.stringify(jwk)),
    },
    {
      name: "base58",
      encode: (jwk: JWK) => sthis.txt.base58.encode(JSON.stringify(jwk)),
    },
  ];

  describe.each(encodings)("with encoding: $name", ({ encode }) => {
    describe("JWKPrivateSchema validation", () => {
      it("accepts private key", async () => {
        const input = encode(rsaPrivateKey);
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("RSA");
        }
      });

      it("rejects public key", async () => {
        const input = encode(rsaPublicKey);
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isErr()).toBe(true);
      });

      it("accepts EC private key", async () => {
        const input = encode(ecPrivateKey);
        const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("EC");
        }
      });
    });

    describe("JWKPublicSchema validation", () => {
      it("accepts public key", async () => {
        const input = encode(rsaPublicKey);
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).not.toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("RSA");
        }
      });

      it("strips private component from private key", async () => {
        const input = encode(rsaPrivateKey);
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).not.toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("RSA");
        }
      });

      it("accepts and processes EC public key", async () => {
        const input = encode(ecPublicKey);
        const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, input);

        expect(results).toHaveLength(1);
        expect(results[0].isOk()).toBe(true);
        if (results[0].isOk()) {
          expect(results[0].Ok()).not.toHaveProperty("d");
          expect(results[0].Ok().kty).toBe("EC");
        }
      });
    });
  });

  describe("multiple single key inputs", () => {
    it("handles array of plain JWK objects with private schema", async () => {
      const inputs = [rsaPrivateKey, ecPrivateKey];
      const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, inputs);

      expect(results).toHaveLength(2);
      expect(results[0].isOk()).toBe(true);
      expect(results[1].isOk()).toBe(true);
    });

    it("handles array of mixed plain JWK objects with private schema", async () => {
      const inputs = [rsaPrivateKey, rsaPublicKey, ecPrivateKey];
      const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, inputs);

      expect(results).toHaveLength(3);
      expect(results[0].isOk()).toBe(true); // Private
      expect(results[1].isErr()).toBe(true); // Public should fail
      expect(results[2].isOk()).toBe(true); // Private
    });

    it("handles array of mixed plain JWK objects with public schema", async () => {
      const inputs = [rsaPrivateKey, rsaPublicKey, ecPublicKey];
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, inputs);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.Ok()).not.toHaveProperty("d");
        }
      });
    });

    it("handles separate arguments (not array)", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPrivateSchema, rsaPrivateKey, ecPrivateKey);

      expect(results).toHaveLength(2);
      expect(results[0].isOk()).toBe(true);
      expect(results[1].isOk()).toBe(true);
    });
  });
});

describe("coerceJWKWithSchema - error cases and invalid inputs", () => {
  const sthis = ensureSuperThis();
  let rsaPrivateKey: JWK;
  let rsaPublicKey: JWK;

  beforeAll(async () => {
    const rsaPair = await sts.SessionTokenService.generateKeyPair("RS256", { extractable: true });
    rsaPrivateKey = await exportJWK(rsaPair.material.privateKey);
    rsaPublicKey = await exportJWK(rsaPair.material.publicKey);
  });

  describe("invalid JSON strings", () => {
    it("handles invalid JSON string", async () => {
      const invalidJson = "{ this is not valid json }";
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJson);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("handles base64 encoded invalid JSON", async () => {
      const invalidJson = "{ not valid json either }";
      const encoded = sthis.txt.base64.encode(invalidJson);
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, encoded);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("handles base58 encoded invalid JSON", async () => {
      const invalidJson = "{ malformed: json }";
      const encoded = sthis.txt.base58.encode(invalidJson);
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, encoded);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("handles truncated JSON string", async () => {
      const truncated = JSON.stringify(rsaPublicKey).slice(0, -10); // Cut off the end
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, truncated);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });
  });

  describe("invalid JWK structures", () => {
    it("rejects JWK missing required 'kty' field", async () => {
      const invalidJwk = { e: "AQAB", n: "somevalue" }; // Missing kty
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJwk);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects JWK with invalid 'kty' value", async () => {
      const invalidJwk = { kty: "INVALID", e: "AQAB", n: "somevalue" };
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJwk);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects RSA key missing required 'n' field", async () => {
      const invalidJwk = { kty: "RSA", e: "AQAB" }; // Missing n
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJwk);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects RSA key missing required 'e' field", async () => {
      const invalidJwk = { kty: "RSA", n: "somevalue" }; // Missing e
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJwk);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects EC key missing required 'x' field", async () => {
      const invalidJwk = { kty: "EC", crv: "P-256", y: "somevalue" }; // Missing x
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJwk);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects EC key missing required 'crv' field", async () => {
      const invalidJwk = { kty: "EC", x: "somevalue", y: "anothervalue" }; // Missing crv
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJwk);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects EC key with invalid curve", async () => {
      const invalidJwk = { kty: "EC", crv: "INVALID-CURVE", x: "somevalue", y: "anothervalue" };
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalidJwk);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });
  });

  describe("invalid { keys: [...] } structures", () => {
    it("rejects { keys: 'not-an-array' }", async () => {
      const invalid = { keys: "not an array" } as unknown as { keys: JWK[] };
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalid);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects { keys: null }", async () => {
      const invalid = { keys: null } as unknown as { keys: JWK[] };
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalid);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects { keys: {} }", async () => {
      const invalid = { keys: {} } as { keys: JWK[] };
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, invalid);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("handles { keys: [...] } with mix of valid and invalid JWKs", async () => {
      const mixed = {
        keys: [
          rsaPublicKey, // valid
          { kty: "INVALID" }, // invalid
          rsaPrivateKey, // valid
        ],
      };
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, mixed);

      expect(results).toHaveLength(3);
      expect(results[0].isOk()).toBe(true);
      expect(results[1].isErr()).toBe(true);
      expect(results[2].isOk()).toBe(true);
    });

    it("handles JSON stringified { keys: [...] } with invalid entries", async () => {
      const mixed = JSON.stringify({
        keys: [rsaPublicKey, { invalid: "structure" }],
      });
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, mixed);

      expect(results).toHaveLength(2);
      expect(results[0].isOk()).toBe(true);
      expect(results[1].isErr()).toBe(true);
    });
  });

  describe("completely invalid data types", () => {
    it("rejects number input", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, 12345 as never);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects boolean input", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, true as never);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects array of invalid types", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, [123, true, "invalid"] as never);

      expect(results).toHaveLength(3);
      expect(results[0].isErr()).toBe(true);
      expect(results[1].isErr()).toBe(true);
      expect(results[2].isErr()).toBe(true);
    });

    it("rejects empty object", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, {});

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects null", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, null as never);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("rejects undefined", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, undefined as never);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });
  });

  describe("edge cases with encoding", () => {
    it("handles corrupted base64 string", async () => {
      const corrupted = "!!!invalid-base64!!!";
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, corrupted);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("handles empty string", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, "");

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("handles whitespace-only string", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, "   \n\t  ");

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });

    it("handles string that looks like JSON but isn't", async () => {
      const fakeJson = "{looks like json but missing quotes and commas}";
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, fakeJson);

      expect(results).toHaveLength(1);
      expect(results[0].isErr()).toBe(true);
    });
  });

  describe("mixed valid and invalid inputs", () => {
    it("processes array with mix of valid keys and invalid data", async () => {
      const mixed = [
        rsaPublicKey, // valid
        "invalid string", // invalid
        rsaPrivateKey, // valid
        { invalid: "object" }, // invalid
      ] as never[];
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, mixed);

      expect(results).toHaveLength(4);
      expect(results[0].isOk()).toBe(true);
      expect(results[1].isErr()).toBe(true);
      expect(results[2].isOk()).toBe(true);
      expect(results[3].isErr()).toBe(true);
    });

    it("processes multiple arguments with some invalid", async () => {
      const results = await sts.coerceJWKWithSchema(sthis, JWKPublicSchema, rsaPublicKey, "invalid", rsaPrivateKey);

      expect(results).toHaveLength(3);
      expect(results[0].isOk()).toBe(true);
      expect(results[1].isErr()).toBe(true);
      expect(results[2].isOk()).toBe(true);
    });
  });
});
