import { z } from "zod";
import { JWKPublicSchema } from "./jwk-public.zod.js";

// Subject Schema
export const SubjectSchema = z.object({
  commonName: z.string(), //.optional(),
  countryName: z.string().length(2).optional(), // ISO 3166-1 alpha-2
  stateOrProvinceName: z.string().optional(),
  locality: z.string().optional(),
  organization: z.string().optional(),
  organizationalUnitName: z.string().optional(),
  emailAddress: z.string().email().optional(),
  serialNumber: z.string().optional(),
  streetAddress: z.string().optional(),
  postalCode: z.string().optional(),
  businessCategory: z.string().optional(),
  jurisdictionCountryName: z.string().length(2).optional(),
  jurisdictionStateOrProvinceName: z.string().optional(),
  jurisdictionLocalityName: z.string().optional(),
});

export type Subject = z.infer<typeof SubjectSchema>;

// Extensions Schema
export const ExtensionsSchema = z.object({
  subjectAltName: z.array(z.string()).optional(),
  keyUsage: z
    .array(
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
    )
    .optional(),
  extendedKeyUsage: z
    .array(
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
    )
    .optional(),
  basicConstraints: z
    .object({
      cA: z.boolean().optional(),
      pathLenConstraint: z.number().int().min(0).optional(),
    })
    .optional(),
  authorityKeyIdentifier: z.string().optional(),
  subjectKeyIdentifier: z.string().optional(),
  certificatePolicies: z
    .array(
      z.object({
        policyIdentifier: z.string(),
        policyQualifiers: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  crlDistributionPoints: z.array(z.string().url()).optional(),
  authorityInfoAccess: z
    .object({
      ocsp: z.array(z.string().url()).optional(),
      caIssuers: z.array(z.string().url()).optional(),
    })
    .optional(),
  nameConstraints: z
    .object({
      permitted: z.array(z.string()).optional(),
      excluded: z.array(z.string()).optional(),
    })
    .optional(),
});

export type Extensions = z.infer<typeof ExtensionsSchema>;

// JWT Payload Schema (standard claims)
const JWTPayloadSchema = z.object({
  iss: z.string().optional(), // issuer
  sub: z.string().optional(), // subject
  aud: z.union([z.string(), z.array(z.string())]).optional(), // audience
  exp: z.number().int().optional(), // expiration time
  nbf: z.number().int().optional(), // not before
  iat: z.number().int().optional(), // issued at
  jti: z.string().optional(), // JWT ID
});

// Main FPDeviceIDPayload Schema
export const FPDeviceIDPayloadSchema = JWTPayloadSchema.extend({
  csr: z
    .object({
      subject: SubjectSchema,
      publicKey: JWKPublicSchema,
      extensions: ExtensionsSchema,
    })
    .readonly(),
}).readonly();

// Type inference
export type FPDeviceIDPayload = z.infer<typeof FPDeviceIDPayloadSchema>;
