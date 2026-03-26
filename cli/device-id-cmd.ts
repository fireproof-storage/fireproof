/* eslint-disable no-console */
import { command, option, string, subcommands, flag } from "cmd-ts";
import { Subject, CertificatePayloadSchema, JWKPublic, JWKPrivate } from "@fireproof/core-types-base";
import { DeviceIdKey, DeviceIdCSR, DeviceIdCA } from "@fireproof/core-device-id";
import { getKeyBag } from "@fireproof/core-keybag";
import { decodeJwt } from "jose";
import fs from "fs-extra";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import open from "open";
import {
  Future,
  timeouted,
  isSuccess,
  isTimeout,
  BuildURI,
  Result,
  HandleTriggerCtx,
  EventoHandler,
  EventoResultType,
  Option,
} from "@adviser/cement";
import { sts } from "@fireproof/core-runtime";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "./cmd-evento.js";

function getStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("readable", () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on("end", () => resolve(data));
  });
}

// Reusable subject options for certificates and CSRs
// Common Name is always required
function subjectOptions() {
  return {
    commonName: option({
      long: "common-name",
      short: "cn",
      description: "Common Name (required, e.g., 'My Device' or 'device-serial')",
      type: string,
    }),
    organization: option({
      long: "organization",
      short: "o",
      description: "Organization name",
      type: string,
      defaultValue: () => "You did not set the Organization",
    }),
    locality: option({
      long: "locality",
      short: "l",
      description: "Locality/City",
      type: string,
      defaultValue: () => "You did not set the City",
    }),
    state: option({
      long: "state",
      short: "s",
      description: "State or Province",
      type: string,
      defaultValue: () => "You did not set the State",
    }),
    country: option({
      long: "country",
      short: "c",
      description: "Country (2-letter code)",
      type: string,
      defaultValue: () => "WD",
    }),
  };
}

// Helper to build Subject from parsed args
function buildSubject(args: {
  commonName: string;
  organization: string;
  locality: string;
  state: string;
  country: string;
}): Subject {
  return {
    commonName: args.commonName,
    organization: args.organization,
    locality: args.locality,
    stateOrProvinceName: args.state,
    countryName: args.country,
  };
}

// --- Device ID Create ---

export const ReqDeviceIdCreate = type({
  type: "'core-cli.device-id-create'",
});
export type ReqDeviceIdCreate = typeof ReqDeviceIdCreate.infer;

export const ResDeviceIdCreate = type({
  type: "'core-cli.res-device-id-create'",
  output: "string",
});
export type ResDeviceIdCreate = typeof ResDeviceIdCreate.infer;

export function isResDeviceIdCreate(u: unknown): u is ResDeviceIdCreate {
  return !(ResDeviceIdCreate(u) instanceof type.errors);
}

