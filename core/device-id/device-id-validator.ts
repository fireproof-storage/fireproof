import { FPDeviceIDPayload, JWKPublic, JWKPublicSchema, FPDeviceIDPayloadSchema } from "@fireproof/core-types-base";
import { jwtVerify, decodeProtectedHeader, importJWK, calculateJwkThumbprint } from "jose";

interface ValidateCSRError {
  readonly valid: false;
  readonly error: string;
}

interface ValidateCSRSuccess {
  readonly valid: true;
  readonly payload: FPDeviceIDPayload;
  readonly publicKey: JWKPublic;
}

type ValidateCSRResult = ValidateCSRError | ValidateCSRSuccess;

function deriveAlgFromJwk(jwk: JWKPublic): string {
  if (jwk.kty === "EC") {
    switch (jwk.crv) {
      case "P-256":
        return "ES256";
      case "P-384":
        return "ES384";
      case "P-521":
        return "ES512";
      // case "secp256k1":
      //   return "ES256K";
    }
  }
  if (jwk.kty === "OKP") return "EdDSA";
  // Default case for RSA or any remaining kty
  return "RS256"; // tighten if you only support PS* or specific algs
}

export class DeviceIdValidator {
  async validateCSR(csrJWS: string): Promise<ValidateCSRResult> {
    try {
      // Parse the JWS header to get the public key
      const header = decodeProtectedHeader(csrJWS);
      if (!header.jwk) {
        throw new Error("No public key in CSR header");
      }

      const { success: successPub, data: publicKey } = JWKPublicSchema.safeParse(header.jwk);
      if (!successPub) {
        return {
          valid: false,
          error: "Invalid public key in CSR header",
        };
      }

      // Verify the JWS
      const alg = typeof header.alg === "string" ? header.alg : deriveAlgFromJwk(publicKey);
      const keyLike = await importJWK(publicKey, alg);
      const { payload: fromPayload } = await jwtVerify(csrJWS, keyLike, {
        typ: "CSR+JWT",
        algorithms: [alg],
      });

      const { success, data: payload } = FPDeviceIDPayloadSchema.safeParse(fromPayload);
      if (!success) {
        return {
          valid: false,
          error: "Invalid CSR payload",
        };
      }

      const [hdrThumb, payloadThumb] = await Promise.all([
        calculateJwkThumbprint(publicKey),
        calculateJwkThumbprint(payload.csr.publicKey),
      ]);
      if (hdrThumb !== payloadThumb) {
        return { valid: false, error: "CSR public key mismatch between header and payload" };
      }

      return {
        valid: true,
        payload: payload,
        publicKey,
      };
    } catch (error) {
      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }
}
