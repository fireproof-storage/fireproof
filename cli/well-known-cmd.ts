/* eslint-disable no-console */
import { SuperThis } from "@fireproof/core-types-base";
import * as rt from "@fireproof/core-runtime";
import { command, restPositionals, string, option, flag } from "cmd-ts";
import { exportSPKI } from "jose";

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
      jsons: flag({
        long: "jsons",
        description: "Output as single-line quoted JSON string",
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
      presetKey: option({
        type: string,
        long: "presetKey",
        defaultValue: () => "",
        description: "Preset key to include (will be processed with coerceJWKPublic)",
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

      // Process presetKey if provided
      const presetKeys = args.presetKey ? await rt.sts.coerceJWKPublic(_sthis, args.presetKey) : [];

      // Fetch from URLs if provided
      const results =
        urls.length > 0
          ? await rt.sts.fetchWellKnownJwks(urls, {
              fetchTimeoutMs: 5000,
            })
          : [];

      if (urls.length === 0 && presetKeys.length === 0) {
        console.error("Error: At least one URL or presetKey must be provided");
        process.exit(1);
      }

      // Determine format - default to json if no flag specified
      // If combine is set, default to jsons; if env-prefix is set to non-default value, use env format
      const hasCustomEnvPrefix = args.envPrefix !== "CLERK_PUB_JWT_KEY";
      const format = args.pem ? "pem" : args.env || hasCustomEnvPrefix ? "env" : args.jsons ? "jsons" : "json";

      // Combine all keys from preset and URLs, removing duplicates by kid
      const keyMap = new Map();

      // Add preset keys first
      for (const key of presetKeys) {
        if (key.kid) {
          keyMap.set(key.kid, key);
        } else {
          // If no kid, add it anyway (won't dedupe)
          keyMap.set(JSON.stringify(key), key);
        }
      }

      // Add keys from URLs
      for (const result of results) {
        if (result.type === "ok") {
          for (const key of result.keys) {
            if (key.kid) {
              keyMap.set(key.kid, key);
            } else {
              // If no kid, add it anyway (won't dedupe)
              keyMap.set(JSON.stringify(key), key);
            }
          }
        }
      }

      const combinedOutput = { keys: Array.from(keyMap.values()) };
      switch (format) {
        case "json":
          console.log(JSON.stringify(combinedOutput, null, 2));
          break;
        case "pem":
          {
            for (const jwk of combinedOutput.keys) {
              const rKey = await rt.sts.importJWK(jwk);
              if (rKey.isErr()) {
                console.error(`Error importing JWK: ${rKey.Err()}`);
                process.exit(1);
              }
              console.log(await exportSPKI(rKey.Ok().key));
            }
          }
          break;
        case "env":
          console.log(`${args.envPrefix}=${JSON.stringify(JSON.stringify(combinedOutput))}`);
          break;
        case "jsons":
        default:
          console.log(JSON.stringify(combinedOutput));
          break;
      }
    },
  });
}
