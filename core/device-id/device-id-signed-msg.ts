import { BaseXXEndeCoder, CertificatePayload, JWTPayload } from "@fireproof/core-types-base";
import { calculateJwkThumbprint, SignJWT } from "jose";
import { Certor } from "./certor.js";
import { DeviceIdKey } from "./device-id-key.js";

export class DeviceIdSignMsg {
  readonly #key: DeviceIdKey;
  readonly #cert: CertificatePayload; // Cert Signed by DeviceIdCA
  readonly base64: BaseXXEndeCoder;

  constructor(base64: BaseXXEndeCoder, key: DeviceIdKey, cert: CertificatePayload) {
    this.#key = key;
    this.#cert = cert;
    this.base64 = base64;
  }

  async sign<T extends JWTPayload>(payload: T, algorithm = "ES256") {
    const certor = new Certor(this.base64, this.#cert);
    const x5c = [certor.asBase64()];
    const x5t = await certor.asSHA1();
    const x5tS256 = await certor.asSHA256();
    return await new SignJWT(payload)
      .setProtectedHeader({
        alg: algorithm,
        typ: "JWT",
        kid: await calculateJwkThumbprint(await this.#key.publicKey(), "sha256"),
        x5c: x5c, // JSON payload
        x5t: x5t, // SHA-1(base58btc(JSON))
        "x5t#S256": x5tS256, // SHA-256(base58btc(JSON))
        // kid: await this.#key.fingerPrint(),
        // x5c: x5c, // Certificate chain
        // x5t: x5t, // SHA-1 thumbprint
        // "x5t#S256": x5tS256, // SHA-256 thumbprint
      })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(await this.#key.exportPrivateJWK());
  }
}
