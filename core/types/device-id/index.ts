import { Result } from "@adviser/cement";
import { z } from "zod/v4";
import { CertificatePayload, ClerkClaim, IssueCertificateResult, JWKPrivate, JWKPublic } from "@fireproof/core-types-base";

export interface CAActions {
  generateSerialNumber(pub: JWKPublic): Promise<string>;
}

export interface DeviceIdCAJsonParam {
  readonly privateKey: JWKPrivate | string; // JWKPrivate object or base58btc-encoded string
  readonly signedCert: string;
}

export interface CACertResult {
  readonly certificate: CertificatePayload;
  readonly jwtStr: string;
}

export interface DeviceIdTransport {
  issueCertificate(csrJWT: string): Promise<Result<IssueCertificateResult>>;
}

export interface DeviceIdProtocol {
  issueCertificate(msg: string): Promise<Result<IssueCertificateResult>>;
  verifyMsg<S>(message: string, schema?: S): Promise<VerifyWithCertificateResult<S>>;
}

export interface DeviceIdProtocolSrvOpts {
  readonly actions: CAActions;
}

export interface CertorIf {
  asCert(): CertificatePayload;

  parseCertificateSubject(s: string): Record<string, string>;

  asSHA1(): Promise<string>;

  asSHA256(): Promise<string>;

  asBase64(): string;
}

export interface HeaderCertInfo {
  readonly certificate: CertorIf;
  readonly certificateChain: CertorIf[];
  readonly thumbprint?: string;
  readonly thumbprintSha256?: string;
  readonly keyId?: string;
  readonly algorithm?: string;
  readonly certificateUrl?: string;
  readonly rawHeader: unknown;
}

export interface VerifyWithCertificateSuccess<T = unknown> {
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

export interface VerifyWithCertificateError {
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

export interface DeviceIdKeyIf {
  fingerPrint(): Promise<string>;
  exportPrivateJWK(): Promise<JWKPrivate>;
  publicKey(): Promise<JWKPublic>;
}

export interface DeviceIdCAIf {
  /**
   * Get the CA key.
   * @returns The CA key
   */
  getCAKey(): DeviceIdKeyIf;

  /**
   * Process a Certificate Signing Request (CSR) and issue a certificate.
   *
   * @param csrJWS - The CSR in JWS format
   * @param addition - Additional Clerk claims to include
   * @returns Result containing the issued certificate or an error
   */
  processCSR(csrJWS: string, addition: ClerkClaim): Promise<Result<IssueCertificateResult>>;

  /**
   * Generate a CA certificate.
   *
   * @returns Result containing the CA certificate or an error
   */
  caCertificate(): Promise<Result<CACertResult>>;

  /**
   * Issue a certificate from a device ID CSR payload.
   *
   * @param devId - The device ID CSR payload
   * @returns Result containing the issued certificate or an error
   */
  issueCertificate(devId: unknown): Promise<Result<IssueCertificateResult>>;
}
