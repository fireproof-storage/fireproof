import { JWKPrivate, JWKPrivateSchema, JWKPublic, JWKPublicSchema, SuperThis } from "@fireproof/core-types-base";
import * as rt from "@fireproof/core-runtime";
import { command, flag, option, string } from "cmd-ts";
import { exportJWK } from "jose/key/export";
import { Result, exception2Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { z } from "zod/v4";
import { type } from "arktype";
import { CliCtx } from "../cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "../cmd-evento.js";

async function ourToJWK(env: string, sthis: SuperThis): Promise<Result<{ keys: (JWKPublic | JWKPrivate)[] }>> {
  const rCryptoKeys = await exception2Result(() => rt.sts.env2jwk(env, undefined, sthis));
  if (rCryptoKeys.isErr()) {
    return Result.Err(rCryptoKeys);
  }
  const cryptoKeys = rCryptoKeys.Ok();

  // Convert each key individually for better error reporting
  const keys: (JWKPrivate | JWKPublic)[] = [];
  for (const key of cryptoKeys) {
    const rKey = await exception2Result(() => exportJWK(key));
    if (rKey.isErr()) {
      return Result.Err(rKey);
    }
    const parsed = z.union([JWKPublicSchema, JWKPrivateSchema]).safeParse(rKey.Ok());
    if (!parsed.success) {
      return Result.Err(`Invalid JWK public key: ${parsed.error.message}`);
    }
    keys.push(parsed.data);
  }

  return Result.Ok({ keys });
}

export const ReqKey = type({
  type: "'core-cli.key'",
  generatePair: "boolean",
  ourToJWK: "string",
  JWKToour: "string",
});
export type ReqKey = typeof ReqKey.infer;

export const ResKey = type({
  type: "'core-cli.res-key'",
  output: "string",
});
export type ResKey = typeof ResKey.infer;

export function isResKey(u: unknown): u is ResKey {
  return !(ResKey(u) instanceof type.errors);
}

export const keyEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqKey, ResKey> = {
  hash: "core-cli.key",
  validate: (ctx) => {
    if (!(ReqKey(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqKey)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqKey, ResKey>): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.validated;

    let output: string;
    switch (true) {
      case !!args.ourToJWK:
        {
          const r = await ourToJWK(args.ourToJWK, sthis);
          if (r.isErr()) {
            return Result.Err(r.Err());
          }
          output = JSON.stringify(r.Ok(), null, 2);
        }
        break;
      case args.generatePair:
        {
          const key = await rt.sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });
          output = [
            `${rt.sts.envKeyDefaults.PUBLIC}=${key.strings.publicKey}`,
            `${rt.sts.envKeyDefaults.SECRET}=${key.strings.privateKey}`,
          ].join("\n");
        }
        break;
      default:
        return Result.Err("No action specified");
    }

    return sendMsg(ctx, {
      type: "core-cli.res-key",
      output,
    } satisfies ResKey);
  },
};

export function keyCmd(ctx: CliCtx) {
  return command({
    name: "cli-key-cmds",
    description: "handle keys for cloud token generation",
    version: "1.0.0",
    args: {
      generatePair: flag({
        long: "generatePair",
        short: "g",
      }),
      ourToJWK: option({
        long: "ourToJWK",
        short: "o",
        defaultValue: () => "",
        type: string,
      }),
      JWKToour: option({
        long: "JWKToour",
        short: "j",
        defaultValue: () => "",
        type: string,
      }),
    },
    handler: ctx.cliStream.enqueue((args) => {
      return {
        type: "core-cli.key",
        ...args,
      };
    }),
  });
}
