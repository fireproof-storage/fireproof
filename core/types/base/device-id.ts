import { CertificatePayload } from "./fp-ca-cert-payload.zod.js";
import { JWKPublic } from "./jwk-public.zod.js";

export interface IssueCertificateResult {
  readonly certificateJWT: string; // JWT String
  readonly certificatePayload: CertificatePayload;
  readonly format: "JWS";
  readonly serialNumber: string;
  readonly issuer: string;
  readonly subject: string;
  readonly validityPeriod: {
    readonly notBefore: Date;
    readonly notAfter: Date;
  };
  readonly publicKey: JWKPublic;
}
