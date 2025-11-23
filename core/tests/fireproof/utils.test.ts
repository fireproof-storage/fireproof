import { runtimeFn, URI } from "@adviser/cement";
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
import { JWK } from "jose";
import { SignJWT } from "jose/jwt/sign";
import { exportJWK } from "jose/key/export";
import { JWKPublic, JWTPayloadSchema } from "use-fireproof";
import { UUID } from "uuidv7";
import { describe, beforeAll, it, expect, assert, vi } from "vitest";
import { z } from "zod";

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
    const pemKey = await exportJWK(pair.material.publicKey);

    function encloseInPemBlock(jwkString: string): string {
      const lines = [];
      const type = "PUBLIC KEY";
      lines.push(`-----BEGIN ${type}-----`);
      if (jwkString.startsWith("{")) {
        lines.push(JSON.stringify(JSON.parse(jwkString), null, 2));
      } else {
        for (let i = 0; i < jwkString.length; i += 64) {
          lines.push(jwkString.slice(i, i + 64));
        }
      }
      lines.push(`-----END ${type}-----`);
      return lines.join("\n");
    }
    const jsonString = JSON.stringify(pemKey);

    for (const input of [
      pemKey,
      ...[jsonString, sthis.txt.base64.encode(jsonString), sthis.txt.base58.encode(jsonString)]
        .map((input) => [input, encloseInPemBlock(input)])
        .flat(),
    ]) {
      const result = await sts.verifyToken(token, [input], [], claimSchema);
      expect(result.isOk()).toBe(true);
    }
  });

  it("valid token no fetch", async () => {
    const presetKeys = [await exportJWK(pair.material.publicKey)];
    const wellKnownUrl = ["https://example.com/.well-known/jwks.json"];

    const mockFetch = mockFetchFactory(presetKeys);
    const result = await sts.verifyToken(token, presetKeys, wellKnownUrl, claimSchema, { fetch: mockFetch });
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
    const result = await sts.verifyToken(token, presetKeys, wellKnownUrl, claimSchema, { fetch: mockFetch });
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

    const result = await sts.verifyToken(token, presetKeys, [], claimSchema);
    expect(result.isErr()).toBe(true);
  });

  it("invalid key", async () => {
    const defectKey = await sts.SessionTokenService.generateKeyPair();
    const presetKeys = [await exportJWK(defectKey.material.publicKey)];

    const result = await sts.verifyToken(token, presetKeys, [], claimSchema);
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
