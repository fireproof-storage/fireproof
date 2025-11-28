import { FPDeviceIDCSRPayload, JWKPublic, JWKPublicSchema, FPDeviceIDCSRPayloadSchema } from "@fireproof/core-types-base";
import { jwtVerify, decodeProtectedHeader, calculateJwkThumbprint } from "jose";
import { sts } from "@fireproof/core-runtime";

interface ValidateCSRError {
  readonly valid: false;
  readonly error: string;
}

interface ValidateCSRSuccess {
  readonly valid: true;
  readonly payload: FPDeviceIDCSRPayload;
  readonly publicKey: JWKPublic;
}

type ValidateCSRResult = ValidateCSRError | ValidateCSRSuccess;

export class DeviceIdValidator {
  async validateCSR(csrJWS: string): Promise<ValidateCSRResult> {
    try {
      // Parse the JWS header to get the public key
      const header = decodeProtectedHeader(csrJWS);
      if (!header.jwk) {
        throw new Error("No public key in CSR header");
      }

      const { success: successPub, data: publicKey } = JWKPublicSchema.safeParse(header.jwk);
      if (!successPub || !publicKey) {
        return {
          valid: false,
          error: "Invalid public key in CSR header",
        };
      }

      // Verify the JWS
      const rKeyLike = await sts.importJWK(publicKey, header.alg);
      if (rKeyLike.isErr()) {
        return {
          valid: false,
          error: `Failed to import public key: ${rKeyLike.Err()}`,
        };
      }
      const { key: keyLike, alg } = rKeyLike.Ok();
      const { payload: fromPayload } = await jwtVerify(csrJWS, keyLike, {
        typ: "CSR+JWT",
        algorithms: [alg],
      });

      const { success, data: payload } = FPDeviceIDCSRPayloadSchema.safeParse(fromPayload);
      if (!success || !payload) {
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
