import { BuildURI, CoerceURI, KeyedResolvOnce, Result, exception2Result, timeouted } from "@adviser/cement";
import { exportJWK, importJWK, JWTVerifyResult, jwtVerify, SignJWT, JWK } from "jose";
import { generateKeyPair, GenerateKeyPairOptions } from "jose/key/generate/keypair";
import { base58btc } from "multiformats/bases/base58";
import { ensureSuperThis, mimeBlockParser } from "../utils.js";
import { JWKPublic, JWKPublicSchema, SuperThis } from "@fireproof/core-types-base";
import { BaseTokenParam, FPCloudClaim, TokenForParam } from "@fireproof/core-types-protocols-cloud";
import { z } from "zod";

export const envKeyDefaults = {
  SECRET: "CLOUD_SESSION_TOKEN_SECRET",
  PUBLIC: "CLOUD_SESSION_TOKEN_PUBLIC",
};

interface SessionTokenServiceParam extends Partial<BaseTokenParam> {
  readonly token: string; // env encoded jwk
}

interface SessionTokenServiceFromEnvParam extends Partial<BaseTokenParam> {
  readonly privateEnvKey?: string; // defaults CLOUD_SESSION_TOKEN_SECRET
  readonly publicEnvKey?: string; // defaults CLOUD_SESSION_TOKEN_PUBLIC
}

export async function jwk2env(jwk: CryptoKey, sthis = ensureSuperThis()): Promise<string> {
  const inPubKey = await exportJWK(jwk);
  return base58btc.encode(sthis.txt.encode(JSON.stringify(inPubKey)));
}

export async function env2jwk(env: string, alg: string, sthis = ensureSuperThis()): Promise<CryptoKey> {
  const inJWT = JSON.parse(sthis.txt.decode(base58btc.decode(env)));
  return importJWK(inJWT, alg, { extractable: true }) as Promise<CryptoKey>;
}

export interface KeysResult {
  readonly alg: string;
  readonly material: CryptoKeyPair;
  readonly strings: { readonly publicKey: string; readonly privateKey: string };
}

export class SessionTokenService {
  readonly #key: CryptoKey;
  readonly #param: SessionTokenServiceParam;

  static async generateKeyPair(
    alg = "ES256",
    options: GenerateKeyPairOptions = { extractable: true },
    generateKeyPairFN = (alg: string, options: GenerateKeyPairOptions) => generateKeyPair(alg, options),
  ): Promise<KeysResult> {
    const material = await generateKeyPairFN(alg, options);
    return {
      alg,
      material,
      strings: {
        publicKey: await jwk2env(material.publicKey),
        privateKey: await jwk2env(material.privateKey),
      },
    };
  }

  static async createFromEnv(sthis: SuperThis, sp: SessionTokenServiceFromEnvParam = {}) {
    let envToken = sthis.env.get(sp.privateEnvKey ?? envKeyDefaults.SECRET);
    if (!envToken) {
      envToken = sthis.env.get(sp.publicEnvKey ?? envKeyDefaults.PUBLIC);
    }
    if (!envToken) {
      throw new Error(
        `env not found for: ${sp.privateEnvKey ?? envKeyDefaults.SECRET} or ${sp.publicEnvKey ?? envKeyDefaults.PUBLIC}`,
      );
    }
    return SessionTokenService.create({ token: envToken }, sthis);
  }

  static async create(stsparam: SessionTokenServiceParam, sthis: SuperThis = ensureSuperThis()) {
    const key = await env2jwk(stsparam.token, stsparam.alg ?? "ES256", sthis);
    return new SessionTokenService(key, stsparam);
  }

  private constructor(key: CryptoKey, stsparam: SessionTokenServiceParam) {
    this.#key = key;
    this.#param = stsparam;
  }

  get validFor() {
    let validFor = this.#param.validFor ?? 3600;
    if (!(0 <= validFor && validFor <= 3600000)) {
      validFor = 3600000;
    }
    return validFor;
  }

  get alg() {
    return this.#param.alg ?? "ES256";
  }

  get isssuer() {
    return this.#param.issuer ?? "fireproof";
  }

  get audience() {
    return this.#param.audience ?? "fireproof";
  }

