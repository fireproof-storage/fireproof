import { BaseXXEndeCoder, CertificatePayload, JWKPublic } from "@fireproof/core-types-base";
import { jwtVerify, decodeProtectedHeader } from "jose";
import { Certor } from "./certor.js";
import { exception2Result, Result } from "@adviser/cement";
import z from "zod/v4";
import { sts } from "@fireproof/core-runtime";

interface HeaderCertInfo {
  readonly certificate: Certor;
  readonly certificateChain: Certor[];
  readonly thumbprint?: string;
  readonly thumbprintSha256?: string;
  readonly keyId?: string;
  readonly algorithm?: string;
  readonly certificateUrl?: string;
  readonly rawHeader: unknown;
}

interface VerifyWithCertificateSuccess<T = unknown> {
  readonly valid: true;
  readonly payload: T;
  readonly header: unknown;
  readonly certificate: HeaderCertInfo & {
    readonly validation: {
      readonly valid: true;
      readonly subject: Record<string, string>;
      readonly issuer: Record<string, string>;
      readonly serialNumber: string;
      readonly notBefore: Date;
      readonly notAfter: Date;
      readonly publicKey: JWKPublic;
      readonly trustedCA?: CertificatePayload;
      readonly validityPeriod: {
        readonly days: number;
      };
    };
    readonly publicKey: JWKPublic;
  };
  readonly verificationTimestamp: string;
}

interface VerifyWithCertificateError {
  readonly valid: false;
  readonly error: Error;
  readonly errorCode: string;
  readonly partialResults: {
    readonly certificateExtracted: boolean;
    readonly jwtSignatureValid: boolean;
    readonly certificateInfo?: HeaderCertInfo;
  };
  readonly verificationTimestamp: string;
}

export type VerifyWithCertificateResult<T> =
  | VerifyWithCertificateSuccess<T extends z.ZodTypeAny ? z.infer<T> : unknown>
  | VerifyWithCertificateError;

export interface VerifyWithCertificateOptions {
  readonly clockTolerance: number; // Clock skew tolerance in seconds
  readonly maxAge?: number; // Maximum JWT age in seconds
}

export class DeviceIdVerifyMsg {
  readonly #base64: BaseXXEndeCoder;
  readonly #trustedCAs: CertificatePayload[];
  readonly #options: VerifyWithCertificateOptions;

  constructor(base64: BaseXXEndeCoder, trustedCAs: CertificatePayload[], options: VerifyWithCertificateOptions) {
    this.#base64 = base64;
    this.#trustedCAs = trustedCAs;
    this.#options = options;
  }

