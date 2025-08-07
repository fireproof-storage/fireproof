import z from "zod";

// JWT Payload Schema (standard claims)
export const JWTPayloadSchema = z.object({
  iss: z.string().optional(), // issuer
  sub: z.string().optional(), // subject
  aud: z.union([z.string(), z.array(z.string())]).optional(), // audience
  exp: z.number().int().optional(), // expiration time
  nbf: z.number().int().optional(), // not before
  iat: z.number().int().optional(), // issued at
  jti: z.string().optional(), // JWT ID
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
