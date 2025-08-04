import { hashObject } from "@fireproof/core-runtime";
import { Base64EndeCoder, CertificatePayload, Extensions, FPDeviceIDPayload, JWKPublic, Subject } from "@fireproof/core-types-base";
import { SignJWT } from "jose";
import { DeviceIdKey } from "./device-id-key.js";
import { DeviceIdValidator } from "./device-id-validator.js";
import { Certor } from "./certor.js";

export interface CAActions {
  generateSerialNumber(pub: JWKPublic): Promise<string>;
}
interface DeviceIdCAOpts {
  readonly base64: Base64EndeCoder;
  readonly caKey: DeviceIdKey;
  readonly caSubject: Subject;
  readonly actions: CAActions;
  readonly validityPeriod: number;
  readonly caChain: string[];
}
export interface DeviceIdCAOptsDefaulted {
  readonly base64: Base64EndeCoder;
  readonly caKey: DeviceIdKey;
  readonly caSubject: Subject;
  readonly actions: CAActions;
  readonly caChain?: string[]; // []
  readonly validityPeriod?: number; // 1 year
}
function defaultDeviceIdCAOpts(opts: DeviceIdCAOptsDefaulted): DeviceIdCAOpts {
  return {
    ...opts,
    validityPeriod: opts.validityPeriod || 365 * 24 * 60 * 60, // 1 year
    caChain: opts.caChain || [],
  };
}

export interface IssueCertificateResult {
  readonly certificate: string; // JWT String
  readonly format: "JWS";
  readonly serialNumber: string;
  readonly issuer: string;
  readonly subject: string;
  readonly validityPeriod: {
    readonly notBefore: Date;
    readonly notAfter: Date;
  };
  readonly publicKey: JWKPublic;
}

export class DeviceIdCA {
  readonly #opts: DeviceIdCAOpts;

  readonly #caKey: DeviceIdKey;
  readonly #caSubject: Subject;

  constructor(opts: DeviceIdCAOptsDefaulted) {
    this.#opts = defaultDeviceIdCAOpts(opts);
    this.#caKey = opts.caKey;
    this.#caSubject = opts.caSubject;
  }

  async processCSR(csrJWS: string): Promise<IssueCertificateResult> {
    const validator = new DeviceIdValidator();
    const validation = await validator.validateCSR(csrJWS);
    if (!validation.valid) {
      throw new Error(`CSR validation failed: ${validation.error}`);
    }
    return this.issueCertificate(validation.payload);
  }

  async caCertificate(): Promise<CertificatePayload> {
    const { certificate } = await this.issueCertificate({
      csr: {
        subject: this.#caSubject,
        publicKey: await this.#caKey.publicKey(),
        extensions: {},
      },
    });
    return Certor.fromJWT(this.#opts.base64, certificate).asCert();
  }

  async issueCertificate(devId: FPDeviceIDPayload): Promise<IssueCertificateResult> {
    const now = Math.floor(Date.now() / 1000);
    const serialNumber = await this.#opts.actions.generateSerialNumber(await this.#caKey.publicKey());

    // Create certificate payload
    const certificatePayload: CertificatePayload = {
      // Standard JWT claims
      iss: this.#caSubject.commonName, // Issuer (CA)
      sub: devId.csr.subject.commonName, // Subject
      aud: devId.aud || "certificate-users",
      iat: now,
      nbf: now, // Not before
      exp: now + this.#opts.validityPeriod, // 1 year validity
      jti: serialNumber, // JWT ID as serial number

      // Certificate-specific claims
      certificate: {
        version: "3", // X.509 v3
        serialNumber: serialNumber,

        // Subject information
        subject: devId.csr.subject,

        // Issuer information
        issuer: this.#caSubject,

        // Validity period
        validity: {
          notBefore: new Date(now * 1000).toISOString(),
          notAfter: new Date((now + this.#opts.validityPeriod) * 1000).toISOString(),
        },

        // Public key from CSR
        subjectPublicKeyInfo: devId.csr.publicKey,

        // Extensions
        // extensions: await this.buildCertificateExtensions(devId.csr.extensions, devId.csr.subject, subjectPubKey),
        // Certificate metadata
        signatureAlgorithm: "ES256",
        keyUsage: ["digitalSignature", "keyEncipherment"],
        extendedKeyUsage: ["serverAuth"],
      },
    };

    // Get CA public key for certificate
    // const caPublicJWK = await this.#caKey.publicKey();
    const pKey = await this.#caKey.exportPrivateJWK();
    const kid = await this.#caKey.fingerPrint();

    // Create and sign the certificate JWS
    const certificateJWC = await new SignJWT(certificatePayload)
      .setProtectedHeader({
        alg: "ES256",
        typ: "CERT+JWT", // Custom type for certificate
        kid,
        x5c: this.#opts.caChain, // CA certificate chain (optional)
        // exp: now + this.#opts.validityPeriod,
        // crit: ['exp'] // Critical header indicating certificate format
      })
      .sign(pKey);

    return {
      certificate: certificateJWC,
      format: "JWS",
      serialNumber: serialNumber,
      issuer: this.#caSubject.commonName,
      subject: devId.csr.subject.commonName,
      validityPeriod: {
        notBefore: new Date(now * 1000),
        notAfter: new Date((now + this.#opts.validityPeriod) * 1000),
      },
      publicKey: devId.csr.publicKey,
    };
  }

  // Build certificate extensions
  async buildCertificateExtensions(requestedExtensions: Extensions, subject: Subject, subjectPubKey: JWKPublic) {
    const extensions = {
      // Basic Constraints
      basicConstraints: {
        critical: true,
        cA: false, // End-entity certificate
        pathLenConstraint: null,
      },

      // Key Usage
      keyUsage: {
        critical: true,
        usage: requestedExtensions.keyUsage || ["digitalSignature", "keyEncipherment"],
      },

      // Extended Key Usage
      extendedKeyUsage: {
        critical: false,
        usage: requestedExtensions.extendedKeyUsage || ["serverAuth"],
      },

      // Subject Alternative Name
      subjectAltName: {
        critical: false,
        names: requestedExtensions.subjectAltName || [subject.commonName],
      },

      // Authority Key Identifier (would be CA's key identifier)
      authorityKeyIdentifier: {
        keyIdentifier: await this.#caKey.fingerPrint(),
      },

      // Subject Key Identifier
      subjectKeyIdentifier: {
        keyIdentifier: await hashObject(subjectPubKey),
      },
      // // CRL Distribution Points
      // crlDistributionPoints: {
      //   distributionPoints: ["https://ca.example.com/crl"]
      // },
      // Authority Information Access
      // authorityInfoAccess: {
      //   ocsp: ["https://ocsp.example.com"],
      //   caIssuers: ["https://ca.example.com/cert"]
      // }
    };

    return extensions;
  }
}
