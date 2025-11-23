import { z } from "zod/v4";

// JWT Payload Schema (standard claims)
export const JWTPayloadSchema = z.object({
  azp: z.string().optional(), // authorized party
  iss: z.string().optional(), // issuer
  sub: z.string().optional(), // subject
  aud: z.union([z.string(), z.array(z.string())]).optional(), // audience
  exp: z.number().int().optional(), // expiration time
  nbf: z.number().int().optional(), // not before
  iat: z.number().int().optional(), // issued at
  jti: z.string().optional(), // JWT ID
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

export const OpenJWTPayloadSchema = z.intersection(
  JWTPayloadSchema,
  z.record(z.string(), z.any()), // Custom claims
);

export type OpenJWTPayload = z.infer<typeof OpenJWTPayloadSchema>;
