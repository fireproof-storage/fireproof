import { BuildURI, CoerceURI, KeyedResolvOnce, Option, Result, exception2Result, timeouted } from "@adviser/cement";
import { exportJWK, importJWK as joseImportJWK, JWTVerifyResult, jwtVerify, SignJWT, JWK, importSPKI } from "jose";
import { generateKeyPair, GenerateKeyPairOptions } from "jose/key/generate/keypair";
import { base58btc } from "multiformats/bases/base58";
import { ensureSuperThis, mimeBlockParser, filterOk } from "../utils.js";
import { JWKPrivate, JWKPrivateSchema, JWKPublic, JWKPublicSchema, SuperThis, toJwksAlg } from "@fireproof/core-types-base";
import { BaseTokenParam, FPCloudClaim, TokenForParam } from "@fireproof/core-types-protocols-cloud";
import { z } from "zod/v4";

export const envKeyDefaults = {
  SECRET: "CLOUD_SESSION_TOKEN_SECRET",
  PUBLIC: "CLOUD_SESSION_TOKEN_PUBLIC",
};

export interface ImportJWKResult {
  readonly key: CryptoKey;
  readonly alg: string;
}

export interface KeysResult {
  readonly alg: string;
  readonly material: CryptoKeyPair;
  readonly strings: { readonly publicKey: string; readonly privateKey: string };
}
// the string could be a json encoded jwk, a
// base64/base58 encoded jwk,
// a pem block
// or a jwks object string
// and the result of encoding could be plain key or keys object
// or other says string -> encoded -> JWKPublic | JWKPrivate | KeyesJWKPublic | KeyesJWKPrivate
type CoerceJWKType = string | JWK | { keys: JWK[] };

/**
 * Wrapper around jose's importJWK that automatically infers the algorithm if not provided.
 * Returns a Result instead of throwing errors for better error handling.
 *
 * @param jwk - The JWK to import
 * @param alg - Optional algorithm. If not provided, will be inferred from the JWK
 * @param options - Additional options to pass to jose's importJWK
 * @returns Result containing the CryptoKey and algorithm or an error
 */
export async function importJWK(
  jwk: JWK,
  alg?: string,
  options?: Parameters<typeof joseImportJWK>[2],
): Promise<Result<ImportJWKResult>> {
  let algorithm: string;
  if (alg) {
    algorithm = alg;
  } else {
    const rAlg = toJwksAlg(jwk);
    if (rAlg.isErr()) {
      return Result.Err(rAlg);
    }
    algorithm = rAlg.Ok();
  }
  const rKey = await exception2Result(() => joseImportJWK(jwk, algorithm, options) as Promise<CryptoKey>);
  if (rKey.isErr()) {
    return Result.Err(rKey);
  }
  return Result.Ok({ key: rKey.Ok(), alg: algorithm });
}

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

