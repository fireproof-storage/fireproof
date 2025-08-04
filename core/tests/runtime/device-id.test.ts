import { describe, it, expect, beforeEach } from "vitest";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { ensureSuperThis } from "@fireproof/core-runtime";
import {
  CertificatePayload,
  CertificatePayloadSchema,
  DeviceIdCA,
  DeviceIdCSR,
  DeviceIdKey,
  DeviceIdSignMsg,
  DeviceIdValidator,
  DeviceIdVerifyMsg,
  Extensions,
  JWKPrivate,
  Subject,
} from "@fireproof/core-device-id";

const sthis = ensureSuperThis();

describe("DeviceIdKey", () => {
  it("should export private key as JWK", async () => {
    const key = await DeviceIdKey.create();
    const jwk = await key.exportPrivateJWK();

    expect(jwk).toBeDefined();
    expect(jwk.kty).toBe("EC");
    expect(jwk.d).toBeDefined(); // Private key component

    const imported = await DeviceIdKey.createFromJWK(jwk as JWKPrivate);
    const jwk2 = await imported.exportPrivateJWK();
    expect(jwk2).toEqual(jwk);

    expect(await key.publicKey()).toEqual(await imported.publicKey());

    expect(await key.publicKey()).toEqual({
      crv: "P-256",
      kty: "EC",
      x: expect.any(String),
      y: expect.any(String),
    });
  });
});

describe("DeviceIdCSR and DeviceIdValidator integration", () => {
  it("should create and validate a CSR successfully", async () => {
    // Create a key and CSR
    const key = await DeviceIdKey.create();
    const csr = new DeviceIdCSR(key);

    const subject: Subject = {
      commonName: "test.example.com",
      organization: "Test Corp",
      locality: "San Francisco",
      stateOrProvinceName: "California",
      countryName: "US",
    };

    const extensions: Extensions = {
      subjectAltName: ["test.example.com", "www.test.example.com"],
      keyUsage: ["digitalSignature", "keyEncipherment"],
      extendedKeyUsage: ["serverAuth", "clientAuth"],
    };

    // Create the CSR
    const csrJWS = await csr.createCSR(subject, extensions);
    expect(csrJWS).toBeDefined();
    expect(typeof csrJWS).toBe("string");

    // Validate the CSR
    const validator = new DeviceIdValidator();
    const validation = await validator.validateCSR(csrJWS);

    expect(validation.valid).toBe(true);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }
    expect(validation.payload).toBeDefined();
    expect(validation.publicKey).toBeDefined();

    if (!validation.payload) {
      throw new Error("No payload");
    }
    // Verify payload structure
    const payload = validation.payload;
    expect(payload.sub).toBe(subject.commonName);
    expect(payload.iss).toBe("csr-client");
    expect(payload.aud).toBe("certificate-authority");
    expect(payload.csr.subject).toEqual(subject);
    expect(payload.csr.extensions.subjectAltName).toEqual(extensions.subjectAltName);
    expect(payload.csr.extensions.keyUsage).toEqual(extensions.keyUsage);
    expect(payload.csr.extensions.extendedKeyUsage).toEqual(extensions.extendedKeyUsage);
  });

  it("should fail validation for tampered CSR", async () => {
    const key = await DeviceIdKey.create();
    const csr = new DeviceIdCSR(key);

    const subject = { commonName: "test.example.com" };
    const csrJWS = await csr.createCSR(subject);

    // Tamper with the CSR
    const tamperedCSR = csrJWS.slice(0, -10) + "tampered123";

    const validator = new DeviceIdValidator();
    const validation = await validator.validateCSR(tamperedCSR);

    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("Validation should have failed");
    }
    expect(validation.error).toBeDefined();
  });

  it("should fail validation for CSR without public key in header", async () => {
    const validator = new DeviceIdValidator();
    const invalidCSR = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkNTUitKV1QifQ.eyJzdWIiOiJ0ZXN0In0.invalid";

    const validation = await validator.validateCSR(invalidCSR);

    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("Validation should have failed");
    }
    expect(validation.error).toContain("No public key in CSR header");
  });
});

