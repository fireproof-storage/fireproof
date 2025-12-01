// import { JWTPayload, JWTPayloadSchema } from "@fireproof/core-types-base";
// import { JWTPayloadSchema } from "@fireproof/core-types-base";
import { z } from "zod/v4";

export * from "./msg-types.js";
export * from "./msg-is.js";
export * from "./msg-api.js";
export * from "./dashboard-api.js";

// export interface FPClerkClaim extends JWTPayload {
//   readonly app_metadata: unknown;
//   readonly role: string;
//   readonly userId: string;
//   readonly sub: string;
//   readonly params: Partial<{
//     readonly last: string;
//     readonly name: string;
//     readonly email: string;
//     readonly first: string;
//     readonly image_url: string;
//     readonly external_id: string | null;
//     readonly public_meta: unknown;
//     readonly email_verified?: boolean;
//   }>;
// }

export const FPClerkClaimSchema = z.object({
  // ...JWTPayloadSchema.shape,

  azp: z.string().optional(), // authorized party
  iss: z.string().optional(), // issuer
  // sub: z.string().optional(), // subject
  aud: z.union([z.string(), z.array(z.string())]).optional(), // audience
  exp: z.number().int().optional(), // expiration time
  nbf: z.number().int().optional(), // not before
  iat: z.number().int().optional(), // issued at
  jti: z.string().optional(), // JWT ID

  app_metadata: z.unknown(),
  role: z.string(),
  userId: z.string(),
  sub: z.string(),
  params: z
    .object({
      last: z.string(),
      name: z.string().nullable().optional(),
      email: z.string(),
      first: z.string(),
      image_url: z.string(),
      external_id: z.string().nullable().optional(),
      public_meta: z.unknown(),
      email_verified: z.boolean().optional(),
    })
    .partial(),
});

export type FPClerkClaim = z.infer<typeof FPClerkClaimSchema>;