export async function env2jwk(env: string, alg?: string, sthis = ensureSuperThis()): Promise<CryptoKey[]> {
  const jwks = await coerceJWK(sthis, env);
  if (jwks.length === 0) {
    throw new Error("No valid JWK found in env");
  }
  const keys: CryptoKey[] = [];
  for (const jwk of jwks) {
    const rKey = await importJWK(jwk, alg, { extractable: true });
    if (rKey.isErr()) {
      throw rKey.Err();
    }
    keys.push(rKey.Ok().key);
  }
  return keys;
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
    const keys = await env2jwk(stsparam.token, stsparam.alg, sthis);
    if (keys.length !== 1) {
      throw new Error(`Expected exactly one JWK, found ${keys.length}`);
    }
    return new SessionTokenService(keys[0], stsparam);
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

function coercesJWKplainOrkeysObject<
  V extends typeof JWKPublicSchema | typeof JWKPrivateSchema,
  R extends V extends typeof JWKPublicSchema ? JWKPublic : JWKPrivate,
>(keyOrkeys: { keys: unknown[] } | unknown, validator: V): Result<R>[] {
  const keys: unknown[] = [];
  const isKeys = z.object({ keys: z.array(z.any()) }).safeParse(keyOrkeys);
  if (isKeys.success) {
    keys.push(...isKeys.data.keys);
  } else {
    keys.push(keyOrkeys);
  }
  return keys.map((key) => {
    const parsed = validator.safeParse(key);
    if (parsed.success) {
      return Result.Ok(parsed.data as R);
    } else {
      return Result.Err(parsed.error);
    }
  });
}

/**
 * Generic coerce function that can handle public-only, private-only, or both.
 * @param sthis - SuperThis instance
 * @param validator - Zod schema to validate against (JWKPublicSchema, JWKPrivateSchema, or z.union of both)
 * @param inputs - One or more inputs to coerce (string, JWK, or arrays)
 * @returns Promise resolving to array of validated JWKs
 */
export async function coerceJWKWithSchema<
  V extends typeof JWKPublicSchema | typeof JWKPrivateSchema,
  R extends V extends typeof JWKPublicSchema ? JWKPublic : JWKPrivate,
>(sthis: SuperThis, validator: V, ...inputs: (CoerceJWKType | CoerceJWKType[])[]): Promise<Result<R>[]> {
  return Promise.all(
    inputs.flat().map(async (keys) => {
      if (typeof keys === "string") {
        const jwkKeys: Result<R>[] = [];
        for (const { content, begin, end } of mimeBlockParser(keys)) {
          if (begin && end) {
            const pem = `${begin}\n${content}\n${end}\n`;
            const rKey = await exception2Result(() => importSPKI(pem, "RS256"));
            if (rKey.isErr()) {
              jwkKeys.push(Result.Err(rKey.Err()));
              continue;
            }
            const key = rKey.Ok();
            const jwk = await exportJWK(key);
            const parsed = validator.safeParse({ ...jwk, alg: "RS256" });
            if (parsed.success) {
              jwkKeys.push(Result.Ok(parsed.data as R));
            } else {
              jwkKeys.push(Result.Err(parsed.error));
            }
            continue;
          }
          let encodingFailed: Option<Result<R>> = Option.Some(Result.Err("Failed to decode JWK string with any known encoding"));
          for (const decodeFn of [
            (a: string) => a,
            (a: string) => sthis.txt.base64.decode(a),
            (a: string) => sthis.txt.base58.decode(a),
          ]) {
            const res = exception2Result(() => decodeFn(content));
            if (res.isErr()) {
              continue;
            }
            const resStr = res.Ok();
            const keyOrkeys = exception2Result(() => JSON.parse(resStr)) as Result<unknown>;
            if (keyOrkeys.isErr()) {
              continue;
            }
            encodingFailed = Option.None();
            for (const rKey of coercesJWKplainOrkeysObject<V, R>(keyOrkeys.Ok(), validator)) {
              jwkKeys.push(rKey);
            }
          }
          if (encodingFailed.IsSome()) {
            jwkKeys.push(encodingFailed.Unwrap());
          }
        }
        return jwkKeys;
      } else {
        // Check if it's a JWKS object with a "keys" property
        return coercesJWKplainOrkeysObject<V, R>(keys, validator);
      }
    }),
  ).then((a) => a.flat());
}

/**
 * Coerces inputs to JWK format, accepting both public and private keys.
 * Does not strip private key components.
 */
export async function coerceJWK(sthis: SuperThis, ...i: (CoerceJWKType | CoerceJWKType[])[]): Promise<JWK[]> {
  // Accept any valid JWK (public or private)
  // IMPORTANT: Try JWKPrivateSchema first! If we try JWKPublicSchema first,
  // it will match private keys (which have all public fields) and strip the 'd' field.
  const priv = await coerceJWKWithSchema(sthis, JWKPrivateSchema, ...i);
  const pub = await coerceJWKWithSchema(sthis, JWKPublicSchema, ...i);
  if (priv.length !== pub.length) {
    throw new Error("Mismatched number of private and public keys");
  }
  const ret: Result<JWKPrivate | JWKPublic>[] = [];
  for (let idx = 0; idx < priv.length; idx++) {
    const rPriv = priv[idx];
    const rPub = pub[idx];
    if (rPriv.isOk()) {
      ret.push(rPriv);
    } else if (rPub.isOk()) {
      ret.push(rPub);
    } else {
      if (rPriv.Err()) {
        ret.push(Result.Err(rPriv.Err()));
      } else {
        ret.push(Result.Err(rPub.Err()));
      }
    }
  }
  return filterOk(ret);
}

/**
 * Coerces inputs to JWKPublic format, stripping private key components.
 */
export async function coerceJWKPublic(sthis: SuperThis, ...i: (CoerceJWKType | CoerceJWKType[])[]): Promise<JWKPublic[]> {
  return filterOk(await coerceJWKWithSchema(sthis, JWKPublicSchema, ...i));
}

/**
 * Coerces inputs to JWKPrivate format, validating that private key components are present.
 */
export async function coerceJWKPrivate(sthis: SuperThis, ...i: (CoerceJWKType | CoerceJWKType[])[]): Promise<JWKPrivate[]> {
  return filterOk(await coerceJWKWithSchema<typeof JWKPrivateSchema, JWKPrivate>(sthis, JWKPrivateSchema, ...i));
}

export async function verifyToken<R>(
  token: string,
  presetPubKey: (string | JWK | JWKPublic)[],
  wellKnownUrls: CoerceURI[],
  iopts: Partial<VerifyTokenOptions<R>> = {},
): Promise<Result<R>> {
  const fetchFn = iopts.fetch || globalThis.fetch;
  const opts: VerifyTokenOptions<R> = {
    fetchTimeoutMs: iopts.fetchTimeoutMs || 1000,
    parseSchema:
      iopts.parseSchema ||
      ((payload: unknown): Result<R> => {
        return Result.Ok(payload as R);
      }),
    // Always wrap fetch to preserve 'this' binding in Cloudflare Workers
    fetch: (url, init) => fetchFn.call(globalThis, url, init),
    verifyToken:
      iopts.verifyToken ||
      (async (token: string, pubKey: JWK): Promise<Result<{ payload: unknown }>> => {
        const rKey = await importJWK(pubKey);
        if (rKey.isErr()) {
          return Result.Err(rKey);
        }
        const tokenParts = token.split(".");
        const tokenHeader = JSON.parse(opts.sthis.txt.base64.decode(tokenParts[0]));
        console.log("[DEBUG] JWT verify attempt - token kid:", tokenHeader.kid, "key kid:", pubKey.kid);
        const rRes = await exception2Result(() => jwtVerify(token, rKey.Ok().key));
        if (rRes.isErr()) {
          console.log(
            "[DEBUG] JWT verify FAILED - token kid:",
            tokenHeader.kid,
            "key kid:",
            pubKey.kid,
            "error:",
            rRes.Err().message,
          );
          return Result.Err(rRes);
        }
        const res = rRes.Ok();
        if (!res) {
          return Result.Err("JWT verification failed");
        }
        console.log("[DEBUG] JWT verify SUCCESS - token kid:", tokenHeader.kid, "key kid:", pubKey.kid);
        return Result.Ok(res);
      }),
    sthis: iopts.sthis ?? ensureSuperThis(),
  };

  console.log("[DEBUG] verifyToken: trying", presetPubKey.length, "preset keys");
  for (const pubKey of presetPubKey) {
    const coercedKeys = await coerceJWKPublic(opts.sthis, pubKey);
    console.log("[DEBUG] Coerced", coercedKeys.length, "keys from preset");
    for (const key of coercedKeys) {
      const rVerify = await internVerifyToken(token, key, opts);
      console.log("[DEBUG] Preset key verification:", rVerify.isOk() ? "SUCCESS" : "FAILED", key.kid);
      if (rVerify.isOk()) {
        return rVerify;
      }
    }
  }
  const errors: FetchWellKnownJwksResult[] = [];
  for (const url of wellKnownUrls) {
    const rPubKeys = await fetchWellKnownJwks([url], opts);
    for (const pubKey of rPubKeys) {
      switch (true) {
        case isFetchWellKnownJwksResultErr(pubKey):
        case isFetchWellKnownJwksResultTimeout(pubKey):
          errors.push(pubKey);
          continue;
        case isFetchWellKnownJwksResultOk(pubKey):
          {
            for (const key of pubKey.keys) {
              const rVerify = await internVerifyToken(token, key, opts);
              if (rVerify.isOk()) {
                return rVerify;
              } else {
                errors.push({
                  type: "error",
                  error: rVerify.Err(),
                  url: pubKey.url,
                });
              }
            }
          }
          break;
        default:
          throw new Error("unreachable");
      }
    }
  }
  return Result.Err(
    `Verification failed. Tried ${presetPubKey.length} preset keys, ${wellKnownUrls.length} JWKS URLs. URL errors:\n${JSON.stringify(errors, null, 2)}`,
  );
}

async function internVerifyToken<R>(token: string, presetPubKey: JWK | JWKPublic, opts: VerifyTokenOptions<R>): Promise<Result<R>> {
  // console.log("internVerifyToken", token, presetPubKey);
  const rVerify = await opts.verifyToken(token, presetPubKey);
  if (rVerify.isErr()) {
    return Result.Err(rVerify);
  }
  return opts.parseSchema(rVerify.Ok().payload);
}

export interface FetchWellKnownJwksResultOk {
  readonly type: "ok";
  readonly keys: JWKPublic[];
  readonly url: string;
}

export function isFetchWellKnownJwksResultOk(r: FetchWellKnownJwksResult): r is FetchWellKnownJwksResultOk {
  return r.type === "ok";
}

export interface FetchWellKnownJwksResultErr {
  readonly type: "error";
  readonly error: Error;
  readonly url: string;
}

export function isFetchWellKnownJwksResultErr(r: FetchWellKnownJwksResult): r is FetchWellKnownJwksResultErr {
  return r.type === "error";
}

export interface FetchWellKnownJwksResultTimeout {
  readonly type: "timeout";
  readonly url: string;
}

export function isFetchWellKnownJwksResultTimeout(r: FetchWellKnownJwksResult): r is FetchWellKnownJwksResultTimeout {
  return r.type === "timeout";
}

export type FetchWellKnownJwksResult = FetchWellKnownJwksResultOk | FetchWellKnownJwksResultErr | FetchWellKnownJwksResultTimeout;

export async function fetchWellKnownJwks(
  urls: CoerceURI | CoerceURI[],
  iopts: {
    readonly fetch?: typeof globalThis.fetch;
    readonly fetchTimeoutMs?: number;
  },
): Promise<FetchWellKnownJwksResult[]> {
  const fetchFn = iopts.fetch || globalThis.fetch;
  const opts = {
    fetchTimeoutMs: iopts.fetchTimeoutMs || 1000,
    // Always wrap fetch to preserve 'this' binding in Cloudflare Workers
    fetch: (...args: Parameters<typeof globalThis.fetch>) => fetchFn.call(globalThis, ...args),
  };
  return Promise.all(
    (Array.isArray(urls) ? urls : [urls])
      .flat()
      .map((u) => {
        if (!u) {
          return undefined;
        }
        const buri = BuildURI.from(u);
        const url = buri.URI();
        if (url.pathname === "" || url.pathname === "/") {
          buri.pathname("/.well-known/jwks.json");
        }
        return buri.toString();
      })
      .filter((u): u is string => !!u)
      .map(async (url) => {
        const onceFn = keysFromWellKnownJwksCache.get(url);
        return onceFn.once(async () => {
          const timeout = await timeouted(
            opts
              .fetch(url, {
                method: "GET",
              })
              .then((res) => {
                if (!res.ok) {
                  throw new Error(`Failed to fetch well-known JWKS from ${url}: ${res.status} ${res.statusText}`);
                }
                return res.json();
              }),
            {
              timeout: opts.fetchTimeoutMs || 1000,
            },
          );
          // console.log(">>>>>>", JSON.stringify(timeout));
          switch (timeout.state) {
            case "timeout":
              onceFn.reset();
              return {
                type: "timeout" as const,
                url,
              };
            case "error":
              onceFn.reset();
              return {
                type: "error" as const,
                error: timeout.error,
                url,
              };
            case "success": {
              const parsed = z.object({ keys: JWKPublicSchema.array() }).safeParse(timeout.value);
              if (!parsed.success) {
                return {
                  type: "error" as const,
                  error: new Error(`Invalid JWKS format from ${url}: ${parsed.error.message}`),
                  url,
                };
              }
              return {
                type: "ok" as const,
                keys: parsed.data.keys,
                url,
              };
            }
            default:
              throw new Error("unreachable");
          }
        });
      }),
  );
}
