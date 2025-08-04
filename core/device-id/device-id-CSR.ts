import { SignJWT } from "jose";
import { DeviceIdKey } from "./device-id-key.js";
import { Subject, Extensions, FPDeviceIDPayload, FPDeviceIDPayloadSchema, SuperThis } from "@fireproof/core-types-base";
import { exception2Result, Result } from "@adviser/cement";

export class DeviceIdCSR {
  readonly #key: DeviceIdKey;
  readonly #sthis: SuperThis;
  constructor(sthis: SuperThis, key: DeviceIdKey) {
    this.#key = key;
    this.#sthis = sthis;
  }
  // Create CSR payload
  async createCSRPayload(subject: Subject, extensions: Extensions = {}): Promise<FPDeviceIDPayload> {
    const now = Math.floor(Date.now() / 1000);
    return FPDeviceIDPayloadSchema.parse({
      sub: subject.commonName,
      iss: "csr-client",
      aud: "certificate-authority",
      iat: now,
      exp: now + 3600, // 1 hour validity
      jti: this.#sthis.nextId(16).str,
      csr: {
        subject: subject,
        publicKey: await this.#key.publicKey(),
        extensions: {
          subjectAltName: extensions.subjectAltName || [],
          keyUsage: extensions.keyUsage || ["digitalSignature", "keyEncipherment"],
          extendedKeyUsage: extensions.extendedKeyUsage || ["serverAuth"],
        },
      },
    });
  }

  // Sign the CSR
  async signCSR(payload: FPDeviceIDPayload): Promise<Result<string>> {
    return exception2Result(async () => {
      const publicJWK = await this.#key.publicKey();
      // Create JWS
      const jws = await new SignJWT(payload)
        .setProtectedHeader({
          alg: "ES256",
          typ: "CSR+JWT",
          jwk: publicJWK, // Include public key in header
        })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(await this.#key.exportPrivateJWK());
      return jws;
    });
  }

  // Complete CSR creation process
  async createCSR(subject: Subject, extensions: Partial<Extensions> = {}) {
    const payload = await this.createCSRPayload(subject, extensions);
    return this.signCSR(payload);
  }
}