  async validate(token: string): Promise<Result<JWTVerifyResult<FPCloudClaim>>> {
    return exception2Result(async () => {
      const ret = await jwtVerify<FPCloudClaim>(token, this.#key);
      return ret;
    });
  }

  // async getEnvKey(): Promise<string> {
  //   return jwk2env(ensureSuperThis(), this.#key);
  // }

  async tokenFor(p: TokenForParam): Promise<string> {
    if (this.#key.type !== "private") {
      throw new Error("key must be private");
    }
    const token = await new SignJWT({
      userId: p.userId,
      tenants: p.tenants,
      ledgers: p.ledgers,
      email: p.email ?? "test@test.de",
      created: new Date(),
      selected: {
        tenant: p.tenants[0].id,
        ledger: p.ledgers[0].id,
      },
    } satisfies FPCloudClaim)
      .setProtectedHeader({ alg: this.alg }) // algorithm
      .setIssuedAt()
      .setIssuer(p.issuer ?? this.isssuer) // issuer
      .setAudience(p.audience ?? this.audience) // audience
      .setExpirationTime(Date.now() + (p.validFor ?? this.validFor)) // expiration time
      .sign(this.#key);
    return token;
  }
}

const keysFromWellKnownJwksCache = new KeyedResolvOnce<JWKPublic[]>({
  resetAfter: 30 * 60 * 1000, // 30 minutes
});

export interface VerifyTokenOptions<T> {
  readonly fetchTimeoutMs: number;
  readonly sthis: SuperThis;
  readonly parseSchema: (payload: unknown) => Result<T>;
  readonly fetch: typeof globalThis.fetch;
  readonly verifyToken: (token: string, pubKey: JWK) => Promise<Result<{ payload: unknown }>>;
}

type CoerceJWKType = string | JWK | JWKPublic;

function testEncodeJWK(k: string, decodeFn: (input: string) => string): Result<JWK> {
  const res = exception2Result(() => decodeFn(k));
  if (res.isErr()) {
    return Result.Err(res);
  }
  const resStr = res.Ok();
  const key = exception2Result(() => JSON.parse(resStr)) as Result<JWK>;
  if (key.isOk()) {
    const parsed = JWKPublicSchema.safeParse(key.Ok());
    if (parsed.success) {
      return Result.Ok(parsed.data);
    } else {
      return Result.Err(`Invalid JWK format: ${parsed.error.message}`);
    }
  }
  return key;
}

export function coerceJWKPublic(sthis: SuperThis, ...i: (CoerceJWKType | CoerceJWKType[])[]): JWK[] {
  return i
    .flat()
    .map((k) => {
      if (typeof k === "string") {
        for (const { content } of mimeBlockParser(k)) {
          for (const decodeFn of [(a: string) => a, sthis.txt.base64.decode, sthis.txt.base58.decode]) {
            const rKey = testEncodeJWK(content, decodeFn);
            if (rKey.isOk()) {
              return [rKey.Ok()];
            }
          }
        }
        return [];
      } else {
        return [k];
      }
    })
    .flat();
}

export async function verifyToken<R>(
  token: string,
  presetPubKey: (string | JWK | JWKPublic)[],
  wellKnownUrls: CoerceURI[],
  iopts: Partial<VerifyTokenOptions<R>> = {},
): Promise<Result<R>> {
  const opts: VerifyTokenOptions<R> = {
    fetchTimeoutMs: 1000,
    parseSchema: (payload: unknown): Result<R> => {
      return Result.Ok(payload as R);
    },
    fetch: globalThis.fetch,
    verifyToken: async (token: string, pubKey: JWK): Promise<Result<{ payload: unknown }>> => {
      const rRes = await exception2Result(() => jwtVerify(token, pubKey));
      if (rRes.isErr()) {
        return Result.Err(rRes);
      }
      const res = rRes.Ok();
      if (!res) {
        return Result.Err("JWT verification failed");
      }
      return Result.Ok(res);
    },
    ...iopts,
    sthis: iopts.sthis ?? ensureSuperThis(),
  };

  for (const pubKey of presetPubKey) {
    const coercedKeys = coerceJWKPublic(opts.sthis, pubKey);
    for (const key of coercedKeys) {
      const rVerify = await internVerifyToken(token, key, opts);
      if (rVerify.isOk()) {
        return rVerify;
      }
    }
  }
  const errors: Error[] = [];
  for (const cUrl of wellKnownUrls) {
    const url = BuildURI.from(cUrl);
    const p = url.URI();
    if (p.pathname === "" || p.pathname === "/") {
      url.pathname("/.well-known/jwks.json");
    }
    const rPubKeys = await fetchWellKnownJwks(url.toString(), opts);
    if (rPubKeys.isErr()) {
      errors.push(rPubKeys.Err());
      continue;
    }
    for (const pubKey of rPubKeys.Ok()) {
      const rVerify = await internVerifyToken(token, pubKey, opts);
      if (rVerify.isOk()) {
        return rVerify;
      }
      // console.log("xxx", pubKey, rVerify.Err());
    }
  }
  return Result.Err(`No well-known JWKS URL could verify the token: ${errors.map((e) => e.message).join("; ")}`);
}

async function fetchWellKnownJwks(url: string, opts: VerifyTokenOptions<unknown>): Promise<Result<JWKPublic[]>> {
  return keysFromWellKnownJwksCache.get(url).once(async () => {
    const timeout = await timeouted(
      (opts.fetch ?? fetch)(url, {
        method: "GET",
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch well-known JWKS from ${url}: ${res.status} ${res.statusText}`);
        }
        return res.json();
      }),
      {
        timeout: opts.fetchTimeoutMs ?? 1000,
      },
    );
    // console.log(">>>>>>", JSON.stringify(timeout));
    switch (timeout.state) {
      case "timeout":
        return Result.Err(`Timeout fetching well-known JWKS from ${url}`);
      case "error":
        return Result.Err(`Error fetching well-known JWKS from ${url}: ${timeout.error.message}`);
      case "success": {
        const parsed = z.object({ keys: JWKPublicSchema.array() }).safeParse(timeout.value);
        if (!parsed.success) {
          return Result.Err(parsed.error);
        }
        return Result.Ok(parsed.data.keys);
      }
      default:
        return Result.Err("Unknown error fetching well-known JWKS");
    }
  });
}

async function internVerifyToken<R>(token: string, presetPubKey: JWK | JWKPublic, opts: VerifyTokenOptions<R>): Promise<Result<R>> {
  // console.log("internVerifyToken", token, presetPubKey);
  const rVerify = await opts.verifyToken(token, presetPubKey);
  if (rVerify.isErr()) {
    return Result.Err(rVerify);
  }
  return opts.parseSchema(rVerify.Ok().payload);
}
