// import { JWTPayload, JWTPayloadSchema } from "@fireproof/core-types-base";
// import { JWTPayloadSchema } from "@fireproof/core-types-base";
import { z } from "zod/v4";

export * from "./msg-types.js";
export * from "./msg-is.js";
export * from "./msg-api.js";
export * from "./fp-api-interface.js";
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
  payload: z.object({
    // ...JWTPayloadSchema.shape,

    azp: z.string().optional(), // authorized party
    exp: z.number().int().optional(), // expiration time
    iat: z.number().int().optional(), // issued at
    iss: z.string().optional(), // issuer
    jti: z.string().optional(), // JWT ID
    nbf: z.number().int().optional(), // not before

    params: z
      .object({
        email: z.string(),
        email_verified: z.boolean(),
        first: z.string(),
        image_url: z.string(),
        last: z.string(),
        name: z.string().nullable(),
        public_meta: z.unknown(),
      })
      .partial(),

    role: z.string(),
    sub: z.string(),
    userId: z.string(),

    aud: z.union([z.string(), z.array(z.string())]).optional(), // audience
    app_metadata: z.unknown().optional(),
  }),
  protectedHeader: z
    .object({
      alg: z.string(),
      cat: z.string(),
      kid: z.string(),
      typ: z.string(),
    })
    .partial(),
});

export type FPClerkClaim = z.infer<typeof FPClerkClaimSchema>;
