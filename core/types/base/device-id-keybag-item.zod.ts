import { z } from "zod";
import { JWKPrivateSchema } from "./jwk-private.zod.js";
import { CertificatePayloadSchema } from "./fp-ca-cert-payload.zod.js";

export const CertJWTPayloadSchema = z
  .object({
    certificateJWT: z.string(),
    certificatePayload: CertificatePayloadSchema,
  })
  .readonly();

export type CertJWTPayload = z.infer<typeof CertJWTPayloadSchema>;

export const DeviceIdKeyBagItemSchema = z
  .object({
    deviceId: JWKPrivateSchema,
    cert: CertJWTPayloadSchema.optional(),
  })
  .readonly();

export type DeviceIdKeyBagItem = z.infer<typeof DeviceIdKeyBagItemSchema>;
