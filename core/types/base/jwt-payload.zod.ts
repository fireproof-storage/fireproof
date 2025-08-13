import { z } from "zod";

// JWT Payload Schema (standard claims)
export const JWTPayloadSchema = z.object({
  iss: z.string().optional().readonly(), // issuer
  sub: z.string().optional().readonly(), // subject
  aud: z.union([z.string(), z.array(z.string())]).optional(), // audience
  exp: z.number().int().optional().readonly(), // expiration time
  nbf: z.number().int().optional().readonly(), // not before
  iat: z.number().int().optional().readonly(), // issued at
  jti: z.string().optional().readonly(), // JWT ID
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
