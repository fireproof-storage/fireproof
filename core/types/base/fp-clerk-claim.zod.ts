import { z } from "zod/v4";

// export interface ClerkEmailTemplateClaim {
//   readonly email: string;
//   readonly first: string;
//   readonly last: string;
//   // github handle
//   readonly nick?: string;
//   readonly name?: string;
//   readonly image_url?: string;
// }

export const ClerkEmailTemplateClaimSchema = z.object({
  nick: z.string().optional(),
  email: z.string(),
  email_verified: z.boolean(),
  external_id: z.string().nullable().optional(),
  first: z.string(),
  image_url: z.string(),
  last: z.string(),
  name: z.string().nullable(),
  public_meta: z.unknown(),
});

export type ClerkEmailTemplateClaim = z.infer<typeof ClerkEmailTemplateClaimSchema>;

export const ClerkClaimSchema = z.object({
  // ...JWTPayloadSchema.shape,

  azp: z.string().optional(), // authorized party
  exp: z.number().int().optional(), // expiration time
  iat: z.number().int().optional(), // issued at
  iss: z.string().optional(), // issuer
  jti: z.string().optional(), // JWT ID
  nbf: z.number().int().optional(), // not before

  params: ClerkEmailTemplateClaimSchema,

  role: z.string(),
  sub: z.string(),
  userId: z.string(),

  aud: z.union([z.string(), z.array(z.string())]).optional(), // audience
  app_metadata: z.unknown().optional(),
});

export type ClerkClaim = z.infer<typeof ClerkClaimSchema>;

export const FPClerkClaimSchema = z.object({
  payload: ClerkClaimSchema,
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
