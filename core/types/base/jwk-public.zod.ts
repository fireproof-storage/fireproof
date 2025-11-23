import { CTJsonWebKey } from "@adviser/cement";
import { z } from "zod/v4";

// JWK Schema

export function ktyFromAlg(alg: string | undefined): "RSA" | "EC" | "OKP" {
  if (!alg) return "EC";
  if (alg.startsWith("RS") || alg.startsWith("PS")) return "RSA";
  //if (alg.startsWith("ES")) return "EC";
  return "EC";
}

export function toJwksAlg(alg: string | undefined, jwk: CTJsonWebKey): string | undefined {
  if (jwk.kty === "RSA") return "RS256";
  if (jwk.kty === "EC") {
    if (jwk.crv === "P-256") return "ES256";
    if (jwk.crv === "P-384") return "ES384";
    if (jwk.crv === "P-521") return "ES512";
    return undefined;
  }
}

export const JWKPublicSchema = z
  .object({
    kty: z.enum(["RSA", "EC", "OKP"]),
    use: z.enum(["sig", "enc"]).optional(),
    key_ops: z
      .array(z.enum(["sign", "verify", "encrypt", "decrypt", "wrapKey", "unwrapKey", "deriveKey", "deriveBits"]))
      .optional(),
    alg: z.string().optional(),
    kid: z.string().optional(),
    x5u: z.string().url().optional(),
    x5c: z.array(z.string()).optional(),
    x5t: z.string().optional(),
    "x5t#S256": z.string().optional(),
  })
  .and(
    z.discriminatedUnion("kty", [
      // RSA Key
      z.object({
        kty: z.literal("RSA"),
        n: z.string(), // modulus
        e: z.string(), // exponent
        // d: z.string().optional(), // private exponent
        // p: z.string().optional(), // first prime factor
        // q: z.string().optional(), // second prime factor
        // dp: z.string().optional(), // first factor CRT exponent
        // dq: z.string().optional(), // second factor CRT exponent
        // qi: z.string().optional(), // first CRT coefficient
      }),
      // Elliptic Curve Key
      z.object({
        kty: z.literal("EC"),
        crv: z.enum(["P-256", "P-384", "P-521"]),
        x: z.string(), // x coordinate
        y: z.string(), // y coordinate
        // d: z.string().optional(), // private key
      }),
      // Octet sequence (symmetric key)
      z.object({
        kty: z.literal("oct"),
        k: z.string(), // key value
      }),
      // Octet string key pairs (Ed25519, Ed448, X25519, X448)
      z.object({
        kty: z.literal("OKP"),
        crv: z.enum(["Ed25519", "Ed448", "X25519", "X448"]),
        x: z.string(), // public key
        // d: z.string().optional(), // private key
      }),
    ]),
  );

export type JWKPublic = z.infer<typeof JWKPublicSchema>;
