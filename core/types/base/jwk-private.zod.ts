import { z } from "zod";

// JWK Schema

export const JWKPrivateSchema = z
  .object({
    kty: z.enum(["RSA", "EC", "oct", "OKP"]),
    use: z.enum(["sig", "enc"]).optional(),
    key_ops: z
      .array(z.enum(["sign", "verify", "encrypt", "decrypt", "wrapKey", "unwrapKey", "deriveKey", "deriveBits"]))
      .optional(),
    alg: z.string().optional(),
    kid: z.string().optional(),
    x5u: z.string().pipe(z.url()).optional(),
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
        d: z.string(), // private exponent
        p: z.string(), // first prime factor
        q: z.string(), // second prime factor
        dp: z.string(), // first factor CRT exponent
        dq: z.string(), // second factor CRT exponent
        qi: z.string(), // first CRT coefficient
      }),
      // Elliptic Curve Key
      z.object({
        kty: z.literal("EC"),
        crv: z.enum(["P-256", "P-384", "P-521", "secp256k1"]),
        x: z.string(), // x coordinate
        y: z.string(), // y coordinate
        d: z.string(), // private key
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
        d: z.string(), // private key
      }),
    ]),
  );

export type JWKPrivate = z.infer<typeof JWKPrivateSchema>;
