import z from "zod";
import { JWKPrivateSchema } from "./jwk-private.zod.js";
import { CertificatePayloadSchema } from "./fp-ca-cert-payload.zod.js";

export const DeviceIdKeyBagItemSchema = z
  .object({
    deviceId: JWKPrivateSchema,
    cert: z
      .object({
        certificateJWT: z.string(),
        certificatePayload: CertificatePayloadSchema,
      })
      .optional(),
  })
  .readonly();

export type DeviceIdKeyBagItem = z.infer<typeof DeviceIdKeyBagItemSchema>;