  createVerifyWithCertificateError(
    error: Result<unknown>,
    partialResults: Partial<VerifyWithCertificateError["partialResults"]> = {},
  ): VerifyWithCertificateError {
    return {
      valid: false,
      error: error.Err(),
      errorCode: this.getErrorCode(error.Err()),
      partialResults: {
        certificateExtracted: partialResults.certificateExtracted ?? false,
        jwtSignatureValid: partialResults.jwtSignatureValid ?? false,
        certificateInfo: partialResults.certificateInfo,
      },
      verificationTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify JWT and validate certificate
   */
  async verifyWithCertificate<S>(jwt: string, schema?: S): Promise<VerifyWithCertificateResult<S>> {
    let certInfo = undefined;
    // let publicKey = null;
    let jwtPayload = null;
    let jwtHeader = null;

    // Step 1: Extract certificate from JWT header
    const rCertInfo = this.extractCertificateFromJWT(jwt);
    if (rCertInfo.isErr()) {
      return this.createVerifyWithCertificateError(rCertInfo);
    }
    certInfo = rCertInfo.Ok();

    // Step 2: Validate certificate thumbprint integrity
    const rThumbprint = await this.validateCertificateThumbprint(certInfo);
    if (rThumbprint.isErr()) {
      return this.createVerifyWithCertificateError(rThumbprint, {
        certificateExtracted: true,
        certificateInfo: certInfo,
      });
    }
    if (!rThumbprint.Ok()) {
      return this.createVerifyWithCertificateError(Result.Err("Certificate thumbprint validation failed"), {
        certificateExtracted: true,
        certificateInfo: certInfo,
      });
    }

    const rVerify = await exception2Result(async () => {
      // Step 3: Extract and validate public key from certificate
      // console.log("Step 3: Extracting public key from certificate...");
      // publicKey = await extractPublicKeyFromCertificate(certInfo.certificate);
      // Step 4: Verify JWT signature with extracted public key
      const rKey = await sts.importJWK(certInfo.certificate.asCert().certificate.subjectPublicKeyInfo, certInfo.algorithm);
      if (rKey.isErr()) {
        throw rKey.Err();
      }
      return jwtVerify(jwt, rKey.Ok().key, {
        clockTolerance: this.#options.clockTolerance,
        maxTokenAge: this.#options.maxAge,
      });
    });
    if (rVerify.isErr()) {
      return this.createVerifyWithCertificateError(rVerify, {
        certificateExtracted: true,
        certificateInfo: certInfo,
      });
    }
    const jwtVerification = rVerify.Ok();
    if (!jwtVerification) {
      return this.createVerifyWithCertificateError(Result.Err("JWT verification failed"), {
        certificateExtracted: true,
        certificateInfo: certInfo,
      });
    }

    jwtPayload = jwtVerification.payload;
    jwtHeader = jwtVerification.protectedHeader;

    // Step 5: Validate certificate properties
    const rCertValidation = await this.validateCertificate(certInfo.certificate);
    if (rCertValidation.isErr()) {
      return this.createVerifyWithCertificateError(rCertValidation, {
        certificateExtracted: true,
        certificateInfo: certInfo,
        jwtSignatureValid: true,
      });
    }

    // Step 6: Validate certificate chain if provided
    if (certInfo.certificateChain.length > 1) {
      return this.createVerifyWithCertificateError(Result.Err("Certificate chain validation not implemented"), {
        certificateExtracted: true,
        certificateInfo: certInfo,
      });
    }

    if (schema) {
      const rPayloadParse = (schema as unknown as z.ZodTypeAny).safeParse(jwtPayload);
      if (!rPayloadParse.success) {
        return this.createVerifyWithCertificateError(Result.Err(rPayloadParse.error), {
          certificateExtracted: true,
          certificateInfo: certInfo,
          jwtSignatureValid: true,
        });
      }
      jwtPayload = rPayloadParse.data;
    }

    // Success - return comprehensive result
    return {
      valid: true,
      payload: jwtPayload as S extends z.ZodTypeAny ? z.infer<S> : unknown,
      header: jwtHeader,
      certificate: {
        ...certInfo,
        validation: rCertValidation.Ok(),
        publicKey: certInfo.certificate.asCert().certificate.subjectPublicKeyInfo,
      },
      verificationTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Extract certificate information from JWT header
   */
  extractCertificateFromJWT(jwt: string): Result<HeaderCertInfo> {
    return exception2Result(() => {
      // Decode JWT header without verification
      const header = decodeProtectedHeader(jwt);

      // Check for certificate in x5c claim
      if (!header.x5c || !Array.isArray(header.x5c) || header.x5c.length === 0) {
        throw new Error("No certificate chain (x5c) found in JWT header");
      }

      // Convert certificates from base64 to PEM
      const certificateChain = header.x5c.map((cert) => Certor.fromString(this.#base64, cert));
      const mainCertificate = certificateChain[0];

      return {
        certificate: mainCertificate,
        certificateChain: certificateChain,
        thumbprint: header.x5t,
        thumbprintSha256: header["x5t#S256"] as string,
        keyId: header.kid,
        algorithm: header.alg,
        certificateUrl: header.x5u,
        rawHeader: header,
      };
    });
  }

  /**
   * Validate certificate thumbprint to ensure integrity
   */
  async validateCertificateThumbprint(certInfo: HeaderCertInfo): Promise<Result<boolean>> {
    // Calculate SHA-1 thumbprint
    if (certInfo.thumbprint) {
      const calculatedThumbprint = await certInfo.certificate.asSHA1();
      // calculateCertThumbprint(certInfo.certificate, "sha1");
      if (certInfo.thumbprint !== calculatedThumbprint) {
        return Result.Err(new Error("Certificate SHA-1 thumbprint mismatch - certificate may have been tampered with"));
      }
    }

    // Calculate SHA-256 thumbprint
    if (certInfo.thumbprintSha256) {
      const calculatedThumbprintSha256 = await certInfo.certificate.asSHA256();
      if (certInfo.thumbprintSha256 !== calculatedThumbprintSha256) {
        return Result.Err(new Error("Certificate SHA-256 thumbprint mismatch - certificate may have been tampered with"));
      }
    }
    return Result.Ok(true);
  }

  /**
   * Validate certificate properties
   */
  async validateCertificate(certor: Certor): Promise<Result<VerifyWithCertificateSuccess["certificate"]["validation"]>> {
    const now = new Date();
    return exception2Result(() => {
      const cert = certor.asCert();
      // Parse certificate details
      const subject = certor.parseCertificateSubject(cert.sub);
      const issuer = certor.parseCertificateSubject(cert.iss);
      // const isSelfSigned = cert.issuer === cert.subject;
      // Basic time validations
      const notBefore = new Date(cert.nbf * 1000);
      const notAfter = new Date(cert.exp * 1000);

      if (notBefore > now) {
        throw new Error(`Certificate is not yet valid (valid from: ${notBefore.toISOString()})`);
      }

      if (notAfter < now) {
        throw new Error(`Certificate has expired (valid to: ${notAfter.toISOString()})`);
      }

      // Self-signed validation
      // if (isSelfSigned && !allowSelfSigned) {
      //   throw new Error("Self-signed certificates are not allowed");
      // }
      // Issuer validation
      // if (allowedIssuers.length > 0) {
      //   const issuerMatch = allowedIssuers.some((allowedIssuer) => {
      //     return cert.issuer.includes(allowedIssuer);
      //   });
      //   if (!issuerMatch) {
      //     throw new Error(`Certificate issuer not in allowed list: ${cert.issuer}`);
      //   }
      // }
      // Key usage validation (simplified)
      // if (requiredKeyUsage.length > 0) {
      //   // In a real implementation, you'd parse the keyUsage extension
      //   // For now, we assume digital signature is present
      //   const hasRequiredUsage = requiredKeyUsage.every((usage) => {
      //     return ["digitalSignature", "keyEncipherment"].includes(usage);
      //   });
      //   if (!hasRequiredUsage) {
      //     throw new Error("Certificate does not have required key usage");
      //   }
      // }
      // Trust validation for non-self-signed certificates
      let trustedCA = null;
      trustedCA = this.findTrustedCA(cert, this.#trustedCAs);
      if (!trustedCA) {
        throw new Error("Certificate not issued by a trusted CA");
      }

      return {
        valid: true,
        subject: subject,
        issuer: issuer,
        serialNumber: cert.certificate.serialNumber,
        // fingerprint: cert.fingerprint,
        // fingerprintSha256: cert.fingerprint256,
        notBefore: notBefore,
        notAfter: notAfter,
        publicKey: cert.certificate.subjectPublicKeyInfo,
        // selfSigned: isSelfSigned,
        // keyType: cert.publicKey.asymmetricKeyType,
        // keySize: cert.publicKey.asymmetricKeySize,
        trustedCA: trustedCA,
        validityPeriod: {
          days: Math.floor((notAfter.getTime() - notBefore.getTime()) / (1000 * 60 * 60 * 24)),
        },
      } satisfies VerifyWithCertificateSuccess["certificate"]["validation"];
    });
  }

  findTrustedCA(cert: CertificatePayload, trustedCAs: CertificatePayload[]) {
    return trustedCAs.find((trustedCA) => {
      try {
        return cert.iss === trustedCA.sub;
      } catch {
        return false;
      }
    });
  }

  getErrorCode(ierror: unknown) {
    const { message: errorMessage } = ierror as Error;
    if (errorMessage.includes("thumbprint mismatch")) return "CERT_THUMBPRINT_MISMATCH";
    if (errorMessage.includes("expired")) return "CERT_EXPIRED";
    if (errorMessage.includes("not yet valid")) return "CERT_NOT_YET_VALID";
    if (errorMessage.includes("self-signed")) return "CERT_SELF_SIGNED";
    if (errorMessage.includes("not trusted")) return "CERT_NOT_TRUSTED";
    if (errorMessage.includes("revoked")) return "CERT_REVOKED";
    if (errorMessage.includes("signature verification failed")) return "JWT_SIGNATURE_INVALID";
    if (errorMessage.includes("No certificate")) return "CERT_NOT_FOUND";
    return "VERIFICATION_FAILED";
  }
}
