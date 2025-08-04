import { z } from "zod";

import { ExtensionsSchema, SubjectSchema } from "./fp-device-id-payload.zod.js";
import { JWKPublicSchema } from "./jwk-public.zod.js";
// Certificate Payload Schema
const CertificateSchema = z.object({
  version: z.literal("3"), // X.509 v3
  serialNumber: z.string(),
  subject: SubjectSchema,
  issuer: SubjectSchema,
  validity: z.object({
    notBefore: z.string().datetime(),
    notAfter: z.string().datetime(),
  }),
  subjectPublicKeyInfo: JWKPublicSchema,
  signatureAlgorithm: z.literal("ES256"),
  keyUsage: z.array(
    z.enum([
      "digitalSignature",
      "nonRepudiation",
      "keyEncipherment",
      "dataEncipherment",
      "keyAgreement",
      "keyCertSign",
      "cRLSign",
      "encipherOnly",
      "decipherOnly",
    ]),
  ),
  extendedKeyUsage: z.array(
    z.enum([
      "serverAuth",
      "clientAuth",
      "codeSigning",
      "emailProtection",
      "timeStamping",
      "OCSPSigning",
      "ipsecIKE",
      "msCodeInd",
      "msCodeCom",
      "msCTLSign",
      "msEFS",
    ]),
  ),
  extensions: ExtensionsSchema.optional(),
});

export const CertificatePayloadSchema = z
  .object({
    // Standard JWT claims
    iss: z.string(), // Issuer (CA)
    sub: z.string(), // Subject
    aud: z.string().or(z.array(z.string())),
    iat: z.number().int(),
    nbf: z.number().int(), // Not before
    exp: z.number().int(), // Expiration
    jti: z.string(), // JWT ID as serial number

    // Certificate-specific claims
    certificate: CertificateSchema,
  })
  .readonly();

export type Certificate = z.infer<typeof CertificateSchema>;
export type CertificatePayload = z.infer<typeof CertificatePayloadSchema>;