describe("DeviceIdCA certificate generation and validation", () => {
  it("should generate and validate a certificate from CSR", async () => {
    // Create CA key and subject
    const caKey = await DeviceIdKey.create();
    const caSubject = {
      commonName: "Test CA",
      organization: "Test CA Corp",
      locality: "San Francisco",
      stateOrProvinceName: "California",
      countryName: "US",
    };

    // Mock CA actions
    const mockActions = {
      generateSerialNumber: async () => crypto.randomUUID(),
    };

    // Create CA
    const ca = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey,
      caSubject,
      actions: mockActions,
    });

    // Create device key and CSR
    const deviceKey = await DeviceIdKey.create();
    const csr = new DeviceIdCSR(deviceKey);

    const subject = {
      commonName: "device.example.com",
      organization: "Device Corp",
      locality: "New York",
      stateOrProvinceName: "New York",
      countryName: "US",
    };

    const extensions: Extensions = {
      subjectAltName: ["device.example.com", "alt.device.example.com"],
      keyUsage: ["digitalSignature", "keyEncipherment"],
      extendedKeyUsage: ["serverAuth"],
    };

    // Create CSR
    const csrJWS = await csr.createCSR(subject, extensions);

    // Process CSR and generate certificate
    const certificate = await ca.processCSR(csrJWS);

    // Verify certificate structure
    expect(certificate.certificate).toBeDefined();
    expect(certificate.format).toBe("JWS");
    expect(certificate.serialNumber).toBeDefined();
    expect(certificate.issuer).toBe(caSubject.commonName);
    expect(certificate.subject).toBe(subject.commonName);
    expect(certificate.validityPeriod.notBefore).toBeInstanceOf(Date);
    expect(certificate.validityPeriod.notAfter).toBeInstanceOf(Date);
    expect(certificate.publicKey).toBeDefined();

    // Verify certificate JWS signature with CA public key
    const caPublicKey = await caKey.publicKey();
    const caKeyForVerification = await importJWK(caPublicKey, "ES256");

    const { payload: certPayload, protectedHeader } = await jwtVerify(certificate.certificate, caKeyForVerification, {
      typ: "CERT+JWT",
    });

    // Verify certificate payload
    expect(certPayload.iss).toBe(caSubject.commonName);
    expect(certPayload.sub).toBe(subject.commonName);
    expect(certPayload.jti).toBe(certificate.serialNumber);
    expect(certPayload.certificate).toBeDefined();

    // Verify certificate extensions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cert = certPayload.certificate as any;
    expect(cert.subject).toEqual(subject);
    expect(cert.issuer).toEqual(caSubject);
    expect(cert.subjectPublicKeyInfo).toEqual(certificate.publicKey);
    // expect(cert.extensions.subjectAltName.names).toEqual(extensions.subjectAltName);
    // expect(cert.extensions.keyUsage.usage).toEqual(extensions.keyUsage);
    // expect(cert.extensions.extendedKeyUsage.usage).toEqual(extensions.extendedKeyUsage);

    // Verify protected header
    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.typ).toBe("CERT+JWT");
    expect(protectedHeader.kid).toBe(await caKey.fingerPrint());
  });

  it("should reject invalid CSR", async () => {
    const caKey = await DeviceIdKey.create();
    const caSubject = { commonName: "Test CA" };
    const mockActions = {
      generateSerialNumber: async () => crypto.randomUUID(),
    };

    const ca = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey,
      caSubject,
      actions: mockActions,
    });

    const invalidCSR = "invalid.csr.string";

    await expect(ca.processCSR(invalidCSR)).rejects.toThrow("CSR validation failed");
  });
});

