import { JWTPayloadSchema } from "@fireproof/core-types-base";
import { z } from "zod";

export * from "./msg-types.js";
export * from "./msg-is.js";
export * from "./msg-api.js";
export * from "./dashboard-api.js";

export const FPClerkClaimSchema = JWTPayloadSchema.extend({
  app_metadata: z.unknown(),
  role: z.string(),
  userId: z.string(),
  sub: z.string(),
  params: z
    .object({
      last: z.string(),
      name: z.string(),
      email: z.string(),
      first: z.string(),
      image_url: z.string(),
      external_id: z.string().nullable().optional(),
      public_meta: z.any().optional(),
      email_verified: z.boolean().optional(),
    })
    .partial(),
}).readonly();

export type FPClerkClaim = z.infer<typeof FPClerkClaimSchema>;
