/* eslint-disable no-console */
import { SuperThis } from "@fireproof/core-types-base";
import * as rt from "@fireproof/core-runtime";
import { command, restPositionals, string, option, flag } from "cmd-ts";
import { exportSPKI, importJWK } from "jose";

export function wellKnownCmd(_sthis: SuperThis) {
  return command({
    name: "well-known",
    description: "Fetch well-known JWKS from URLs",
    version: "1.0.0",
    args: {
      json: flag({
        long: "json",
        description: "Output as JSON (default)",
        defaultValue: () => false,
      }),
      pem: flag({
        long: "pem",
        description: "Output as PEM format per key",
        defaultValue: () => false,
      }),
      env: flag({
        long: "env",
        description: "Output as environment variables with single-lined PEM",
        defaultValue: () => false,
      }),
      envPrefix: option({
        type: string,
        long: "env-prefix",
        defaultValue: () => "CLERK_PUB_JWT_KEY",
        description: "Prefix for environment variable names (used with --env)",
      }),
      urls: restPositionals({
        type: string,
        displayName: "urls",
        description: "URLs to fetch well-known JWKS from",
      }),
    },
    handler: async (args) => {
      // Split comma-separated URLs
      const urls = args.urls.flatMap((url) => url.split(",").map((u) => u.trim())).filter((u) => u.length > 0);

      if (urls.length === 0) {
        console.error("Error: At least one URL must be provided");
        process.exit(1);
      }

      const results = await rt.sts.fetchWellKnownJwks(urls, {
        fetch: globalThis.fetch,
        fetchTimeoutMs: 5000,
      });

      // Determine format - default to json if no flag specified
      // If env-prefix is set to non-default value, use env format
      const hasCustomEnvPrefix = args.envPrefix !== "CLERK_PUB_JWT_KEY";
      const format = args.pem ? "pem" : args.env || hasCustomEnvPrefix ? "env" : "json";

      if (format === "json") {
        console.log(JSON.stringify(results, null, 2));
      } else if (format === "pem") {
        for (const result of results) {
          if (result.type === "ok") {
            console.log(`# Keys from ${result.url}`);
            for (const key of result.keys) {
              try {
                const cryptoKey = await rt.sts.coerceJWKPublic(_sthis, key)[0];
                const importedKey = await importJWK(cryptoKey);
                const pem = await exportSPKI(importedKey as CryptoKey);
                console.log(pem);
              } catch (error) {
                console.error(`Error converting key to PEM: ${error}`);
              }
            }
          } else {
            console.error(`Error fetching ${result.url}: ${result.type === "timeout" ? "timeout" : result.error}`);
          }
        }
      } else if (format === "env") {
        let keyIndex = 0;
        for (const result of results) {
          if (result.type === "ok") {
            for (const key of result.keys) {
              try {
                const cryptoKey = await rt.sts.coerceJWKPublic(_sthis, key)[0];
                const importedKey = await importJWK(cryptoKey);
                const pem = await exportSPKI(importedKey as CryptoKey);
                const singleLinePem = JSON.stringify(pem);
                const envVarName = keyIndex === 0 ? args.envPrefix : `${args.envPrefix}_${keyIndex}`;
                console.log(`${envVarName}=${singleLinePem}`);
                keyIndex++;
              } catch (error) {
                console.error(`# Error converting key to PEM: ${error}`);
              }
            }
          } else {
            console.error(`# Error fetching ${result.url}: ${result.type === "timeout" ? "timeout" : result.error}`);
          }
        }
      }
    },
  });
}
