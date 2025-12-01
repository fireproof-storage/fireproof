import { Result } from "@adviser/cement";
import { z } from "zod/v4";

// JWK Schema

export function ktyFromAlg(alg: string | undefined): "RSA" | "EC" | "OKP" {
  if (!alg) return "EC";
  if (alg.startsWith("RS") || alg.startsWith("PS")) return "RSA";
  //if (alg.startsWith("ES")) return "EC";
  return "EC";
}

/**
 * Infers the algorithm from a JWK based on key type and curve.
 * If the JWK already has an 'alg' field set, it returns that.
 * Otherwise, it infers the algorithm from 'kty' (key type) and 'crv' (curve for EC/OKP keys).
 *
 * This is the new comprehensive version that returns Result for proper error handling.
 * Use this for algorithm inference in all new code.
 */
export function toJwksAlg(jwk: { kty?: string; crv?: string; alg?: string }): Result<string> {
  // If alg is already set, use it
  if (jwk.alg) {
    return Result.Ok(jwk.alg);
  }

  // Infer from key type
  switch (jwk.kty) {
    case "EC": {
      // Elliptic Curve keys - infer from curve
      switch (jwk.crv) {
        case "P-256":
          return Result.Ok("ES256");
        case "P-384":
          return Result.Ok("ES384");
        case "P-521":
          return Result.Ok("ES512");
        case "secp256k1":
          return Result.Ok("ES256K");
        default:
          return Result.Err(`Unsupported EC curve: ${jwk.crv}`);
      }
    }
    case "RSA": {
      // RSA keys - default to RS256 (most common)
      return Result.Ok("RS256");
    }
    case "OKP": {
      // Octet Key Pair (EdDSA)
      switch (jwk.crv) {
        case "Ed25519":
          return Result.Ok("EdDSA");
        case "Ed448":
          return Result.Ok("EdDSA");
        default:
          return Result.Err(`Unsupported OKP curve: ${jwk.crv}`);
      }
    }
    case "oct": {
      // Symmetric keys - default to HS256
      return Result.Ok("HS256");
    }
    default:
      return Result.Err(`Unsupported key type: ${jwk.kty}`);
  }
}

export const JWKPublicSchema = z
  .object({
    kty: z.enum(["RSA", "EC", "oct", "OKP"]),
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
        crv: z.enum(["P-256", "P-384", "P-521", "secp256k1"]),
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

export const KeyesJWKPublicSchema = z.object({
  keys: z.array(JWKPublicSchema),
});

export type KeyesJWKPublic = z.infer<typeof KeyesJWKPublicSchema>;
