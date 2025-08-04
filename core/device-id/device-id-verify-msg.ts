import { Base64EndeCoder, CertificatePayload, JWKPublic } from "@fireproof/core-types-base";
import { jwtVerify, decodeProtectedHeader } from "jose";
import { Certor } from "./certor.js";

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

interface VerifyWithCertificateSuccess {
  readonly valid: true;
  readonly payload: unknown;
  readonly header: unknown;
  readonly certificate: HeaderCertInfo & {
    readonly validation: {
      readonly valid: true;
      readonly subject: string;
      readonly issuer: string;
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
  readonly error: string;
  readonly errorCode: string;
  readonly partialResults: {
    readonly certificateExtracted: boolean;
    readonly jwtSignatureValid: boolean;
    readonly certificateInfo?: HeaderCertInfo;
  };
  readonly verificationTimestamp: string;
}

export type VerifyWithCertificateResult = VerifyWithCertificateSuccess | VerifyWithCertificateError;

interface VerifyWithCertificateOptions {
  readonly clockTolerance: number; // Clock skew tolerance in seconds
  readonly maxAge?: number; // Maximum JWT age in seconds
}

export class DeviceIdVerifyMsg {
  readonly #base64: Base64EndeCoder;
  readonly #trustedCAs: CertificatePayload[];
  readonly #options: VerifyWithCertificateOptions;

  constructor(base64: Base64EndeCoder, trustedCAs: CertificatePayload[], options: VerifyWithCertificateOptions) {
    this.#base64 = base64;
    this.#trustedCAs = trustedCAs;
    this.#options = options;
  }

  /**
   * Verify JWT and validate certificate
   */
  async verifyWithCertificate(jwt: string): Promise<VerifyWithCertificateResult> {
    let certInfo = undefined;
    // let publicKey = null;
    let jwtPayload = null;
    let jwtHeader = null;

    try {
      // Step 1: Extract certificate from JWT header
      certInfo = this.extractCertificateFromJWT(jwt);
      if (!certInfo.certificate) {
        throw new Error("No certificate found in JWT header");
      }

      // Step 2: Validate certificate thumbprint integrity
      if (!(await this.validateCertificateThumbprint(certInfo))) {
        throw new Error("Certificate thumbprint validation failed");
      }

      // Step 3: Extract and validate public key from certificate
      // console.log("Step 3: Extracting public key from certificate...");
      // publicKey = await extractPublicKeyFromCertificate(certInfo.certificate);
      // Step 4: Verify JWT signature with extracted public key
      const jwtVerification = await jwtVerify(jwt, certInfo.certificate.asCert().certificate.subjectPublicKeyInfo, {
        clockTolerance: this.#options.clockTolerance,
        maxTokenAge: this.#options.maxAge,
      });
      if (!jwtVerification) {
        throw new Error("JWT verification failed");
      }

      jwtPayload = jwtVerification.payload;
      jwtHeader = jwtVerification.protectedHeader;

      // Step 5: Validate certificate properties
      const certValidation = await this.validateCertificate(certInfo.certificate);

      // Step 6: Validate certificate chain if provided
      if (certInfo.certificateChain.length > 1) {
        throw new Error("Certificate chain validation not implemented");
      }

      // Success - return comprehensive result
      return {
        valid: true,
        payload: jwtPayload,
        header: jwtHeader,
        certificate: {
          ...certInfo,
          validation: certValidation,
          publicKey: certInfo.certificate.asCert().certificate.subjectPublicKeyInfo,
        },
        verificationTimestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Log the error for debugging
      return {
        valid: false,
        error: (error as Error).message,
        errorCode: this.getErrorCode(error),
        partialResults: {
          certificateExtracted: !!certInfo,
          // publicKeyExtracted: !!publicKey,
          jwtSignatureValid: !!jwtPayload,
          certificateInfo: certInfo,
        },
        verificationTimestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Extract certificate information from JWT header
   */
  extractCertificateFromJWT(jwt: string): HeaderCertInfo {
    try {
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
    } catch (error) {
      throw new Error(`Failed to extract certificate from JWT: ${(error as Error).message}`);
    }
  }

  /**
   * Validate certificate thumbprint to ensure integrity
   */
  async validateCertificateThumbprint(certInfo: ReturnType<typeof this.extractCertificateFromJWT>) {
    // Calculate SHA-1 thumbprint
    if (certInfo.thumbprint) {
      const calculatedThumbprint = await certInfo.certificate.asSHA1();

      // calculateCertThumbprint(certInfo.certificate, "sha1");
      if (certInfo.thumbprint !== calculatedThumbprint) {
        throw new Error("Certificate SHA-1 thumbprint mismatch - certificate may have been tampered with");
      }
    }

    // Calculate SHA-256 thumbprint
    if (certInfo.thumbprintSha256) {
      const calculatedThumbprintSha256 = await certInfo.certificate.asSHA256();

      if (certInfo.thumbprintSha256 !== calculatedThumbprintSha256) {
        throw new Error("Certificate SHA-256 thumbprint mismatch - certificate may have been tampered with");
      }
    }

    return true;
  }

  /**
   * Validate certificate properties
   */
  async validateCertificate(certor: Certor) {
    const now = new Date();
    try {
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
      };
    } catch (error) {
      throw new Error(`Certificate validation failed: ${(error as Error).message}`);
    }
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
