import * as rt from "@fireproof/core-runtime";
import { command, restPositionals, string, option, flag } from "cmd-ts";
import { exportSPKI } from "jose";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "../cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "../cmd-evento.js";

export const ReqWellKnown = type({
  type: "'core-cli.req-well-known'",
  json: "boolean",
  jsons: "boolean",
  pem: "boolean",
  env: "boolean",
  presetKey: "string",
  envPrefix: "string",
  urls: "string[]",
});
export type ReqWellKnown = typeof ReqWellKnown.infer;

export const ResWellKnown = type({
  type: "'core-cli.res-well-known'",
  output: "string",
});
export type ResWellKnown = typeof ResWellKnown.infer;

export function isResWellKnown(u: unknown): u is ResWellKnown {
  return !(ResWellKnown(u) instanceof type.errors);
}

export const wellKnownEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqWellKnown, ResWellKnown> = {
  hash: "core-cli.req-well-known",
  validate: (ctx) => {
    if (!(ReqWellKnown(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqWellKnown)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqWellKnown, ResWellKnown>): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.validated;

    // Split comma-separated URLs
    const urls = args.urls.flatMap((url) => url.split(",").map((u) => u.trim())).filter((u) => u.length > 0);

    // Process presetKey if provided
    const presetKeys = args.presetKey ? await rt.sts.coerceJWKPublic(sthis, args.presetKey) : [];

    // Fetch from URLs if provided
    const results =
      urls.length > 0
        ? await rt.sts.fetchWellKnownJwks(urls, {
            fetchTimeoutMs: 5000,
          })
        : [];

    if (urls.length === 0 && presetKeys.length === 0) {
      return Result.Err("At least one URL or presetKey must be provided");
    }

    // Determine format - default to json if no flag specified
    const hasCustomEnvPrefix = args.envPrefix !== "CLERK_PUB_JWT_KEY";
    const format = args.pem ? "pem" : args.env || hasCustomEnvPrefix ? "env" : args.jsons ? "jsons" : "json";

    // Combine all keys from preset and URLs, removing duplicates by kid
    const keyMap = new Map();

    // Add preset keys first
    for (const key of presetKeys) {
      if (key.kid) {
        keyMap.set(key.kid, key);
      } else {
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
            keyMap.set(JSON.stringify(key), key);
          }
        }
      }
    }

    const combinedOutput = { keys: Array.from(keyMap.values()) };
    let output: string;
    switch (format) {
      case "json":
        output = JSON.stringify(combinedOutput, null, 2);
        break;
      case "pem":
        {
          const pemParts: string[] = [];
          for (const jwk of combinedOutput.keys) {
            const rKey = await rt.sts.importJWK(jwk);
            if (rKey.isErr()) {
              return Result.Err(`Error importing JWK: ${rKey.Err()}`);
            }
            pemParts.push(await exportSPKI(rKey.Ok().key));
          }
          output = pemParts.join("\n");
        }
        break;
      case "env":
        output = `${args.envPrefix}=${JSON.stringify(JSON.stringify(combinedOutput))}`;
        break;
      case "jsons":
      default:
        output = JSON.stringify(combinedOutput);
        break;
    }

    return sendMsg(ctx, {
      type: "core-cli.res-well-known",
      output,
    } satisfies ResWellKnown);
  },
};

export function wellKnownCmd(ctx: CliCtx) {
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
    handler: ctx.cliStream.enqueue((args) => {
      return {
        type: "core-cli.req-well-known",
        ...args,
      };
    }),
  });
}
