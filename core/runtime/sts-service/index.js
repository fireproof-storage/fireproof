var __classPrivateFieldSet =
  (this && this.__classPrivateFieldSet) ||
  function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
      throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? (f.value = value) : state.set(receiver, value), value);
  };
var __classPrivateFieldGet =
  (this && this.__classPrivateFieldGet) ||
  function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
      throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  };
var _SessionTokenService_key, _SessionTokenService_param;
import { exception2Result } from "@adviser/cement";
import { exportJWK, importJWK, jwtVerify, SignJWT } from "jose";
import { generateKeyPair } from "jose/key/generate/keypair";
import { base58btc } from "multiformats/bases/base58";
import { ensureSuperThis } from "../utils.js";
export const envKeyDefaults = {
  SECRET: "CLOUD_SESSION_TOKEN_SECRET",
  PUBLIC: "CLOUD_SESSION_TOKEN_PUBLIC",
};
export async function jwk2env(jwk, sthis = ensureSuperThis()) {
  const inPubKey = await exportJWK(jwk);
  return base58btc.encode(sthis.txt.encode(JSON.stringify(inPubKey)));
}
export async function env2jwk(env, alg, sthis = ensureSuperThis()) {
  const inJWT = JSON.parse(sthis.txt.decode(base58btc.decode(env)));
  return importJWK(inJWT, alg, { extractable: true });
}
export class SessionTokenService {
  static async generateKeyPair(
    alg = "ES256",
    options = { extractable: true },
    generateKeyPairFN = (alg, options) => generateKeyPair(alg, options),
  ) {
    const material = await generateKeyPairFN(alg, options);
    return {
      material,
      strings: {
        publicKey: await jwk2env(material.publicKey),
        privateKey: await jwk2env(material.privateKey),
      },
    };
  }
  static async createFromEnv(sthis, sp = {}) {
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
  static async create(stsparam, sthis = ensureSuperThis()) {
    const key = await env2jwk(stsparam.token, stsparam.alg ?? "ES256", sthis);
    return new SessionTokenService(key, stsparam);
  }
  constructor(key, stsparam) {
    _SessionTokenService_key.set(this, void 0);
    _SessionTokenService_param.set(this, void 0);
    __classPrivateFieldSet(this, _SessionTokenService_key, key, "f");
    __classPrivateFieldSet(this, _SessionTokenService_param, stsparam, "f");
  }
  get validFor() {
    let validFor = __classPrivateFieldGet(this, _SessionTokenService_param, "f").validFor ?? 3600;
    if (!(0 <= validFor && validFor <= 3600000)) {
      validFor = 3600000;
    }
    return validFor;
  }
  get alg() {
    return __classPrivateFieldGet(this, _SessionTokenService_param, "f").alg ?? "ES256";
  }
  get isssuer() {
    return __classPrivateFieldGet(this, _SessionTokenService_param, "f").issuer ?? "fireproof";
  }
  get audience() {
    return __classPrivateFieldGet(this, _SessionTokenService_param, "f").audience ?? "fireproof";
  }
  async validate(token) {
    return exception2Result(async () => {
      const ret = await jwtVerify(token, __classPrivateFieldGet(this, _SessionTokenService_key, "f"));
      return ret;
    });
  }
  async tokenFor(p) {
    if (__classPrivateFieldGet(this, _SessionTokenService_key, "f").type !== "private") {
      throw new Error("key must be private");
    }
    const token = await new SignJWT({
      userId: p.userId,
      tenants: p.tenants,
      ledgers: p.ledgers,
      email: "test@test",
      created: new Date(),
      selected: {
        tenant: p.tenants[0].id,
        ledger: p.ledgers[0].id,
      },
    })
      .setProtectedHeader({ alg: this.alg })
      .setIssuedAt()
      .setIssuer(p.issuer ?? this.isssuer)
      .setAudience(p.audience ?? this.audience)
      .setExpirationTime(Date.now() + (p.validFor ?? this.validFor))
      .sign(__classPrivateFieldGet(this, _SessionTokenService_key, "f"));
    return token;
  }
}
((_SessionTokenService_key = new WeakMap()), (_SessionTokenService_param = new WeakMap()));
//# sourceMappingURL=index.js.map