describe("DeviceIdSignMsg", () => {
  let deviceKey: DeviceIdKey;
  let caKey: DeviceIdKey;
  let certificate: CertificatePayload;
  const { base64 } = ensureSuperThis().txt;

  let ca: DeviceIdCA;
  // Create CA
  const caSubject = {
    commonName: "Test CA",
    organization: "Test CA Corp",
  };

  const mockActions = {
    generateSerialNumber: async () => crypto.randomUUID(),
  };
  beforeEach(async () => {
    // Setup base64 encoder

    // Create CA and device keys
    caKey = await DeviceIdKey.create();
    deviceKey = await DeviceIdKey.create();

    ca = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey,
      caSubject,
      actions: mockActions,
    });

    // Create CSR and get certificate
    const csr = new DeviceIdCSR(deviceKey);
    const subject = {
      commonName: "device.example.com",
      organization: "Device Corp",
    };

    const csrJWS = await csr.createCSR(subject);
    const certResult = await ca.processCSR(csrJWS);

    // Extract certificate payload from JWS
    const caPublicKey = await caKey.publicKey();
    const caKeyForVerification = await importJWK(caPublicKey, "ES256");
    const { payload } = await jwtVerify(certResult.certificate, caKeyForVerification, { typ: "CERT+JWT" });
    certificate = CertificatePayloadSchema.parse(payload);
  });

  it("should sign a payload and include certificate information", async () => {
    const signMsg = new DeviceIdSignMsg(base64, deviceKey, certificate);
    const payload = { message: "test payload", timestamp: Date.now() };

    const jwt = await signMsg.sign(payload);
    expect(jwt).toBeDefined();
    expect(typeof jwt).toBe("string");

    // Decode header to verify certificate information
    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("JWT");
    expect(header.kid).toBe(await deviceKey.fingerPrint());
    expect(header.x5c).toBeDefined();
    expect(Array.isArray(header.x5c)).toBe(true);
    expect(header.x5c?.length).toBe(1);
    expect(header.x5t).toBeDefined();
    expect(header["x5t#S256"]).toBeDefined();
  });

  it("should verify signed JWT with device public key", async () => {
    const signMsg = new DeviceIdSignMsg(base64, deviceKey, certificate);
    const payload = { message: "verification test", id: 123 };

    const jwt = await signMsg.sign(payload);

    // Verify with device public key
    const devicePublicKey = await deviceKey.publicKey();
    const deviceKeyForVerification = await importJWK(devicePublicKey, "ES256");

    const { payload: verifiedPayload } = await jwtVerify(jwt, deviceKeyForVerification);
    expect(verifiedPayload.message).toBe(payload.message);
    expect(verifiedPayload.id).toBe(payload.id);
    expect(verifiedPayload.iat).toBeDefined();
    expect(verifiedPayload.exp).toBeDefined();
  });

  it("should include valid certificate thumbprints", async () => {
    const signMsg = new DeviceIdSignMsg(base64, deviceKey, certificate);
    const payload = { test: "thumbprint validation" };

    const jwt = await signMsg.sign(payload);
    const header = decodeProtectedHeader(jwt);

    // Verify thumbprints are base58btc encoded strings
    expect(typeof header.x5t).toBe("string");
    expect(header.x5t?.length).toBeGreaterThan(0);
    expect(typeof header["x5t#S256"]).toBe("string");
    expect((header["x5t#S256"] as string).length).toBeGreaterThan(0);
  });

  it("should fail verification with wrong key", async () => {
    const signMsg = new DeviceIdSignMsg(base64, deviceKey, certificate);
    const payload = { message: "wrong key test" };

    const jwt = await signMsg.sign(payload);

    // Try to verify with different key
    const wrongKey = await DeviceIdKey.create();
    const wrongPublicKey = await wrongKey.publicKey();
    const wrongKeyForVerification = await importJWK(wrongPublicKey, "ES256");

    await expect(jwtVerify(jwt, wrongKeyForVerification)).rejects.toThrow();
  });
  it("should verify JWT with valid certificate", async () => {
    const signMsg = new DeviceIdSignMsg(base64, deviceKey, certificate);
    const payload = { message: "verification test", id: 123 };
    const jwt = await signMsg.sign(payload);
    expect(jwt).toBeDefined();
    expect(typeof jwt).toBe("string");

    const deviceVerifyMsg = new DeviceIdVerifyMsg(base64, [await ca.caCertificate()], {
      clockTolerance: 60,
      maxAge: 3600,
    });

    const ret = await deviceVerifyMsg.verifyWithCertificate(jwt);
    expect(ret.valid).toBe(true);
  });

  it.skip("change the caKey", async () => {
    const signMsg = new DeviceIdSignMsg(base64, deviceKey, certificate);
    const payload = { message: "verification test", id: 123 };
    const jwt = await signMsg.sign(payload);
    expect(jwt).toBeDefined();
    expect(typeof jwt).toBe("string");

    const newCaKey = await DeviceIdKey.create();
    const newCa = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey: newCaKey,
      caSubject,
      actions: mockActions,
    });

    const deviceVerifyMsg = new DeviceIdVerifyMsg(base64, [await newCa.caCertificate()], {
      clockTolerance: 60,
      maxAge: 3600,
    });

    const ret = await deviceVerifyMsg.verifyWithCertificate(jwt);
    expect(ret.valid).toBe(false);
  });

  it("use a new deviceId ", async () => {
    const newDeviceKey = await DeviceIdKey.create();
    const signMsg = new DeviceIdSignMsg(base64, newDeviceKey, certificate);
    const payload = { message: "verification test", id: 123 };
    const jwt = await signMsg.sign(payload);
    expect(jwt).toBeDefined();
    expect(typeof jwt).toBe("string");

    const newCaKey = await DeviceIdKey.create();
    const newCa = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey: newCaKey,
      caSubject,
      actions: mockActions,
    });

    const deviceVerifyMsg = new DeviceIdVerifyMsg(base64, [await newCa.caCertificate()], {
      clockTolerance: 60,
      maxAge: 3600,
    });

    const ret = await deviceVerifyMsg.verifyWithCertificate(jwt);
    expect(ret.valid).toBe(false);
  });

  it("use a forged caCert", async () => {
    const signMsg = new DeviceIdSignMsg(base64, deviceKey, { ...certificate, nbf: certificate.nbf + 1 });
    const payload = { message: "verification test", id: 123 };
    const jwt = await signMsg.sign(payload);
    expect(jwt).toBeDefined();
    expect(typeof jwt).toBe("string");

    const newCaKey = await DeviceIdKey.create();
    const newCa = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey: newCaKey,
      caSubject,
      actions: mockActions,
    });

    const deviceVerifyMsg = new DeviceIdVerifyMsg(base64, [await newCa.caCertificate()], {
      clockTolerance: 60,
      maxAge: 3600,
    });

    const ret = await deviceVerifyMsg.verifyWithCertificate(jwt);
    expect(ret.valid).toBe(false);
  });
});
