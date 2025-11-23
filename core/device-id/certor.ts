import { toSortedObject } from "@adviser/cement/utils";
import { BaseXXEndeCoder } from "@fireproof/core-types-base";
import { decodeJwt } from "jose";
import { base58btc } from "multiformats/bases/base58";
import { sha1 } from "multiformats/hashes/sha1";
import { sha256 } from "multiformats/hashes/sha2";
import { deepFreeze } from "@fireproof/core-runtime";
import { CertificatePayload, CertificatePayloadSchema } from "@fireproof/core-types-base/fp-ca-cert-payload.zod.js";

export class Certor {
  readonly #cert: CertificatePayload;
  readonly base64: BaseXXEndeCoder;
  #strCert?: string;
  #uint8Cert?: Uint8Array;

  static fromString(base64: BaseXXEndeCoder, cert: string) {
    const certObj = CertificatePayloadSchema.parse(JSON.parse(base64.decode(cert)));
    return new Certor(base64, certObj);
  }

  static fromUnverifiedJWT(base64: BaseXXEndeCoder, jwtString: string) {
    // const header = decodeProtectedHeader(jwtString);
    const payload = decodeJwt(jwtString);
    const certObj = CertificatePayloadSchema.parse(payload);
    return new Certor(base64, certObj);
  }

  constructor(base64: BaseXXEndeCoder, cert: CertificatePayload) {
    // this.#cert = cert;
    this.#cert = deepFreeze(toSortedObject(cert)) as CertificatePayload;
    this.base64 = base64;
  }

  asCert(): CertificatePayload {
    return this.#cert;
  }

  parseCertificateSubject(s: string): Record<string, string> {
    const parts: Record<string, string> = {};
    s.split(",").forEach((part) => {
      const [key, value] = part.trim().split("=");
      if (key && value) {
        parts[key] = value;
      }
    });
    return parts;
  }

  async asSHA1() {
    this.#uint8Cert ||= this.base64.decodeUint8(this.asBase64());
    const val = await sha1.digest(this.#uint8Cert);
    return base58btc.encode(val.bytes);
  }

  async asSHA256() {
    this.#uint8Cert ||= this.base64.decodeUint8(this.asBase64());
    const val = await sha256.digest(this.#uint8Cert);
    return base58btc.encode(val.bytes);
  }

  asBase64() {
    this.#strCert ||= this.base64.encode(JSON.stringify(toSortedObject(this.#cert)));
    return this.#strCert;
  }
}
