import { FPDeviceIDPayload, JWKPublic, JWKPublicSchema, FPDeviceIDPayloadSchema } from "@fireproof/core-types-base";
import { jwtVerify, decodeProtectedHeader } from "jose";

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
      const { payload: fromPayload } = await jwtVerify(csrJWS, publicKey, {
        typ: "CSR+JWT",
      });

      const { success, data: payload } = FPDeviceIDPayloadSchema.safeParse(fromPayload);
      if (!success || !payload) {
        return {
          valid: false,
          error: "Invalid CSR payload",
        };
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
