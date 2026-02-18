/* eslint-disable no-console */
import { command, option, string, subcommands, flag } from "cmd-ts";
import { SuperThis, Subject, CertificatePayloadSchema, JWKPublic, JWKPrivate } from "@fireproof/core-types-base";
import { DeviceIdKey, DeviceIdCSR, DeviceIdCA } from "@fireproof/core-device-id";
import { getKeyBag } from "@fireproof/core-keybag";
import { decodeJwt } from "jose";
import fs from "fs-extra";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import open from "open";
import { Future, timeouted, isSuccess, isTimeout, BuildURI } from "@adviser/cement";
import { sts } from "@fireproof/core-runtime";

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

export function deviceIdCmd(sthis: SuperThis) {
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
    handler: async function (args) {
      try {
        const keyBag = await getKeyBag(sthis);
        const existingDeviceIdResult = await keyBag.getDeviceId();

        if (existingDeviceIdResult.deviceId.IsSome() && !args.force) {
          // Device ID exists and --force not provided
          const jwk = existingDeviceIdResult.deviceId.unwrap();
          const deviceIdKey = (await DeviceIdKey.createFromJWK(jwk)).unwrap();
          const fingerprint = await deviceIdKey.fingerPrint();
          console.log(`Existing Device ID Fingerprint: ${fingerprint}`);
          process.exit(0); // Exit gracefully only in this condition
          return; // Ensure return after exit
        }

        // If no device ID exists OR --force is provided, proceed with creation
        const deviceIdKey = await DeviceIdKey.create();
        const jwkPrivate = await deviceIdKey.exportPrivateJWK();

        await keyBag.setDeviceId(jwkPrivate);
        const fingerprint = await deviceIdKey.fingerPrint();
        console.log(`Created Device ID Fingerprint: ${fingerprint}`);
        console.log("To generate a Certificate Signing Request (CSR), run: core-cli deviceId csr"); // Re-added this line
        console.log("To export the public and private keys, run: core-cli deviceId export"); // Re-added this line
      } catch (error) {
        console.error("An error occurred during device ID creation:", error);
        process.exit(1);
      }
    },
  });

  const csrCmd = command({
    name: "csr",
    description: "Generate a Certificate Signing Request (CSR) for the current device ID.",
    args: subjectOptions(),
    handler: async function (args) {
      try {
        const keyBag = await getKeyBag(sthis);
        const existingDeviceIdResult = await keyBag.getDeviceId();

        if (existingDeviceIdResult.deviceId.IsNone()) {
          console.error("No Device ID found. Please create one using 'core-cli deviceId create' first.");
          process.exit(1);
          return;
        }

        const jwkPrivate = existingDeviceIdResult.deviceId.unwrap();
        const createResult = await DeviceIdKey.createFromJWK(jwkPrivate);
        if (createResult.isErr()) {
          console.error("Error loading existing device ID:", createResult.Err());
          process.exit(1);
        }
        const deviceIdKey = createResult.Ok();

        const deviceIdCSR = new DeviceIdCSR(sthis, deviceIdKey);
        const subject = buildSubject(args);
        const csrResult = await deviceIdCSR.createCSR(subject);

        if (csrResult.isOk()) {
          console.log("\n--- Certificate Signing Request (CSR) ---");
          console.log(csrResult.Ok());
          console.log("---\n");
          console.log("Please send the above CSR to your Certificate Authority (CA) to get a signed certificate.");
          console.log("Once you receive the certificate, you can use a future command to import it.");
        } else {
          console.error("Failed to generate CSR:", csrResult.Err());
          process.exit(1);
        }
      } catch (error) {
        console.error("An error occurred during CSR generation:", error);
        process.exit(1);
      }
    },
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
    handler: async function (args) {
      try {
        const keyBag = await getKeyBag(sthis);
        const existingDeviceIdResult = await keyBag.getDeviceId();

        if (existingDeviceIdResult.deviceId.IsNone()) {
          console.error("No Device ID found. Please create one using 'core-cli deviceId create' first.");
          process.exit(1);
          return;
        }

        const jwkPrivate = existingDeviceIdResult.deviceId.unwrap();
        const createResult = await DeviceIdKey.createFromJWK(jwkPrivate);
        if (createResult.isErr()) {
          console.error("Error loading device ID:", createResult.Err());
          process.exit(1);
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
          console.error("No certificate found for this Device ID.");
          process.exit(1);
        }

        if (args.json) {
          const outputObject: { publicKey?: JWKPublic; privateKey?: JWKPrivate; certificate?: string; fingerprint?: string } = {};
          if (publicKey) outputObject.publicKey = publicKey;
          if (privateKey) outputObject.privateKey = privateKey;
          if (certificate) outputObject.certificate = certificate.certificateJWT;
          console.log(JSON.stringify(outputObject));
        } else {
          // Human-readable output
          console.log("--- Device ID Export ---");
          const fingerprint = await deviceIdKey.fingerPrint();
          console.log(`Fingerprint: ${fingerprint}`);

          if (publicKey) {
            console.log("\nPublic Key (JWK):");
            console.log(JSON.stringify(publicKey, null, 2));
          }
          if (privateKey) {
            console.log("\nPrivate Key (JWK):");
            console.log(JSON.stringify(privateKey, null, 2));
          }
          if (certificate) {
            console.log("\nCertificate (JWT):");
            console.log(certificate.certificateJWT);
          }
          console.log("---\n");
        }
      } catch (error) {
        console.error("An error occurred during export:", error);
        process.exit(1);
      }
    },
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
    handler: async function (args) {
      try {
        const keyBag = await getKeyBag(sthis);
        const existingDeviceIdResult = await keyBag.getDeviceId();

        if (existingDeviceIdResult.deviceId.IsNone()) {
          console.error("No Device ID found. Please create one using 'core-cli deviceId create' first.");
          process.exit(1);
          return;
        }

        const jwkPrivate = existingDeviceIdResult.deviceId.unwrap();
        let certificateContent: string;

        if (args.file) {
          certificateContent = await fs.readFile(args.file, "utf8");
          console.log(`Certificate read from ${args.file}`);
        } else {
          console.log("Waiting for certificate content from stdin (Ctrl+D to finish):");
          certificateContent = await getStdin();
          console.log("Certificate read from stdin.");
        }

        const decoded = decodeJwt(certificateContent);
        const certPayload = CertificatePayloadSchema.parse(decoded);

        const certToStore = {
          certificateJWT: certificateContent,
          certificatePayload: certPayload,
        };

        await keyBag.setDeviceId(jwkPrivate, certToStore);
        console.log("Certificate successfully stored with the Device ID.");
      } catch (error) {
        console.error("An error occurred during certificate import:", error);
        process.exit(1);
      }
    },
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
    handler: async function (args) {
      try {
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
            console.error("Error loading private key from file:", keyResult.Err());
            process.exit(1);
            return;
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
          console.error("Error issuing CA certificate:", issueCertResult.Err());
          process.exit(1);
          return;
        }

        const certificateJWT = issueCertResult.Ok().certificateJWT;

        // Handle environment variable output format
        if (args.envVars) {
          console.log(`DEVICE_ID_CA_PRIV_KEY=${await sts.jwk2env(jwkPrivate)}`);
          console.log(`DEVICE_ID_CA_CERT=${certificateJWT}`);
        } else if (args.json) {
          // Handle JSON output format
          const jsonOutput = {
            privateKey: jwkPrivate,
            signedCert: certificateJWT,
          };
          console.log(JSON.stringify(jsonOutput, null, 2));
        } else {
          // Human-readable output

          // Output the private key
          log("\n--- CA Private Key (JWK) ---");
          log(JSON.stringify(jwkPrivate, null, 2));
          log("---\n");

          // Output the certificate
          log("\n--- CA Certificate (JWT) ---");
          log(certificateJWT);
          log("---\n");

          // Print certificate details
          log("\nCA Certificate Details:");
          log(`  Common Name: ${caSubject.commonName}`);
          log(`  Organization: ${caSubject.organization}`);
          log(`  Locality: ${caSubject.locality}`);
          log(`  State: ${caSubject.stateOrProvinceName}`);
          log(`  Country: ${caSubject.countryName}`);
          const fingerprint = await caKey.fingerPrint();
          log(`  Key Fingerprint: ${fingerprint}`);

          // Save to files if requested
          if (args.outputKey) {
            log(`\n✓ Private key saved to ${args.outputKey}`);
          }
          if (args.outputCert) {
            await fs.writeFile(args.outputCert, certificateJWT, "utf8");
            log(`✓ Certificate saved to ${args.outputCert}`);
          }

          if (!args.outputKey && !args.keyFile) {
            log("\n⚠️  Warning: Private key was not saved to a file. Consider using --output-key to save it.");
          }
        }
      } catch (error) {
        console.error("An error occurred during CA certificate creation:", error);
        process.exit(1);
      }
    },
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
    handler: async function (args) {
      try {
        const keyBag = await getKeyBag(sthis);
        const existingDeviceIdResult = await keyBag.getDeviceId();

        // Check if certificate already exists
        if (existingDeviceIdResult.cert.IsSome() && !args.forceRenew) {
          console.log("Device already has a certificate. Registration not needed.");
          console.log("Use --force-renew to renew the certificate.");
          const jwk = existingDeviceIdResult.deviceId.unwrap();
          const deviceIdKey = (await DeviceIdKey.createFromJWK(jwk)).unwrap();
          const fingerprint = await deviceIdKey.fingerPrint();
          console.log(`Existing Device ID Fingerprint: ${fingerprint}`);
          process.exit(0);
          return;
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
            console.error("Error loading existing device ID:", createResult.Err());
            process.exit(1);
            return;
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
          console.error("Failed to generate CSR:", csrResult.Err());
          process.exit(1);
          return;
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
        // const csrBase64 = sthis.txt.base64.encode(sthis.txt.encode(csrPEM));
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
            console.error(`Timeout waiting for certificate from CA (${args.timeout}s).`);
          } else {
            console.error("Failed to receive certificate:", result.state === "error" ? result.error : result);
          }
          process.exit(1);
          return;
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
        console.log("\n✓ Registration complete! Certificate successfully stored with Device ID.");

        const fingerprint = await deviceIdKey.fingerPrint();
        console.log(`Device ID Fingerprint: ${fingerprint}`);
      } catch (error) {
        console.error("An error occurred during registration:", error);
        process.exit(1);
      }
    },
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