export const deviceIdCreateEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqDeviceIdCreate, ResDeviceIdCreate> = {
  hash: "core-cli.device-id-create",
  validate: (ctx) => {
    if (!(ReqDeviceIdCreate(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqDeviceIdCreate)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDeviceIdCreate, ResDeviceIdCreate>,
  ): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.request.cmdTs.raw as {
      force: boolean;
    };

    const keyBag = await getKeyBag(sthis);
    const existingDeviceIdResult = await keyBag.getDeviceId();

    if (existingDeviceIdResult.deviceId.IsSome() && !args.force) {
      const jwk = existingDeviceIdResult.deviceId.unwrap();
      const deviceIdKey = (await DeviceIdKey.createFromJWK(jwk)).unwrap();
      const fingerprint = await deviceIdKey.fingerPrint();
      return sendMsg(ctx, {
        type: "core-cli.res-device-id-create",
        output: `Existing Device ID Fingerprint: ${fingerprint}`,
      } satisfies ResDeviceIdCreate);
    }

    const deviceIdKey = await DeviceIdKey.create();
    const jwkPrivate = await deviceIdKey.exportPrivateJWK();

    await keyBag.setDeviceId(jwkPrivate);
    const fingerprint = await deviceIdKey.fingerPrint();
    const lines = [
      `Created Device ID Fingerprint: ${fingerprint}`,
      "To generate a Certificate Signing Request (CSR), run: core-cli deviceId csr",
      "To export the public and private keys, run: core-cli deviceId export",
    ];
    return sendMsg(ctx, {
      type: "core-cli.res-device-id-create",
      output: lines.join("\n"),
    } satisfies ResDeviceIdCreate);
  },
};

// --- Device ID CSR ---

export const ReqDeviceIdCsr = type({
  type: "'core-cli.device-id-csr'",
});
export type ReqDeviceIdCsr = typeof ReqDeviceIdCsr.infer;

export const ResDeviceIdCsr = type({
  type: "'core-cli.res-device-id-csr'",
  output: "string",
});
export type ResDeviceIdCsr = typeof ResDeviceIdCsr.infer;

export function isResDeviceIdCsr(u: unknown): u is ResDeviceIdCsr {
  return !(ResDeviceIdCsr(u) instanceof type.errors);
}

export const deviceIdCsrEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqDeviceIdCsr, ResDeviceIdCsr> = {
  hash: "core-cli.device-id-csr",
  validate: (ctx) => {
    if (!(ReqDeviceIdCsr(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqDeviceIdCsr)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDeviceIdCsr, ResDeviceIdCsr>,
  ): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.request.cmdTs.raw as {
      commonName: string;
      organization: string;
      locality: string;
      state: string;
      country: string;
    };

    const keyBag = await getKeyBag(sthis);
    const existingDeviceIdResult = await keyBag.getDeviceId();

    if (existingDeviceIdResult.deviceId.IsNone()) {
      return Result.Err("No Device ID found. Please create one using 'core-cli deviceId create' first.");
    }

    const jwkPrivate = existingDeviceIdResult.deviceId.unwrap();
    const createResult = await DeviceIdKey.createFromJWK(jwkPrivate);
    if (createResult.isErr()) {
      return Result.Err(`Error loading existing device ID: ${createResult.Err()}`);
    }
    const deviceIdKey = createResult.Ok();

    const deviceIdCSR = new DeviceIdCSR(sthis, deviceIdKey);
    const subject = buildSubject(args);
    const csrResult = await deviceIdCSR.createCSR(subject);

    if (csrResult.isErr()) {
      return Result.Err(`Failed to generate CSR: ${csrResult.Err()}`);
    }

    const lines = [
      "\n--- Certificate Signing Request (CSR) ---",
      csrResult.Ok(),
      "---\n",
      "Please send the above CSR to your Certificate Authority (CA) to get a signed certificate.",
      "Once you receive the certificate, you can use a future command to import it.",
    ];
    return sendMsg(ctx, {
      type: "core-cli.res-device-id-csr",
      output: lines.join("\n"),
    } satisfies ResDeviceIdCsr);
  },
};

// --- Device ID Export ---

export const ReqDeviceIdExport = type({
  type: "'core-cli.device-id-export'",
});
export type ReqDeviceIdExport = typeof ReqDeviceIdExport.infer;

export const ResDeviceIdExport = type({
  type: "'core-cli.res-device-id-export'",
  output: "string",
});
export type ResDeviceIdExport = typeof ResDeviceIdExport.infer;

export function isResDeviceIdExport(u: unknown): u is ResDeviceIdExport {
  return !(ResDeviceIdExport(u) instanceof type.errors);
}

export const deviceIdExportEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqDeviceIdExport, ResDeviceIdExport> = {
  hash: "core-cli.device-id-export",
  validate: (ctx) => {
    if (!(ReqDeviceIdExport(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqDeviceIdExport)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDeviceIdExport, ResDeviceIdExport>,
  ): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.request.cmdTs.raw as {
      private: boolean;
      json: boolean;
      public: boolean;
      cert: boolean;
    };

    const keyBag = await getKeyBag(sthis);
    const existingDeviceIdResult = await keyBag.getDeviceId();

    if (existingDeviceIdResult.deviceId.IsNone()) {
      return Result.Err("No Device ID found. Please create one using 'core-cli deviceId create' first.");
    }

    const jwkPrivate = existingDeviceIdResult.deviceId.unwrap();
    const createResult = await DeviceIdKey.createFromJWK(jwkPrivate);
    if (createResult.isErr()) {
      return Result.Err(`Error loading device ID: ${createResult.Err()}`);
    }
    const deviceIdKey = createResult.Ok();

    let publicKey;
    let privateKey;
    let certificate;

    // Determine what to export based on flags. Default: public and cert
    const exportPublic = args.public || (!args.private && !args.cert);
    const exportPrivate = args.private;
    const exportCert = args.cert || (!args.private && !args.public && !args.cert);

    if (exportPublic) {
      publicKey = await deviceIdKey.publicKey();
    }
    if (exportPrivate) {
      privateKey = await deviceIdKey.exportPrivateJWK();
    }
    if (exportCert && existingDeviceIdResult.cert.IsSome()) {
      certificate = existingDeviceIdResult.cert.unwrap();
    } else if (args.cert && existingDeviceIdResult.cert.IsNone()) {
      return Result.Err("No certificate found for this Device ID.");
    }

    let output: string;
    if (args.json) {
      const outputObject: { publicKey?: JWKPublic; privateKey?: JWKPrivate; certificate?: string; fingerprint?: string } = {};
      if (publicKey) outputObject.publicKey = publicKey;
      if (privateKey) outputObject.privateKey = privateKey;
      if (certificate) outputObject.certificate = certificate.certificateJWT;
      output = JSON.stringify(outputObject);
    } else {
      // Human-readable output
      const lines: string[] = [];
      lines.push("--- Device ID Export ---");
      const fingerprint = await deviceIdKey.fingerPrint();
      lines.push(`Fingerprint: ${fingerprint}`);

      if (publicKey) {
        lines.push("\nPublic Key (JWK):");
        lines.push(JSON.stringify(publicKey, null, 2));
      }
      if (privateKey) {
        lines.push("\nPrivate Key (JWK):");
        lines.push(JSON.stringify(privateKey, null, 2));
      }
      if (certificate) {
        lines.push("\nCertificate (JWT):");
        lines.push(certificate.certificateJWT);
      }
      lines.push("---\n");
      output = lines.join("\n");
    }

    return sendMsg(ctx, {
      type: "core-cli.res-device-id-export",
      output,
    } satisfies ResDeviceIdExport);
  },
};

// --- Device ID Cert ---

export const ReqDeviceIdCert = type({
  type: "'core-cli.device-id-cert'",
});
export type ReqDeviceIdCert = typeof ReqDeviceIdCert.infer;

export const ResDeviceIdCert = type({
  type: "'core-cli.res-device-id-cert'",
  output: "string",
});
export type ResDeviceIdCert = typeof ResDeviceIdCert.infer;

export function isResDeviceIdCert(u: unknown): u is ResDeviceIdCert {
  return !(ResDeviceIdCert(u) instanceof type.errors);
}

export const deviceIdCertEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqDeviceIdCert, ResDeviceIdCert> = {
  hash: "core-cli.device-id-cert",
  validate: (ctx) => {
    if (!(ReqDeviceIdCert(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqDeviceIdCert)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDeviceIdCert, ResDeviceIdCert>,
  ): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.request.cmdTs.raw as {
      file: string;
    };

    const keyBag = await getKeyBag(sthis);
    const existingDeviceIdResult = await keyBag.getDeviceId();

    if (existingDeviceIdResult.deviceId.IsNone()) {
      return Result.Err("No Device ID found. Please create one using 'core-cli deviceId create' first.");
    }

    const jwkPrivate = existingDeviceIdResult.deviceId.unwrap();
    let certificateContent: string;
    const lines: string[] = [];

    if (args.file) {
      certificateContent = await fs.readFile(args.file, "utf8");
      lines.push(`Certificate read from ${args.file}`);
    } else {
      console.log("Waiting for certificate content from stdin (Ctrl+D to finish):");
      certificateContent = await getStdin();
      lines.push("Certificate read from stdin.");
    }

    const decoded = decodeJwt(certificateContent);
    const certPayload = CertificatePayloadSchema.parse(decoded);

    const certToStore = {
      certificateJWT: certificateContent,
      certificatePayload: certPayload,
    };

    await keyBag.setDeviceId(jwkPrivate, certToStore);
    lines.push("Certificate successfully stored with the Device ID.");

    return sendMsg(ctx, {
      type: "core-cli.res-device-id-cert",
      output: lines.join("\n"),
    } satisfies ResDeviceIdCert);
  },
};

// --- Device ID CA Cert ---

export const ReqDeviceIdCaCert = type({
  type: "'core-cli.device-id-ca-cert'",
});
export type ReqDeviceIdCaCert = typeof ReqDeviceIdCaCert.infer;

export const ResDeviceIdCaCert = type({
  type: "'core-cli.res-device-id-ca-cert'",
  output: "string",
});
export type ResDeviceIdCaCert = typeof ResDeviceIdCaCert.infer;

export function isResDeviceIdCaCert(u: unknown): u is ResDeviceIdCaCert {
  return !(ResDeviceIdCaCert(u) instanceof type.errors);
}

export const deviceIdCaCertEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqDeviceIdCaCert, ResDeviceIdCaCert> = {
  hash: "core-cli.device-id-ca-cert",
  validate: (ctx) => {
    if (!(ReqDeviceIdCaCert(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqDeviceIdCaCert)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDeviceIdCaCert, ResDeviceIdCaCert>,
  ): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.request.cmdTs.raw as {
      commonName: string;
      organization: string;
      locality: string;
      state: string;
      country: string;
      keyFile: string;
      outputKey: string;
      outputCert: string;
      json: boolean;
      envVars: boolean;
    };

    // Create conditional logger: silent for --json or --env, otherwise console.log
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const log = args.json || args.envVars ? () => {} : console.log.bind(console);

    // Load or create the CA key
    let caKey: DeviceIdKey;
    let jwkPrivate: JWKPrivate;

    if (args.keyFile) {
      // Load existing key from file
      const keyContent = await fs.readFile(args.keyFile, "utf8");
      jwkPrivate = JSON.parse(keyContent) as JWKPrivate;
      const keyResult = await DeviceIdKey.createFromJWK(jwkPrivate);
      if (keyResult.isErr()) {
        return Result.Err(`Error loading private key from file: ${keyResult.Err()}`);
      }
      caKey = keyResult.Ok();
      log(`Loaded private key from ${args.keyFile}`);
    } else {
      // Generate new key
      caKey = await DeviceIdKey.create();
      jwkPrivate = await caKey.exportPrivateJWK();
      log("Generated new CA private key");

      // Save the key if output path provided
      if (args.outputKey) {
        await fs.writeFile(args.outputKey, JSON.stringify(jwkPrivate, null, 2), "utf8");
        log(`Private key saved to ${args.outputKey}`);
      }
    }

    // Build the CA subject with all fields (including defaults)
    const caSubject = buildSubject(args);

    // Create the DeviceIdCA
    const deviceCA = new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey,
      caSubject,
      actions: {
        generateSerialNumber: async () => sthis.nextId(32).str,
      },
    });

    // Generate the self-signed certificate by issuing a certificate for the CA itself
    const issueCertResult = await deviceCA.issueCertificate({
      csr: {
        subject: caSubject,
        publicKey: await caKey.publicKey(),
        extensions: {
          keyUsage: ["digitalSignature", "keyCertSign", "cRLSign"],
          extendedKeyUsage: [],
        },
      },
    });

    if (issueCertResult.isErr()) {
      return Result.Err(`Error issuing CA certificate: ${issueCertResult.Err()}`);
    }

    const certificateJWT = issueCertResult.Ok().certificateJWT;

    let output: string;

    // Handle environment variable output format
    if (args.envVars) {
      const lines = [`DEVICE_ID_CA_PRIV_KEY=${await sts.jwk2env(jwkPrivate)}`, `DEVICE_ID_CA_CERT=${certificateJWT}`];
      output = lines.join("\n");
    } else if (args.json) {
      // Handle JSON output format
      const jsonOutput = {
        privateKey: jwkPrivate,
        signedCert: certificateJWT,
      };
      output = JSON.stringify(jsonOutput, null, 2);
    } else {
      // Human-readable output
      const lines: string[] = [];

      // Output the private key
      lines.push("\n--- CA Private Key (JWK) ---");
      lines.push(JSON.stringify(jwkPrivate, null, 2));
      lines.push("---\n");

      // Output the certificate
      lines.push("\n--- CA Certificate (JWT) ---");
      lines.push(certificateJWT);
      lines.push("---\n");

      // Print certificate details
      lines.push("\nCA Certificate Details:");
      lines.push(`  Common Name: ${caSubject.commonName}`);
      lines.push(`  Organization: ${caSubject.organization}`);
      lines.push(`  Locality: ${caSubject.locality}`);
      lines.push(`  State: ${caSubject.stateOrProvinceName}`);
      lines.push(`  Country: ${caSubject.countryName}`);
      const fingerprint = await caKey.fingerPrint();
      lines.push(`  Key Fingerprint: ${fingerprint}`);

      // Save to files if requested
      if (args.outputKey) {
        lines.push(`\n✓ Private key saved to ${args.outputKey}`);
      }
      if (args.outputCert) {
        await fs.writeFile(args.outputCert, certificateJWT, "utf8");
        lines.push(`✓ Certificate saved to ${args.outputCert}`);
      }

      if (!args.outputKey && !args.keyFile) {
        lines.push("\n⚠️  Warning: Private key was not saved to a file. Consider using --output-key to save it.");
      }

      output = lines.join("\n");
    }

    return sendMsg(ctx, {
      type: "core-cli.res-device-id-ca-cert",
      output,
    } satisfies ResDeviceIdCaCert);
  },
};

// --- Device ID Register ---

export const ReqDeviceIdRegister = type({
  type: "'core-cli.device-id-register'",
});
export type ReqDeviceIdRegister = typeof ReqDeviceIdRegister.infer;

export const ResDeviceIdRegister = type({
  type: "'core-cli.res-device-id-register'",
  output: "string",
});
export type ResDeviceIdRegister = typeof ResDeviceIdRegister.infer;

export function isResDeviceIdRegister(u: unknown): u is ResDeviceIdRegister {
  return !(ResDeviceIdRegister(u) instanceof type.errors);
}

export const deviceIdRegisterEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqDeviceIdRegister, ResDeviceIdRegister> = {
  hash: "core-cli.device-id-register",
  validate: (ctx) => {
    if (!(ReqDeviceIdRegister(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqDeviceIdRegister)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDeviceIdRegister, ResDeviceIdRegister>,
  ): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.request.cmdTs.raw as {
      commonName: string;
      organization: string;
      locality: string;
      state: string;
      country: string;
      caUrl: string;
      port: string;
      timeout: string;
      forceRenew: boolean;
    };

    const keyBag = await getKeyBag(sthis);
    const existingDeviceIdResult = await keyBag.getDeviceId();

    // Check if certificate already exists
    if (existingDeviceIdResult.cert.IsSome() && !args.forceRenew) {
      const jwk = existingDeviceIdResult.deviceId.unwrap();
      const deviceIdKey = (await DeviceIdKey.createFromJWK(jwk)).unwrap();
      const fingerprint = await deviceIdKey.fingerPrint();
      return sendMsg(ctx, {
        type: "core-cli.res-device-id-register",
        output: [
          "Device already has a certificate. Registration not needed.",
          "Use --force-renew to renew the certificate.",
          `Existing Device ID Fingerprint: ${fingerprint}`,
        ].join("\n"),
      } satisfies ResDeviceIdRegister);
    }

    if (args.forceRenew && existingDeviceIdResult.cert.IsSome()) {
      console.log("Force renewing certificate...");
    }

    // Step 1: Create or get device ID key
    let deviceIdKey: DeviceIdKey;
    if (existingDeviceIdResult.deviceId.IsNone()) {
      console.log("Creating new device ID key pair...");
      deviceIdKey = await DeviceIdKey.create();
      const jwkPrivate = await deviceIdKey.exportPrivateJWK();
      await keyBag.setDeviceId(jwkPrivate);
      const fingerprint = await deviceIdKey.fingerPrint();
      console.log(`Created Device ID Fingerprint: ${fingerprint}`);
    } else {
      console.log("Using existing device ID key...");
      const jwkPrivate = existingDeviceIdResult.deviceId.unwrap();
      const createResult = await DeviceIdKey.createFromJWK(jwkPrivate);
      if (createResult.isErr()) {
        return Result.Err(`Error loading existing device ID: ${createResult.Err()}`);
      }
      deviceIdKey = createResult.Ok();
      const fingerprint = await deviceIdKey.fingerPrint();
      console.log(`Device ID Fingerprint: ${fingerprint}`);
    }

    // Step 2: Generate CSR
    console.log("Generating Certificate Signing Request (CSR)...");
    const deviceIdCSR = new DeviceIdCSR(sthis, deviceIdKey);
    const subject = buildSubject(args);
    const csrResult = await deviceIdCSR.createCSR(subject);

    if (csrResult.isErr()) {
      return Result.Err(`Failed to generate CSR: ${csrResult.Err()}`);
    }

    const csrJWS = csrResult.Ok();
    console.log("CSR generated successfully.");

    // Step 3: Start local server on specified or random port with Future for cert
    const certFuture = new Future<string>();
    const app = new Hono();
    let serverInstance: ReturnType<typeof serve> | null = null;

    app.get("/cert", (c) => {
      const cert = c.req.query("cert");
      if (!cert) {
        certFuture.reject(new Error("Missing cert parameter"));
        return c.text("Missing cert parameter", 400);
      }
      console.log("\nCertificate received from CA!");
      certFuture.resolve(cert);
      return c.text("Certificate received successfully. You can close this window.");
    });

    // Determine port: use specified port or generate random one
    const port = args.port ? parseInt(args.port, 10) : Math.floor(Math.random() * (65535 - 49152) + 49152);
    const callbackUrl = `http://localhost:${port}/cert`;

    console.log(`Starting local server on port ${port}...`);
    serverInstance = serve({
      fetch: app.fetch,
      port,
    });

    // Step 4: Encode CSR as base64 and construct CA URL using BuildURI
    const caUri = BuildURI.from(args.caUrl).setParam("csr", csrJWS).setParam("returnUrl", callbackUrl);
    const caUrlWithParams = caUri.toString();

    console.log(`\nOpening browser to CA for certificate signing...`);
    console.log(`URL: ${caUrlWithParams}\n`);

    // Step 5: Open browser
    try {
      await open(caUrlWithParams);
    } catch (error) {
      console.log("Could not automatically open browser. Please open this URL manually:");
      console.log(caUrlWithParams);
    }

    // Step 6: Wait for certificate with timeout
    console.log("Waiting for certificate from CA...");
    console.log("(The browser should redirect back to this application after signing)\n");

    const timeoutMs = parseInt(args.timeout, 10) * 1000;
    const result = await timeouted(certFuture.asPromise(), { timeout: timeoutMs });

    // Close server
    if (serverInstance) {
      serverInstance.close();
    }

    if (!isSuccess(result)) {
      if (isTimeout(result)) {
        return Result.Err(`Timeout waiting for certificate from CA (${args.timeout}s).`);
      } else {
        return Result.Err(`Failed to receive certificate: ${result.state === "error" ? result.error : result}`);
      }
    }

    const receivedCert = result.value;

    // Step 7: Store certificate (cert is a base64 string, not PEM)
    console.log("Storing certificate...");
    const decoded = decodeJwt(receivedCert);
    const certPayload = CertificatePayloadSchema.parse(decoded);

    const jwkPrivate = await deviceIdKey.exportPrivateJWK();
    const certToStore = {
      certificateJWT: receivedCert,
      certificatePayload: certPayload,
    };

    await keyBag.setDeviceId(jwkPrivate, certToStore);

    const fingerprint = await deviceIdKey.fingerPrint();
    return sendMsg(ctx, {
      type: "core-cli.res-device-id-register",
      output: [
        "\n✓ Registration complete! Certificate successfully stored with Device ID.",
        `Device ID Fingerprint: ${fingerprint}`,
      ].join("\n"),
    } satisfies ResDeviceIdRegister);
  },
};

// --- Slim cmd-ts commands ---

export function deviceIdCmd(ctx: CliCtx) {
  const createCmd = command({
    name: "create",
    description: "Generate a new device ID key pair and store it.",
    args: {
      force: flag({
        long: "force",
        short: "f",
        description: "Force creation of a new device ID, overwriting any existing one.",
      }),
    },
    handler: ctx.cliStream.enqueue(async () => {
      return {
        type: "core-cli.device-id-create",
      } satisfies ReqDeviceIdCreate;
    }),
  });

  const csrCmd = command({
    name: "csr",
    description: "Generate a Certificate Signing Request (CSR) for the current device ID.",
    args: subjectOptions(),
    handler: ctx.cliStream.enqueue(async () => {
      return {
        type: "core-cli.device-id-csr",
      } satisfies ReqDeviceIdCsr;
    }),
  });

  const exportCmd = command({
    name: "export",
    description: "Export the public and private parts of the current device ID.",
    args: {
      private: flag({
        long: "private",
        short: "p",
        description: "Export only the private key. Use with caution!",
      }),
      json: flag({
        long: "json",
        description: "Output in single-line JSON format.",
      }),
      public: flag({
        long: "public",
        description: "Export only the public key. Default if no other flags specified for key type.",
      }),
      cert: flag({
        long: "cert",
        description: "Export the certificate if available.",
      }),
    },
    handler: ctx.cliStream.enqueue(async () => {
      return {
        type: "core-cli.device-id-export",
      } satisfies ReqDeviceIdExport;
    }),
  });

  const certCmd = command({
    name: "cert",
    description: "Import and store a signed certificate for the current device ID.",
    args: {
      file: option({
        long: "file",
        short: "f",
        description: "Path to the certificate file. If not provided, reads from stdin.",
        type: string,
        defaultValue: () => "",
      }),
    },
    handler: ctx.cliStream.enqueue(async () => {
      return {
        type: "core-cli.device-id-cert",
      } satisfies ReqDeviceIdCert;
    }),
  });

  const caCertCmd = command({
    name: "ca-cert",
    description: "Create a self-signed CA certificate for use in DeviceIdCA.",
    args: {
      ...subjectOptions(),
      keyFile: option({
        long: "key-file",
        short: "k",
        description: "Path to existing private key file (JWK format). If not provided, a new key will be generated.",
        type: string,
        defaultValue: () => "",
      }),
      outputKey: option({
        long: "output-key",
        description: "Path to save the private key (JWK format). Only used when generating a new key.",
        type: string,
        defaultValue: () => "",
      }),
      outputCert: option({
        long: "output-cert",
        description: "Path to save the certificate (JWT format). If not provided, outputs to stdout.",
        type: string,
        defaultValue: () => "",
      }),
      json: flag({
        long: "json",
        description: "Output in JSON format with both privateKey and signedCert.",
      }),
      envVars: flag({
        long: "envVars",
        description: "Output as environment variables (DEVICE_ID_CA_PRIV_KEY and DEVICE_ID_CA_CERT).",
      }),
    },
    handler: ctx.cliStream.enqueue(async () => {
      return {
        type: "core-cli.device-id-ca-cert",
      } satisfies ReqDeviceIdCaCert;
    }),
  });

  const registerCmd = command({
    name: "register",
    description: "Register device by creating key pair, generating CSR, and obtaining certificate from CA.",
    args: {
      ...subjectOptions(),
      caUrl: option({
        long: "ca-url",
        description: "CA URL to open in browser for certificate signing",
        type: string,
        defaultValue: () => "http://localhost:7370/fp/cloud/csr2cert",
      }),
      port: option({
        long: "port",
        description: "Local port for callback server (random port if not specified)",
        type: string,
        defaultValue: () => "",
      }),
      timeout: option({
        long: "timeout",
        description: "Timeout in seconds to wait for certificate from CA",
        type: string,
        defaultValue: () => "60",
      }),
      forceRenew: flag({
        long: "force-renew",
        description: "Force certificate renewal even if one already exists",
      }),
    },
    handler: ctx.cliStream.enqueue(async () => {
      return {
        type: "core-cli.device-id-register",
      } satisfies ReqDeviceIdRegister;
    }),
  });

  return subcommands({
    name: "device-id",
    description: "Manage device identities.",
    cmds: {
      create: createCmd,
      csr: csrCmd,
      export: exportCmd,
      cert: certCmd,
      "ca-cert": caCertCmd,
      register: registerCmd,
    },
  });
}
