import {
  BaseXXEndeCoder,
  CertificatePayload,
  CertificatePayloadSchema,
  Extensions,
  FPDeviceIDCSRPayload,
  IssueCertificateResult,
  JWKPrivate,
  JWKPrivateSchema,
  JWKPublic,
  Subject,
  SuperThis,
  ClerkClaim,
} from "@fireproof/core-types-base";
import { SignJWT, jwtVerify } from "jose";
import { DeviceIdKey } from "./device-id-key.js";
import { DeviceIdValidator } from "./device-id-validator.js";
import { Certor } from "./certor.js";
import { Result, exception2Result } from "@adviser/cement";
import { hashObjectAsync } from "@fireproof/core-runtime";
import { base58btc } from "multiformats/bases/base58";
import { CAActions, CACertResult, DeviceIdCAIf, DeviceIdCAJsonParam } from "@fireproof/core-types-device-id";

interface DeviceIdCAOpts {
  readonly base64: BaseXXEndeCoder;
  readonly caKey: DeviceIdKey;
  readonly caSubject: Subject;
  readonly actions: CAActions;
  readonly validityPeriod: number;
  readonly caChain: string[];
}
export interface DeviceIdCAOptsDefaulted {
  readonly base64: BaseXXEndeCoder;
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

export class DeviceIdCA implements DeviceIdCAIf {
  readonly #opts: DeviceIdCAOpts;

  readonly #caKey: DeviceIdKey;
  readonly #caSubject: Subject;

  constructor(opts: DeviceIdCAOptsDefaulted) {
    this.#opts = defaultDeviceIdCAOpts(opts);
    this.#caKey = opts.caKey;
    this.#caSubject = opts.caSubject;
  }

  /**
   * Create a DeviceIdCA from the JSON output of the CLI ca-cert command.
   * Verifies the certificate signature before creating the CA instance.
   *
   * @param sthis - SuperThis instance for configuration
   * @param caJson - JSON object with privateKey (JWKPrivate or base58btc string) and signedCert from CLI
   * @param actions - CA actions for generating serial numbers
   * @returns Result containing the DeviceIdCA instance or an error
   */
  static async from(sthis: SuperThis, caJson: DeviceIdCAJsonParam, actions: CAActions): Promise<Result<DeviceIdCA>> {
    // Decode private key if it's a base58btc string, otherwise use as-is
    let privateKey: JWKPrivate;
    if (typeof caJson.privateKey === "string") {
      const rPrivateKey = await exception2Result(async () => {
        const decoded = base58btc.decode(caJson.privateKey as string);
        const jsonString = sthis.txt.decode(decoded);
        return JSON.parse(jsonString);
      });
      if (rPrivateKey.isErr()) {
        return Result.Err(`Failed to decode privateKey: ${rPrivateKey.Err().message}`);
      }

      // Validate the decoded private key
      const parseResult = JWKPrivateSchema.safeParse(rPrivateKey.Ok());
      if (!parseResult.success) {
        return Result.Err(`Invalid private key format: ${parseResult.error.message}`);
      }
      privateKey = parseResult.data;
    } else {
      privateKey = caJson.privateKey;
    }

    // Create DeviceIdKey from private key
    const keyResult = await DeviceIdKey.createFromJWK(privateKey);
    if (keyResult.isErr()) {
      return Result.Err(`Failed to create DeviceIdKey: ${keyResult.Err().message}`);
    }
    const caKey = keyResult.Ok();

    // Get public key for verification
    const publicKeyResult = await exception2Result(async () => await caKey.publicKey());
    if (publicKeyResult.isErr()) {
      return Result.Err(`Failed to get public key: ${publicKeyResult.Err().message}`);
    }
    const publicKey = publicKeyResult.Ok();

    // Verify the certificate was signed by this key
    const verifyResult = await exception2Result(
      async () =>
        await jwtVerify(caJson.signedCert, publicKey, {
          typ: "CERT+JWT",
          algorithms: ["ES256"],
        }),
    );

    if (verifyResult.isErr()) {
      return Result.Err(`Certificate verification failed: ${verifyResult.Err().message}`);
    }

    const verified = verifyResult.Ok();

    // Parse and validate the certificate payload
    const parseResult = CertificatePayloadSchema.safeParse(verified.payload);
    if (!parseResult.success) {
      return Result.Err(`Invalid certificate payload: ${parseResult.error.message}: ${JSON.stringify(verified.payload)}`);
    }

    const claims = parseResult.data;
    const caSubject: Subject = claims.certificate.issuer;

    // Create the DeviceIdCA instance
    const deviceCA = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey,
      caSubject,
      actions,
    });

    return Result.Ok(deviceCA);
  }

  getCAKey() {
    return this.#caKey;
  }

  async processCSR(csrJWS: string, addition: ClerkClaim): Promise<Result<IssueCertificateResult>> {
    const validator = new DeviceIdValidator();
    const validation = await validator.validateCSR(csrJWS);
    if (!validation.valid) {
      return Result.Err(validation.error);
    }
    return this.issueCertificate({ ...validation.payload, creatingUser: { type: "clerk", claims: addition } });
  }

  async caCertificate(): Promise<Result<CACertResult>> {
    const rCert = await this.issueCertificate({
      csr: {
        subject: this.#caSubject,
        publicKey: await this.#caKey.publicKey(),
      },
    });
    if (rCert.isErr()) {
      return Result.Err(rCert);
    }
    return Result.Ok({
      certificate: Certor.fromUnverifiedJWT(this.#opts.base64, rCert.Ok().certificateJWT).asCert(),
      jwtStr: rCert.Ok().certificateJWT,
    });
  }

  async issueCertificate(devId: FPDeviceIDCSRPayload): Promise<Result<IssueCertificateResult>> {
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

      creatingUser: devId.creatingUser,

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

    return Result.Ok({
      certificateJWT: certificateJWC,
      certificatePayload: certificatePayload,
      format: "JWS",
      serialNumber: serialNumber,
      issuer: this.#caSubject.commonName,
      subject: devId.csr.subject.commonName,
      validityPeriod: {
        notBefore: new Date(now * 1000),
        notAfter: new Date((now + this.#opts.validityPeriod) * 1000),
      },
      publicKey: devId.csr.publicKey,
    });
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
        keyIdentifier: await hashObjectAsync(subjectPubKey),
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
